# backend/app/agent/nodes.py

from app.agent.types import AgentState, StepLog
from app.rag.retriever import RAGRetriever
from app.tools.web_search import run_web_search
from app import config

from langchain_openai import ChatOpenAI
from langchain_core.messages import SystemMessage, HumanMessage


# ===== LLM 初期化 =====

llm = ChatOpenAI(
    model=config.LLM_MODEL,
    api_key=config.OPENAI_API_KEY,
)


# ===== ノード1: 質問意図解析 =====

def analyze_intent(state: AgentState) -> AgentState:
    text = state.input.strip()

    doc_keywords = ["この契約書", "以下の文書", "ドキュメント", "NDA", "業務委託", "雇用契約書"]

    intent = "general"
    reason = "初期値（一般的な質問とみなす）です。"

    try:
        classifier_instruction = (
            "あなたは、ユーザーの質問が『手元の具体的な文書（契約書・規約・マニュアルなど）"
            "に依存しているかどうか』を判定する分類器です。\n"
            "出力は次のいずれか1語のみとし、説明や理由は書かないでください。\n"
            "- doc_dependent\n"
            "- general"
        )
        res = llm.invoke(
            [
                SystemMessage(content=classifier_instruction),
                HumanMessage(content=f"ユーザーの質問:\n{text}"),
            ]
        )
        label = (res.content or "").strip().lower()

        if label.startswith("doc"):
            intent = "doc_dependent"
            reason = "LLM判定: 手元の文書を前提とした質問と判断しました。"
        elif label.startswith("gen"):
            intent = "general"
            reason = "LLM判定: 一般知識で回答可能な質問と判断しました。"
        else:
            if any(k in text for k in doc_keywords):
                intent = "doc_dependent"
                reason = "LLM出力が想定外だったため、キーワードベースで文書依存と判定しました。"
            else:
                intent = "general"
                reason = "LLM出力が想定外だったため、キーワードベースで非文書依存と判定しました。"

    except Exception as e:
        print(f"警告: analyze_intent の LLM呼び出しに失敗しました: {e}")
        if any(k in text for k in doc_keywords):
            intent = "doc_dependent"
            reason = "LLM呼び出しに失敗したため、キーワードベースで文書依存と判定しました。"
        else:
            intent = "general"
            reason = "LLM呼び出しに失敗したため、キーワードベースで非文書依存と判定しました。"

    state.intent = intent
    state.source = "rag" if intent == "doc_dependent" else "llm"

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="analysis",
            content=f"質問意図解析: {'文書依存' if intent == 'doc_dependent' else '非文書依存'}（{reason}）",
        )
    )

    return state


# ===== ノード2: RAG 実行 =====

def run_rag_if_needed(state: AgentState) -> AgentState:
    # 文書依存でなければ RAG スキップ
    if getattr(state, "intent", None) != "doc_dependent":
        msg = "RAGスキップ: 非文書依存と判断されたため、手元文書は参照しませんでした。"
        state.steps.append(
            StepLog(
                step_id=len(state.steps) + 1,
                action="rag",
                content=msg,
            )
        )
        state.rag_result = []
        state.source = "llm"
        return state

    query = state.input

    # ★ 毎回ここで RAGRetriever を new する
    try:
        retriever = RAGRetriever()
    except Exception as e:
        msg = (
            "RAG実行: RAGRetriever の初期化に失敗しました。"
            "環境変数や Chroma のパス設定を確認してください。"
        )
        print(f"警告: {msg} ({e})")
        state.rag_result = []
        state.intent = "general"
        state.source = "llm"
        state.steps.append(
            StepLog(
                step_id=len(state.steps) + 1,
                action="rag",
                content=msg,
            )
        )
        return state

    try:
        index_count = retriever.collection.count()
        print(f"[run_rag_if_needed] index_count={index_count}")

        if index_count == 0:
            msg = (
                f"RAG実行: インデックスが空です（{index_count}件）。"
                f"インデックスが構築されていない可能性があります。"
            )
            print(f"警告: {msg}")
            state.rag_result = []
            state.intent = "general"
            state.source = "llm"
        else:
            # 多めに 10件取得
            results = retriever.search(query, n_results=10)

            titles = [r.get("document_title", "（タイトル不明）") for r in results]
            print(
                f"[run_rag_if_needed] query={query!r}, "
                f"hits={len(results)}, titles={titles}"
            )

            if results:
                sample_titles = "、".join(titles[:3])
                msg = f"RAG実行: {len(results)}件ヒット（例: {sample_titles}）"
                state.rag_result = results
                state.source = "rag"
            else:
                msg = (
                    f"RAG実行: 0件ヒット（インデックスには{index_count}件のチャンクがありますが、"
                    f"関連する文書が見つかりませんでした）。一般知識モードにフォールバックします。"
                )
                print(f"警告: {msg}")
                state.rag_result = []
                state.intent = "general"
                state.source = "llm"

    except Exception as e:
        error_msg = f"RAG実行中にエラーが発生しました: {str(e)}"
        print(f"警告: {error_msg}")
        import traceback
        print(traceback.format_exc())
        msg = f"RAG実行: エラーが発生しました（{error_msg}）。一般知識モードにフォールバックします。"
        state.rag_result = []
        state.intent = "general"
        state.source = "llm"

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="rag",
            content=msg,
        )
    )

    return state

