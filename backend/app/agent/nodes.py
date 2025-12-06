# backend/app/agent/nodes.py

# 各ステップ（ノード）の処理内容を定義するモジュール

from app.agent.types import AgentState, StepLog  # エージェントの状態とログ用の型
from app.rag.retriever import RAGRetriever      # RAG 用の検索クラス
from app import config                          # 設定（LLMモデル名やAPIキー）を読み込む

from langchain_openai import ChatOpenAI         # OpenAI のチャットモデルクラス


# ===== LLM の初期化 =====

# OpenAI LLM（推論用）を初期化
llm = ChatOpenAI(
    model=config.LLM_MODEL,      # 例: "gpt-4.1-mini" など、config に定義したモデル名を指定
    api_key=config.OPENAI_API_KEY  # OpenAI API キー
)

# RAGRetriever の初期化（エラーハンドリング付き）
rag_retriever = None  # 初期値は None（失敗時用の保険）
try:
    # Chroma のコレクションに接続し、RAG 検索を行うためのインスタンスを作成
    rag_retriever = RAGRetriever()
except Exception as e:
    # ここでエラーが出てもアプリは起動できるようにしておく（RAGなしモード）
    print(f"警告: RAGRetriever の初期化に失敗しました: {e}")
    print("RAG機能は使用できませんが、アプリは起動します。")


# ===== ノード1: 質問意図の解析 =====

def analyze_intent(state: AgentState) -> AgentState:
    """
    ユーザー入力の意図をざっくり分類して、
    ・文書依存（手元の documents が前提）
    ・非文書依存（一般知識で回答可）
    のどちらかを state.intent に書き込むノード。
    """

    text = state.input  # ユーザーからの入力文

    # 非常にシンプルなキーワード判定ロジック
    # 「この契約書」「NDA」「業務委託」などが含まれていれば
    # 「手元文書に依存している可能性が高い」とみなす
    doc_keywords = ["この契約書", "以下の文書", "ドキュメント", "NDA", "業務委託"]
    if any(k in text for k in doc_keywords):
        intent = "doc_dependent"  # 文書依存
        msg = "質問意図解析: 文書依存（手元の documents に基づく回答が必要と判断）"
    else:
        intent = "general"        # 非文書依存
        msg = "質問意図解析: 非文書依存（一般的な知識・推論で回答可能と判断）"

    # state に意図をセット
    state.intent = intent

    # ステップログに記録
    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,  # 連番
            action="analysis",             # 処理の種類
            content=msg,                   # ログメッセージ
        )
    )

    return state  # 更新した state を返す


def should_use_rag(state: AgentState) -> bool:
    """
    analyze_intent で付けたログから、
    「文書依存」か「非文書依存」かを判定して True/False を返す。

    ※ 今回の LangGraph フローでは直接は使っていないが、
      「条件分岐ノード」を作るときに利用できるよう残しておく。
    """
    if not state.steps:
        # ステップログが無い場合は念のため False
        return False

    # 直近のステップログ（通常は analyze_intent の結果）
    last_log = state.steps[-1].content

    # 「非文書依存」と明示されていたら RAG は使わない
    if "非文書依存" in last_log:
        return False

    # 「文書依存」と書かれているなら RAG を使う
    if "文書依存" in last_log:
        return True

    # どちらとも判定できない場合はデフォルトで使わない
    return False


# ===== ノード2: RAG を必要に応じて実行 =====

def run_rag_if_needed(state: AgentState) -> AgentState:
    """
    state.intent を見て、文書依存なら RAG を実行するノード。
    結果は state.rag_result に格納する。
    """
    # intent が "doc_dependent" でなければ RAG はスキップ
    if getattr(state, "intent", None) != "doc_dependent":
        # 文書依存じゃない → RAGスキップ
        state.steps.append(
            StepLog(
                step_id=len(state.steps) + 1,
                action="rag",
                content="RAGスキップ: 非文書依存と判断されたため、手元文書は参照しませんでした。",
            )
        )
        # RAG結果は空として扱う
        state.rag_result = []
        return state

    # ここに来たら「文書依存」と判断されている
    query = state.input  # ユーザーの質問文をそのままクエリに使う

    # RAGRetriever が初期化されていない場合（環境不備など）
    if rag_retriever is None:
        msg = "RAG実行: RAGRetriever が初期化されていません。環境変数やインデックスの設定を確認してください。"
        print(f"警告: {msg}")
        state.rag_result = []
    else:
        try:
            # インデックス（Chroma内のデータ）が何件入っているか確認
            index_count = rag_retriever.collection.count()

            if index_count == 0:
                # インデックスが空の場合
                msg = f"RAG実行: インデックスが空です（{index_count}件）。インデックスが構築されていない可能性があります。"
                print(f"警告: {msg}")
                state.rag_result = []
            else:
                # 通常の RAG 検索を実行
                results = rag_retriever.search(query)

                # タイトルだけ抜き出してログ用メッセージを作成
                titles = [r.get("document_title", "（タイトル不明）") for r in results]
                if results:
                    # 例として最大3件までタイトルを表示
                    sample_titles = "、".join(titles[:3])
                    msg = f"RAG実行: {len(results)}件ヒット（例: {sample_titles}）"
                else:
                    msg = f"RAG実行: 0件ヒット（インデックスには{index_count}件のチャンクがありますが、関連する文書が見つかりませんでした）"

                # state に RAG結果を保存
                state.rag_result = results

        except Exception as e:
            # RAG実行中にエラーが発生した場合
            error_msg = f"RAG実行中にエラーが発生しました: {str(e)}"
            print(f"警告: {error_msg}")
            import traceback
            print(traceback.format_exc())
            msg = f"RAG実行: エラーが発生しました（{error_msg}）"
            state.rag_result = []

    # RAG の実行（またはスキップ）結果をステップログに記録
    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="rag",
            content=msg,
        )
    )

    return state


