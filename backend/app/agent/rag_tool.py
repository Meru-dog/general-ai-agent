# RAG を LangGraph から利用できるようにするラッパー
from typing import List, Dict
from app.rag.retriever import RAGRetriever

# グローバルで RAGRetriever を初期化
# ※インデックスは backend 起動時に既に構築済み
rag = None
try:
    rag = RAGRetriever()
except Exception as e:
    print(f"警告: rag_tool.py での RAGRetriever の初期化に失敗しました: {e}")

def run_rag(query: str) -> List[Dict]:
    """
    LangGraph ノードから呼び出せる RAG 関数
    - query: ユーザーの質問
    - return: 検索結果のリスト
    """
    if rag is None:
        print("警告: RAGRetriever が初期化されていません")
        return []
    try:
        return rag.search(query)
    except Exception as e:
        print(f"警告: RAG検索中にエラーが発生しました: {e}")
        return []