# ===== ノード3: 検索 =====
def run_web_search_if_needed(state: AgentState) -> AgentState:
    """
    ユーザーの質問内容に応じて Web 検索を行う。
    - 「最新」「最近」「今日」「ニュース」「株価」「金利」などのキーワード
    - 「web検索」「ネットで調べて」などの明示的指示
    が含まれる場合に Tavily で検索し、結果を state.web_search_result に格納する。
    それ以外のときは何もせずそのまま返す。
    """
    question = state.input

    trigger_words = [
        "最新",
        "最近",
        "今日",
        "昨日",
        "ニュース",
        "相場",
        "株価",
        "金利",
        "インフレ",
        "為替",
        "FX",
        "web検索",
        "Web検索",
        "ネットで調べて",
    ]

    need_web = any(word in question for word in trigger_words)

    if not need_web:
        state.steps.append(
            StepLog(
                step_id=len(state.steps) + 1,
                action="web-search",
                content="Web検索は不要と判断（キーワードなし）。",
            )
        )
        return state

    # Web検索を実行
    results = run_web_search(question, max_results=5)
    state.web_search_result = results

    # ログ
    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="web-search",
            content=f"Web検索を実行: {len(results)}件ヒット。",
        )
    )

    return state


# ===== ノード4: 回答生成 =====
# ===== ノード4: 回答生成 =====

def _format_rag_context(rag_result) -> str:
    if not rag_result:
        return "（手元の文書から有用な情報は取得できませんでした）"

    lines = []
    for i, r in enumerate(rag_result[:3], start=1):
        title = r.get("document_title", "（タイトル不明）")
        snippet = r.get("snippet") or r.get("content") or ""
        score = r.get("score")
        score_str = f"{score:.2f}" if isinstance(score, (int, float)) else "N/A"

        lines.append(
            f"[{i}] タイトル: {title}\n"
            f"    類似度スコア: {score_str}\n"
            f"    本文抜粋: {snippet}"
        )

    return "\n\n".join(lines)


def _format_web_context(web_result) -> str:
    """
    Web検索結果をLLMに渡しやすいテキストに整形する
    """
    if not web_result:
        return "（Web検索結果はありませんでした）"

    lines = []
    for i, r in enumerate(web_result[:3], start=1):
        title = r.get("title") or "（タイトル不明）"
        url = r.get("url") or "（URL情報なし）"
        # Tavily想定: content キーにサマリテキストが入っていることが多い
        snippet = r.get("content") or r.get("snippet") or ""

        lines.append(
            f"[Web{i}] タイトル: {title}\n"
            f"    URL: {url}\n"
            f"    概要: {snippet}"
        )

    return "\n\n".join(lines)


def generate_answer(state: AgentState) -> AgentState:
    # ---- RAG コンテキスト整形 ----
    rag_result = getattr(state, "rag_result", []) or []
    rag_context_text = _format_rag_context(rag_result)

    # ---- Web検索コンテキスト整形 ----
    web_result = getattr(state, "web_search_result", []) or []
    web_context_text = _format_web_context(web_result)

    # ---- コンテキスト利用方針（intent に応じて文言を変える）----
    if getattr(state, "intent", None) == "doc_dependent":
        context_note = (
            "以下の『参考情報』のうち、まず手元の documents から取得した情報を優先して回答してください。\n"
            "Web検索結果は補足情報として扱い、手元文書と矛盾する場合には手元文書を優先してください。\n"
            "参考情報に明示的に書かれていない内容を勝手に作らず、"
            "不明な点は『参考情報として取得した範囲では記載が見当たりません』と明示してください。"
        )
    else:
        context_note = (
            "必要に応じて、以下の参考情報（手元文書およびWeb検索結果）も参照しつつ、"
            "一般的な知識・推論に基づいて回答してください。\n"
            "不明な点や、手元の情報だけでは判断できない点があれば、その旨も明示してください。"
        )

    # ---- 会話履歴（あれば）----
    history_lines = []
    for turn in getattr(state, "chat_history", [])[-5:]:
        role = turn.get("role", "user")
        content = turn.get("content", "")
        history_lines.append(f"{role}: {content}")
    history_text = "\n".join(history_lines) if history_lines else "（このセッションの会話履歴は使用していません）"

    # ---- プロンプト組み立て ----
    prompt = f"""
あなたは、ユーザーの質問に対して日本語で丁寧に回答するアシスタントです。

ユーザーからの質問:
---
{state.input}
---

これまでの会話履歴（参考・最大5ターン）:
---
{history_text}
---

{context_note}

参考情報（RAG検索結果＝手元の文書）:
---
{rag_context_text}
---

参考情報（Web検索結果）:
---
{web_context_text}
---

回答要件:
- 日本語で回答すること
- 手元の文書から読み取れる内容がある場合は、それをできるだけ具体的に示すこと
- Web検索結果がある場合は、その内容も参考にしつつ矛盾がないように統合すること
- 文書やWeb結果に書かれていない推測は最小限にとどめること
- 参考情報の範囲で確認できない点は「参考情報の範囲では記載が確認できません」と書くこと
- 「手元の文書には存在しない」と断定しないこと（あくまで取得した参考情報の範囲で判断すること）

これらを踏まえて、ユーザーの質問に対する回答を作成してください。
"""

    try:
        res = llm.invoke(prompt)
        answer = res.content.strip()
    except Exception as e:
        error_msg = f"LLM呼び出しに失敗しました: {str(e)}"
        print(f"Error in generate_answer: {error_msg}")
        answer = f"申し訳ございません。回答の生成中にエラーが発生しました: {error_msg}"

    state.output = answer

    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="answer",
            content="RAG結果・Web検索結果と質問内容を踏まえて回答を生成しました。"
        )
    )

    return state
