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
        self.client = chromadb.PersistentClient(
            path=str(config.CHROMA_DIR)
        )

        # Cohere などにも差し替え可能
        self.embedding_func = embedding_functions.OpenAIEmbeddingFunction(
            api_key=config.OPENAI_API_KEY,
            model_name=config.EMBEDDING_MODEL,
        )

        # コレクション取得（既存 or 作成）
        self.collection = self.client.get_or_create_collection(
            name=config.CHROMA_COLLECTION,
            embedding_function=self.embedding_func,
        )
        count = self.collection.count()
        print(f"[RAGRetriever] collection='{config.CHROMA_COLLECTION}', "
              f"path='{config.CHROMA_DIR}', count={count}")

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
        # Chromaの検索メソッド
        results = self.collection.query(
            query_texts=[query],
            n_results=n_results
        )

        docs = []
        # results["documents"] は 2次元配列 → [query_index][doc_index]
        for metadatas, docs_list, distances in zip(
            results["metadatas"], results["documents"], results["distances"]
        ):
            for meta, doc, dist in zip(metadatas, docs_list, distances):
                docs.append({
                    "document_id": meta.get("document_id"),
                    "document_title": meta.get("document_title"),
                    "snippet": doc,
                    "score": float(1.0 - dist),  # 類似度に変換
                })

        return docs
