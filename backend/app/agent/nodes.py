# 各ステップ（ノード）の処理内容を定義する
from app.agent.types import AgentState, StepLog
from app.rag.retriever import RAGRetriever
from app.agent.rag_tool import run_rag
from app import config

from langchain_openai import ChatOpenAI



# OpenAI LLM（推論用）を初期化
llm = ChatOpenAI(
    model=config.LLM_MODEL,     # 例: "gpt-4.1-mini"
    api_key=config.OPENAI_API_KEY
)

rag_retriever = RAGRetriever()


def analyze_intent(state: AgentState) -> AgentState:
    """
    ユーザー入力の意図をざっくり分類して、
    ・文書依存（手元の documents が前提）
    ・非文書依存（一般知識で回答可）
    のどちらかを state に書き込むノード。
    """

    text = state.input

    # ここはシンプルな例。実際は LLM に判定させてもいい。
    # 例：「この契約書」「以下の文書」「ドキュメント」といった単語があれば文書依存より、としている。
    doc_keywords = ["この契約書", "以下の文書", "ドキュメント", "NDA", "業務委託"]
    if any(k in text for k in doc_keywords):
        intent = "doc_dependent"
        msg = "質問意図解析: 文書依存（手元の documents に基づく回答が必要と判断）"
    else:
        intent = "general"
        msg = "質問意図解析: 非文書依存（一般的な知識・推論で回答可能と判断）"

    state.intent = intent

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="analysis",
            content=msg,
        )
    )

    return state


def should_use_rag(state: AgentState) -> bool:
    """
    analyze_intent で付けたログから、
    「文書依存」か「非文書依存」かを判定して True/False を返す。
    """
    if not state.steps:
        return False  # 念のため

    last_log = state.steps[-1].content  # 直近の分析ログ

    # 「非文書依存」と明示されていたら RAG は使わない
    if "非文書依存" in last_log:
        return False

    # 「文書依存」とだけ書かれている場合に RAG を使う
    if "文書依存" in last_log:
        return True

    # どちらとも判定できない場合はデフォルトで使わない
    return False

def run_rag_if_needed(state: AgentState) -> AgentState:
    """
    state.intent を見て、文書依存なら RAG を実行するノード。
    """
    if getattr(state, "intent", None) != "doc_dependent":
        # 文書依存じゃない → RAGスキップ
        state.steps.append(
            StepLog(
                step_id=len(state.steps) + 1,
                action="rag",
                content="RAGスキップ: 非文書依存と判断されたため、手元文書は参照しませんでした。",
            )
        )
        state.rag_result = []
        return state

    # 文書依存 → RAG 実行
    query = state.input
    results = rag_retriever.search(query)

    titles = [r.get("document_title", "（タイトル不明）") for r in results]
    if results:
        # 例として最大3件までタイトルを表示
        sample_titles = "、".join(titles[:3])
        msg = f"RAG実行: {len(results)}件ヒット（例: {sample_titles}）"
    else:
        msg = "RAG実行: 0件ヒット（関連する手元文書が見つかりませんでした）"

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="rag",
            content=msg,
        )
    )

    state.rag_result = results
    return state


def generate_answer(state: AgentState) -> AgentState:
    """
    【Step3】LLMで回答統合（RAG結果に基づき推論）
    """
    # RAG結果を文字列に変換
    if state.rag_result:
        rag_text = "\n".join([
            f"- {r.get('document_title', '（タイトル不明）')}: {r.get('content', '')[:200]}..."
            for r in state.rag_result[:5]  # 最大5件まで
        ])
    else:
        rag_text = "（なし）"
    
    prompt = f"""
質問: {state.input}

参考情報:
{rag_text}

以上を踏まえて簡潔に回答してください。
"""
    res = llm.invoke(prompt)
    answer = res.content.strip()

    state.output = answer

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="answer",
            content="回答を生成"
        )
    )
    return state
