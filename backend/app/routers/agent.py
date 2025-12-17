"""
backend/app/routers/agent.py

AIエージェントとの対話を行うためのAPIルーターです。
LangGraphで構築されたエージェントを呼び出し、ユーザーの入力に応答します。
"""

from typing import List
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# 構築済みのエージェント実行インスタンス（シングルトン）をインポート
from app.agent.graph_builder import agent_executor
# ログや参照情報の型定義
from app.agent.types import StepLog, Reference


router = APIRouter(
    prefix="/api/agent",
    tags=["agent"],
)

# =================================================================
# Pydantic モデル定義
# =================================================================

class Message(BaseModel):
    """
    チャットメッセージ構造
    """
    role: str      # "user" または "assistant"
    content: str   # メッセージ本文

class AskRequest(BaseModel):
    """
    エージェントへの問い合わせリクエスト
    """
    input: str                         # 最新のユーザー入力
    history: List[Message] | None = None  # 過去の会話履歴（オプション）

class AskResponse(BaseModel):
    """
    エージェントからの回答レスポンス
    """
    output: str                    # エージェントの最終回答テキスト
    steps: List[StepLog]           # 思考プロセス（ステップごとのログ）
    references: List[Reference]    # 回答に使用した参照情報（RAG/Web検索結果）


# =================================================================
# API エンドポイント
# =================================================================

@router.post("/ask", response_model=AskResponse)
async def ask_agent(request: AskRequest):
    """
    ユーザーからの質問を受け取り、AIエージェントを実行して回答を生成するエンドポイント。
    
    処理内容:
    1. フロントエンドから質問と履歴を受け取る
    2. LangGraph エージェントのステートを初期化
    3. エージェントを実行 (invoke)
    4. 結果（回答、ログ、参照情報）を返す
    """
    try:
        # デバッグログ出力
        print(f"[API] /api/agent/ask called. input={request.input[:50]!r}")

        # 会話履歴の変換（内部処理用フォーマットへ）
        history_list = []
        if request.history:
            history_list = [
                {"role": m.role, "content": m.content}
                for m in request.history
            ]

        # エージェントの初期ステートを作成
        # ここに必要な情報をすべて詰めてエージェントに渡す
        initial_state = {
            "input": request.input,       # ユーザーの質問
            "steps": [],                  # 実行ログ（空リストで開始）
            "intent": None,               # 意図解析結果（最初はNone）
            "source": None,               # 主な情報源（最初はNone）
            "rag_result": [],             # RAG結果（最初は空）
            "chat_history": history_list, # 会話履歴リスト
        }

        # エージェント実行（同期処理の場合は invoke を使用）
        # graph_builder.py で定義されたワークフローが実行される
        result_state = agent_executor.invoke(initial_state)

        # 実行結果から必要な情報を取り出す
        output = result_state.get("output", "")
        steps = result_state.get("steps", [])
        references = result_state.get("references", []) # Step 193で追加されたフィールド

        # 完了ログ出力
        print(
            f"[API] /api/agent/ask finished. "
            f"source={result_state.get('source')}, "
            f"steps={len(steps)}"
        )

        return AskResponse(output=output, steps=steps, references=references)


    except Exception as e:
        # エラーハンドリング
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in /api/agent/ask: {e}")
        print(f"Traceback: {error_trace}")
        
        # クライアントには500エラーとエラーメッセージを返す
        return JSONResponse(
            content={
                "error": str(e),
                "message": "エージェントの実行中にエラーが発生しました。サーバーログを確認してください。",
            },
            status_code=500,
        )
