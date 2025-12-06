# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.agent.graph_builder import agent_executor
from app.agent.types import StepLog
from app.rag.index_builder import build_index   # ★ 追加
from app.rag.retriever import RAGRetriever     # （ログ用などに使うなら）

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AgentRequest(BaseModel):
    input: str

# ★ 起動時にインデックスを構築（環境変数で制御可能）
@app.on_event("startup")
def startup_event():
    import os
    # 環境変数 BUILD_INDEX_ON_STARTUP が "true" の場合のみインデックスを構築
    # デプロイ環境では通常 False に設定（事前にインデックスを構築済み）
    should_build = os.getenv("BUILD_INDEX_ON_STARTUP", "false").lower() == "true"
    
    if should_build:
        try:
            print("アプリケーション起動: インデックスを構築します...")
            build_index()
            print("インデックス構築完了。")
        except Exception as e:
            # インデックス構築が失敗してもアプリは起動できるようにする
            print(f"警告: インデックス構築に失敗しました（アプリは起動します）: {e}")
    else:
        print("アプリケーション起動: インデックス構築をスキップしました（BUILD_INDEX_ON_STARTUP=false）")


@app.post("/api/agent/ask")
async def ask_agent(req: AgentRequest):
    try:
        result = agent_executor.invoke({"input": req.input})

        raw_steps = result.get("steps", [])
        steps_json = []
        for s in raw_steps:
            if isinstance(s, StepLog):
                steps_json.append(
                    {
                        "step_id": s.step_id,
                        "action": s.action,
                        "content": s.content,
                    }
                )
            else:
                steps_json.append(
                    {
                        "step_id": None,
                        "action": getattr(s, "action", None)
                                   or getattr(s, "type", None)
                                   or type(s).__name__,
                        "content": str(s),
                    }
                )

        return JSONResponse(
            content={
                "output": result.get("output", ""),
                "steps": steps_json,
            }
        )

    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"Error in /api/agent/ask: {e}")
        print(f"Traceback: {error_trace}")
        return JSONResponse(
            content={
                "error": str(e),
                "message": "エージェントの実行中にエラーが発生しました。サーバーログを確認してください。"
            },
            status_code=500,
        )
