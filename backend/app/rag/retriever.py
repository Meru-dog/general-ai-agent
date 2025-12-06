# RAG実行のためのクラス
# - ベクトル検索（Chroma）を利用して
#   ユーザーの質問に近い文書チャンクを取り出す

from typing import List, Dict
import chromadb
from chromadb.utils import embedding_functions

from app import config


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

    def search(self, query: str, n_results: int = 3) -> List[Dict]:
        """
        類似検索を実行して結果を返す関数
        :param query: ユーザー質問
        :param n_results: 取得上限（デフォルト 3）
        :return: [{
            "document_id": "...",
            "document_title": "...",
            "snippet": "...",
            "score": 0.92
        }, ...]
        """
        try:
            # インデックスが空の場合は空のリストを返す
            if self.collection.count() == 0:
                print("警告: インデックスが空のため、検索結果は0件です")
                return []
            
            # Chromaの検索メソッド
            results = self.collection.query(
                query_texts=[query],
                n_results=n_results
            )

            docs = []
            # results["documents"] は 2次元配列 → [query_index][doc_index]
            if results.get("metadatas") and results.get("documents") and results.get("distances"):
                for metadatas, docs_list, distances in zip(
                    results["metadatas"], results["documents"], results["distances"]
                ):
                    for meta, doc, dist in zip(metadatas, docs_list, distances):
                        docs.append({
                            "document_id": meta.get("document_id") if meta else None,
                            "document_title": meta.get("document_title") if meta else "（タイトル不明）",
                            "snippet": doc if doc else "",
                            "score": float(1.0 - dist) if dist is not None else 0.0,  # 類似度に変換
                        })

            return docs
        except Exception as e:
            print(f"RAG検索中にエラーが発生しました: {e}")
            import traceback
            print(traceback.format_exc())
            # エラーが発生しても空のリストを返して処理を続行
            return []
