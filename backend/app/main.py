# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.agent.graph_builder import agent_executor
from app.agent.types import StepLog
from app.rag.index_builder import build_index   # ★ 追加
from app.rag.retriever import RAGRetriever     # （ログ用などに使うなら）
from app import config

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

# ★ 起動時にインデックスの存在をチェックし、必要に応じて構築
@app.on_event("startup")
def startup_event():
    import os
    import chromadb
    from chromadb.utils import embedding_functions
    
    # 環境変数 BUILD_INDEX_ON_STARTUP が "true" の場合は強制的に構築
    force_build = os.getenv("BUILD_INDEX_ON_STARTUP", "false").lower() == "true"
    
    if force_build:
        try:
            print("アプリケーション起動: インデックスを構築します（BUILD_INDEX_ON_STARTUP=true）...")
            build_index()
            print("インデックス構築完了。")
            return
        except Exception as e:
            print(f"警告: インデックス構築に失敗しました（アプリは起動します）: {e}")
            return
    
    # インデックスの存在をチェック
    try:
        client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))
        openai_ef = embedding_functions.OpenAIEmbeddingFunction(
            api_key=config.OPENAI_API_KEY,
            model_name=config.EMBEDDING_MODEL,
        )
        collection = client.get_or_create_collection(
            name=config.CHROMA_COLLECTION,
            embedding_function=openai_ef,
        )
        count = collection.count()
        
        if count == 0:
            # インデックスが空の場合、自動的に構築
            print("アプリケーション起動: インデックスが空のため、自動的に構築します...")
            try:
                build_index()
                print("インデックス構築完了。")
            except Exception as e:
                print(f"警告: インデックス構築に失敗しました（アプリは起動します）: {e}")
        else:
            print(f"アプリケーション起動: インデックス確認完了（{count}件のチャンクが登録されています）")
    except Exception as e:
        # チェックに失敗した場合も構築を試みる
        print(f"インデックスチェック中にエラーが発生しました: {e}")
        print("インデックス構築を試みます...")
        try:
            build_index()
            print("インデックス構築完了。")
        except Exception as build_error:
            print(f"警告: インデックス構築に失敗しました（アプリは起動します）: {build_error}")


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
