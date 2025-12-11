from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.agent.graph_builder import agent_executor
from app.agent.types import StepLog
from app.rag.index_builder import build_index
from app.rag.retriever import RAGRetriever
from app import config
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 必要に応じて絞り込んでOK
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# =========================
# 起動時イベントでインデックス確認
# =========================

@app.on_event("startup")
def startup_event():
    # 既存の build_index 呼び出しがあるならそれはそのまま or 好きなように
    try:
        # ここは今の実装に合わせて必要ならコメントアウトでもOK
        # build_index()
        retriever = RAGRetriever()
        count = retriever.collection.count()
        print(f"アプリケーション起動: インデックス確認完了（{count}件のチャンクが登録されています）")
    except Exception as e:
        print(f"警告: 起動時のインデックス確認に失敗しました: {e}")


# =========================
# モデル定義
# =========================

class AskRequest(BaseModel):
    input: str

class AskResponse(BaseModel):
    output: str
    steps: List[StepLog]

class DocumentRegisterRequest(BaseModel):
    title: str
    content: str

# =========================
# エージェント呼び出しAPI
# =========================

@app.post("/api/documents/register")
async def register_document(payload: DocumentRegisterRequest):
    """
    ユーザーがアップロードした文書を RAG のインデックス（Chroma）に登録するエンドポイント
    """
    try:
        print(f"[API] /api/documents/register called. title={payload.title!r}")

        retriever = RAGRetriever()

        # ユーザー文書用の一意な doc_id を生成
        doc_id = "user_" + uuid.uuid4().hex

        # RAGRetriever.add_document のシグネチャ:
        # def add_document(self, doc_id, title, content, ...)
        result = retriever.add_document(
            doc_id=doc_id,
            title=payload.title,
            content=payload.content,
        )

        print(f"[API] /api/documents/register finished. doc_id={doc_id}, result={result}")
        return {
            "message": "文書をRAGインデックスに登録しました。",
            "title": payload.title,
            "doc_id": doc_id,
            "result": result,
        }

    except Exception as e:
        import traceback
        print(f"Error in /api/documents/register: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"文書登録中にエラーが発生しました: {e}",
        )



@app.post("/api/agent/ask", response_model=AskResponse)
async def ask_agent(request: AskRequest):
    """
    フロントエンドからの質問を受け取り、LangGraph エージェントを実行して回答を返すエンドポイント
    """
    try:
        # ここが必ず出るはずのログ
        print(f"[API] /api/agent/ask called. input={request.input[:50]!r}")

        # LangGraph に渡す初期 state
        initial_state = {
            "input": request.input,
            "steps": [],         # StepLog のリスト
            "intent": None,
            "source": None,
            "rag_result": [],
            "chat_history": [],  # 将来用
        }

        # エージェント実行
        result_state = agent_executor.invoke(initial_state)

        output = result_state.get("output", "")
        steps = result_state.get("steps", [])

        print(
            f"[API] /api/agent/ask finished. "
            f"source={result_state.get('source')}, "
            f"steps={len(steps)}"
        )

        return AskResponse(output=output, steps=steps)

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in /api/agent/ask: {e}")
        print(f"Traceback: {error_trace}")
        return JSONResponse(
            content={
                "error": str(e),
                "message": "エージェントの実行中にエラーが発生しました。サーバーログを確認してください。",
            },
            status_code=500,
        )
