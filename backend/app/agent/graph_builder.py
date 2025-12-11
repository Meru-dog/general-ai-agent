# LangGraph でノードをつなぎ、エージェントを構築する

from langgraph.graph import StateGraph, END
from app.agent.types import AgentState
from app.agent.nodes import (
    analyze_intent,
    run_rag_if_needed,
    run_web_search_if_needed,
    generate_answer,
)



def create_agent_graph():
    workflow = StateGraph(AgentState)

    workflow.add_node("analysis", analyze_intent)
    workflow.add_node("rag", run_rag_if_needed)
    workflow.add_node("web_search", run_web_search_if_needed)
    workflow.add_node("answer", generate_answer)

    workflow.set_entry_point("analysis")

    # analysis → rag → web_search → answer → END
    workflow.add_edge("analysis", "rag")
    workflow.add_edge("rag", "web_search")
    workflow.add_edge("web_search", "answer")
    workflow.add_edge("answer", END)

    return workflow.compile()


# シングルトンとして保持
agent_executor = create_agent_graph()
