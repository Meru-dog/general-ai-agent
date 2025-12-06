from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel


from app.agent.graph_builder import agent_executor  # LangGraph の実行器
from app.agent.types import StepLog
from app import config

app = FastAPI()

# CORS設定：フロントエンド(任意のオリジン)から叩けるように
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # セキュリティを考えれば特定ドメインに限定
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🔹APIリクエスト形式
class AgentRequest(BaseModel):
    input: str


@app.post("/api/agent/ask")
async def ask_agent(req: AgentRequest):
    try:
        # LangGraph 実行（実際の呼び出しはあなたのコードに合わせて）
        result = agent_executor.invoke({"input": req.input})

        # 生の steps（StepLog オブジェクトのリスト）を取得
        raw_steps = result.get("steps", [])

        steps_json = []
        for s in raw_steps:
            # StepLog 型なら、フィールドを素直に取り出す
            if isinstance(s, StepLog):
                steps_json.append(
                    {
                        "step_id": s.step_id,
                        "action": s.action,
                        "content": s.content,
                    }
                )
            else:
                # 念のため、型が違う場合も壊れないようにしておく
                steps_json.append(
                    {
                        "step_id": None,
                        "action": getattr(s, "action", None) or getattr(s, "type", None) or type(s).__name__,
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