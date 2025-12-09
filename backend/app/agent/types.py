# エージェント内部の状態（State）を定義するファイル
from typing import List, Optional, Dict
from pydantic import BaseModel, Field


class StepLog(BaseModel):
    """
    実行ログを1ステップ分記録するクラス
    - step_id: 実行順序番号
    - action: 実施した処理の種類（analysis / decision / rag / answer など）
    - content: 処理内容の説明（人が理解できる形）
    """
    step_id: int
    action: str
    content: str


class AgentState(BaseModel):
    """
    エージェント全体の状態を保持するクラス
    - input: ユーザーからの指示文
    - intent: 質問の意図（"doc_dependent" または "general"）
    - rag_result: RAG 検索の結果（必要な場合のみ）
    - output: LLM が生成した回答
    - steps: 処理過程（StepLog のリスト）
    - chat_history: セッション内の会話履歴（将来拡張用）
    - source: 主な情報源（"rag" / "llm" / 将来 "web" など）
    """
    input: str
    intent: Optional[str] = None
    rag_result: Optional[List[Dict]] = None
    output: Optional[str] = None

    # ミュータブルなデフォルト値は default_factory を使う
    steps: List[StepLog] = Field(default_factory=list)
    chat_history: List[Dict[str, str]] = Field(default_factory=list)

    # どの情報源を主に使ったかを示す（ログ・UI用）
    source: Optional[str] = None