# ===== ノード3: 回答生成 =====

def _format_rag_context(rag_result) -> str:
    """
    RAG で取得した結果（リスト形式）を、
    LLM に渡しやすいテキストに整形するヘルパー関数。
    """
    if not rag_result:
        # RAG結果が空の場合は、その旨を明示
        return "（手元の文書から有用な情報は取得できませんでした）"

    lines = []  # 1文書ごとの表示用行をためるリスト

    # トークン節約のため、ひとまず先頭3件に絞る
    for i, r in enumerate(rag_result[:3], start=1):
        title = r.get("document_title", "（タイトル不明）")
        # retriever が返すキー名に対応させる：snippet があれば優先、それがなければ content
        snippet = r.get("snippet") or r.get("content") or ""
        score = r.get("score")
        score_str = f"{score:.2f}" if isinstance(score, (int, float)) else "N/A"

        # 1件分を読みやすい形で整形
        lines.append(
            f"[{i}] タイトル: {title}\n"
            f"    類似度スコア: {score_str}\n"
            f"    本文抜粋: {snippet}"
        )

    # 複数行を空行区切りで結合
    return "\n\n".join(lines)


def generate_answer(state: AgentState) -> AgentState:
    """
    【Step3】LLMで回答統合（RAG結果に基づき推論）
    - 文書依存の場合は RAG の文書内容を優先
    - 非文書依存の場合は一般知識＋参考情報として利用
    """

    # RAG結果（state.rag_result）を安全に取り出す
    rag_result = getattr(state, "rag_result", []) or []
    # RAG結果をプロンプト用のテキストに整形する
    rag_context_text = _format_rag_context(rag_result)

    # 文書依存フラグにより、プロンプトの指示を少し変える
    if getattr(state, "intent", None) == "doc_dependent":
        # 文書依存の場合：手元文書の内容を優先するよう指示
        context_note = (
            "以下の『参考情報』は、ユーザーの手元にある documents から取得したものです。\n"
            "必ずこの参考情報の内容を優先して回答してください。\n"
            "参考情報に明示的に書かれていない内容を勝手に作らず、"
            "不明な点は『手元の文書には記載がありません』と明示してください。"
        )
    else:
        # 非文書依存の場合：一般知識＋参考情報（あれば）を使ってよい
        context_note = (
            "必要に応じて、以下の参考情報も参照しつつ、一般的な知識・推論に基づいて回答してください。\n"
            "不明な点や、手元の情報だけでは判断できない点があれば、その旨も明示してください。"
        )

    # LLM に渡す最終プロンプトを組み立てる
    prompt = f"""
あなたは、ユーザーの質問に対して日本語で丁寧に回答するアシスタントです。

ユーザーからの質問:
---
{state.input}
---

{context_note}

参考情報（RAG検索結果）:
---
{rag_context_text}
---

回答要件:
- 日本語で回答すること
- 手元の文書から読み取れる内容がある場合は、それをできるだけ具体的に示すこと
- 文書に書かれていない推測は最小限にとどめること
- 不明な点は「手元の文書には記載がありません」とはっきり書くこと

これらを踏まえて、ユーザーの質問に対する回答を作成してください。
"""

    try:
        # LLM にプロンプトを送信して回答を取得
        res = llm.invoke(prompt)
        answer = res.content.strip()
    except Exception as e:
        # LLM呼び出しが失敗した場合のエラーハンドリング
        error_msg = f"LLM呼び出しに失敗しました: {str(e)}"
        print(f"Error in generate_answer: {error_msg}")
        answer = f"申し訳ございません。回答の生成中にエラーが発生しました: {error_msg}"

    # 生成した回答を state にセット
    state.output = answer

    # ステップログに「回答を生成した」ことを記録
    state.steps.append(
        StepLog(
            step_id=len(state.steps) + 1,
            action="answer",
            content="RAG結果を踏まえて回答を生成"
        )
    )

    return state  # 更新した state を返す
