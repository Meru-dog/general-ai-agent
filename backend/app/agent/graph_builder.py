# LangGraph でノードをつなぎ、エージェントを構築する

from langgraph.graph import StateGraph, END
from app.agent.types import AgentState
from app.agent.nodes import (
    analyze_intent,
    run_rag_if_needed,
    generate_answer,
)


def create_agent_graph():
    """
    LangGraph の定義を組み立てる関数
    """
    graph = StateGraph(AgentState)

    # ノード登録（左から順に実行）
    graph.add_node("analyze", analyze_intent)
    graph.add_node("rag_or_not", run_rag_if_needed)
    graph.add_node("answer", generate_answer)

    # 実行順序
    graph.set_entry_point("analyze")
    graph.add_edge("analyze", "rag_or_not")
    graph.add_edge("rag_or_not", "answer")
    graph.add_edge("answer", END)

    # 実行可能なGraphへ変換
    return graph.compile()

# シングルトンとして保持
agent_executor = create_agent_graph()
