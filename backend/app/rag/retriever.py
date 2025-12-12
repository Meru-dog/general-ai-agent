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

    def list_documents(self) -> List[Dict]:
        """
        Chroma に入っているメタデータから、
        document_id ごとに {document_id, document_title, chunk_count} を集計して返す。
        """
        try:
            # メタデータだけ全件取得
            data = self.collection.get(include=["metadatas"])
            metadatas = data.get("metadatas", []) or []

            docs_by_id: Dict[str, Dict] = {}

            for meta in metadatas:
                if not meta:
                    continue

                doc_id = meta.get("document_id")
                if not doc_id:
                    # 既存のNDAなど、document_idを持たないものがあればスキップ
                    continue

                title = meta.get("document_title") or "（タイトル不明）"

                if doc_id not in docs_by_id:
                    docs_by_id[doc_id] = {
                        "document_id": doc_id,
                        "document_title": title,
                        "chunk_count": 0,
                    }

                docs_by_id[doc_id]["chunk_count"] += 1

            return list(docs_by_id.values())

        except Exception as e:
            print(f"list_documents 中にエラーが発生しました: {e}")
            import traceback
            print(traceback.format_exc())
            return []

    def delete_document(self, document_id: str) -> int:
        """
        document_id メタデータに紐づくすべてのチャンクを削除し、
        削除したチャンク数を返す。
        """
        try:
            # まず該当するレコードの id を取得
            result = self.collection.get(
                where={"document_id": document_id},
                include=[]
            )
            ids = result.get("ids") or []
            if not ids:
                # 一致するデータなし
                return 0

            # 取得した id 群を削除
            self.collection.delete(ids=ids)

            return len(ids)
        except Exception as e:
            print(f"delete_document 中にエラーが発生しました: {e}")
            import traceback
            print(traceback.format_exc())
            return 0


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