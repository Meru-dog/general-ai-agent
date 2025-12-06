# RAG を LangGraph から利用できるようにするラッパー
from typing import List, Dict
from app.rag.retriever import RAGRetriever

# グローバルで RAGRetriever を初期化
# ※インデックスは backend 起動時に既に構築済み
rag = RAGRetriever()

def run_rag(query: str) -> List[Dict]:
    """
    LangGraph ノードから呼び出せる RAG 関数
    - query: ユーザーの質問
    - return: 検索結果のリスト
    """
    return rag.search(query)
