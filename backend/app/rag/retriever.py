# RAG実行のためのクラス
# - ベクトル検索（Chroma）を利用して
#   ユーザーの質問に近い文書チャンクを取り出す

from typing import List, Dict
import chromadb
from chromadb.utils import embedding_functions

from app import config
from app.rag.index_builder import chunk_text


class RAGRetriever:
    def __init__(self):
        """
        Chroma 永続モードでクライアントを初期化
        - config.CHROMA_DIR（=ベクトルDB保存パス）を参照
        - embedding_function（OpenAI）を設定
        """
        try:
            self.client = chromadb.PersistentClient(
                path=str(config.CHROMA_DIR)
            )
        except Exception as e:
            raise RuntimeError(f"ChromaDB クライアントの作成に失敗しました: {e}")

        # OpenAI APIキーのチェック
        if not config.OPENAI_API_KEY:
            raise RuntimeError("OPENAI_API_KEY が設定されていません。環境変数を確認してください。")

        # Cohere などにも差し替え可能
        try:
            self.embedding_func = embedding_functions.OpenAIEmbeddingFunction(
                api_key=config.OPENAI_API_KEY,
                model_name=config.EMBEDDING_MODEL,
            )
        except Exception as e:
            raise RuntimeError(f"埋め込み関数の作成に失敗しました: {e}")

        # コレクション取得（既存 or 作成）
        try:
            self.collection = self.client.get_or_create_collection(
                name=config.CHROMA_COLLECTION,
                embedding_function=self.embedding_func,
            )
            count = self.collection.count()
            print(f"[RAGRetriever] collection='{config.CHROMA_COLLECTION}', "
                  f"path='{config.CHROMA_DIR}', count={count}")
            
            # インデックスが空の場合の警告
            if count == 0:
                import warnings
                warnings.warn(
                    f"RAGRetriever: インデックスが空です（count=0）。"
                    f"起動時にインデックスが自動構築されるはずですが、"
                    f"構築に失敗した可能性があります。"
                    f"手動で `python -m app.rag.build_index` を実行してください。",
                    UserWarning
                )
        except Exception as e:
            raise RuntimeError(f"コレクションの取得に失敗しました: {e}")


    def search(self, query: str, n_results: int = 10) -> List[Dict]:
        """
        類似検索を実行して結果を返す関数
        :param query: ユーザー質問
        :param n_results: 取得上限（デフォルト 10）
        :return: [{
            "document_id": "...",
            "document_title": "...",
            "snippet": "...",
            "score": 0.92
        }, ...]
        """
        try:
            collection_count = self.collection.count()
            if collection_count == 0:
                print("警告: インデックスが空のため、検索結果は0件です")
                return []

            # n_results はコレクションの件数を超えないようにしておく
            n = min(n_results, collection_count)

            # Chroma の検索メソッド
            results = self.collection.query(
                query_texts=[query],
                n_results=n,
            )

            # デバッグログ
            raw_docs = results.get("documents") or []
            raw_count = len(raw_docs[0]) if raw_docs else 0
            print(
                f"[RAGRetriever.search] query={query!r}, "
                f"n_results={n}, raw_result_count={raw_count}"
            )

            docs: List[Dict] = []

            if results.get("metadatas") and results.get("documents") and results.get("distances"):
                for metadatas, docs_list, distances in zip(
                    results["metadatas"], results["documents"], results["distances"]
                ):
                    for meta, doc, dist in zip(metadatas, docs_list, distances):
                        title = meta.get("document_title") if meta else "（タイトル不明）"
                        docs.append(
                            {
                                "document_id": meta.get("document_id") if meta else None,
                                "document_title": title,
                                "snippet": doc or "",
                                "score": float(1.0 - dist) if dist is not None else 0.0,
                            }
                        )

            print(
                "[RAGRetriever.search] hits="
                f"{len(docs)}, titles={[d['document_title'] for d in docs]}"
            )

            return docs

        except Exception as e:
            print(f"RAG検索中にエラーが発生しました: {e}")
            import traceback
            print(traceback.format_exc())
            # エラーが発生しても空のリストを返して処理を続行
            return []


    def add_document(self, doc_id: str, title: str, content: str) -> int:
        """
        任意のテキスト文書をチャンク化してコレクションに追加する。
        :param doc_id: 文書ID（ユニークであれば任意）
        :param title: 文書タイトル（表示用）
        :param content: 文書全体のテキスト内容
        :return: 追加されたチャンク数
        """
        chunks = chunk_text(content)
        ids: List[str] = []
        documents: List[str] = []
        metadatas: List[dict] = []

        for idx, chunk in enumerate(chunks):
            chunk_id = f"{doc_id}_chunk_{idx}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "document_id": doc_id,
                    "document_title": title,
                    "chunk_index": idx,
                }
            )

        if not ids:
            return 0

        self.collection.add(
            ids=ids,
            documents=documents,
            metadatas=metadatas,
        )

        # 追加後の総件数をログで確認できるように
        new_count = self.collection.count()
        print(
            f"[RAGRetriever.add_document] doc_id={doc_id}, "
            f"added_chunks={len(ids)}, total_chunks={new_count}"
        )

        return len(ids)