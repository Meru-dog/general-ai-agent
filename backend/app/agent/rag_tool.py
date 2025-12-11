# RAG を LangGraph から利用できるようにするラッパー
from typing import List, Dict
from app.rag.retriever import RAGRetriever

def run_rag(query: str) -> List[Dict]:
    """
    LangGraph ノードから呼び出せる RAG 関数
    """
    try:
        retriever = RAGRetriever()
        return retriever.search(query, n_results=8)
    except Exception as e:
        print(f"警告: RAG検索中にエラーが発生しました: {e}")
        return []