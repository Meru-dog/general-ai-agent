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

# ★ 起動時にインデックスを構築
@app.on_event("startup")
def startup_event():
    print("アプリケーション起動: インデックスを構築します...")
    build_index()
    print("インデックス構築完了。")


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
        print("Error in /api/agent/ask:", e)
        return JSONResponse(
            content={"error": str(e)},
            status_code=500,
        )
