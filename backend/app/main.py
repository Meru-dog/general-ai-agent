import io
import uuid
from typing import List

from docx import Document
from fastapi import FastAPI, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pypdf import PdfReader

from app.agent.graph_builder import agent_executor
from app.agent.types import StepLog
from app.rag.index_builder import build_index  # 必要に応じて使用
from app.rag.retriever import RAGRetriever
from app import config  # どこかで使っていればそのまま


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 本番では必要に応じて絞る
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# =========================
# RAG Retriever（文書管理用の共有インスタンス）
# =========================

document_retriever = RAGRetriever()


# =========================
# 起動時イベントでインデックス確認
# =========================

@app.on_event("startup")
def startup_event():
    try:
        # 必要なら起動時にインデックス構築を行ってもよい
        # build_index()
        count = document_retriever.collection.count()
        print(f"アプリケーション起動: インデックス確認完了（{count}件のチャンクが登録されています）")
    except Exception as e:
        print(f"警告: 起動時のインデックス確認に失敗しました: {e}")


# =========================
# モデル定義
# =========================

class Message(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class AskRequest(BaseModel):
    input: str
    history: List[Message] | None = None
    

class AskResponse(BaseModel):
    output: str
    steps: List[StepLog]


class DocumentRegisterRequest(BaseModel):
    title: str
    content: str


# --- 文書一覧・削除用のレスポンスモデル ---
class DocumentSummary(BaseModel):
    document_id: str
    document_title: str
    chunk_count: int


class DocumentListResponse(BaseModel):
    documents: List[DocumentSummary]


# =========================
# ヘルスチェック
# =========================

@app.get("/")
async def root():
    return {"status": "ok", "message": "general-ai-agent backend is running"}


# =========================
# 文書アップロード（ファイル）
# =========================

@app.post("/api/documents/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(None),
):
    """
    ファイルアップロード → テキスト抽出 → RAGインデックスに登録
    対応形式:
      - .txt / .md / .markdown / .json （UTF-8テキスト）
      - .pdf （テキスト埋め込み型のPDF）
      - .docx （Wordファイル）
    """
    try:
        print(f"[API] /api/documents/upload called. filename={file.filename!r}, title={title!r}")

        filename = file.filename or "uploaded_document"
        ext = ""
        if "." in filename:
            ext = filename.rsplit(".", 1)[-1].lower()

        final_title = title or filename

        # ファイル内容をバイト列で読み込み
        raw_bytes = await file.read()

        # 拡張子ごとにテキスト抽出
        if ext in {"txt", "md", "markdown", "json"}:
            # プレーンテキスト（UTF-8前提）
            try:
                content = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                raise HTTPException(
                    status_code=400,
                    detail="テキストファイルをUTF-8として読み取れませんでした。",
                )

        elif ext == "pdf":
            # PDF（テキスト埋め込み型）を読み取る
            try:
                pdf_stream = io.BytesIO(raw_bytes)
                reader = PdfReader(pdf_stream)
                texts: list[str] = []
                for i, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    texts.append(page_text)
                content = "\n\n".join(texts).strip()
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"PDFファイルの読み取りに失敗しました: {e}",
                )
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail="PDFからテキストを抽出できませんでした。（画像のみのPDFの可能性があります）",
                )

        elif ext == "docx":
            # Word(.docx) を読み取る
            try:
                doc_stream = io.BytesIO(raw_bytes)
                doc = Document(doc_stream)
                paragraphs: list[str] = [p.text for p in doc.paragraphs if p.text]
                content = "\n".join(paragraphs).strip()
            except Exception as e:
                raise HTTPException(
                    status_code=400,
                    detail=f"Wordファイル(.docx)の読み取りに失敗しました: {e}",
                )
            if not content:
                raise HTTPException(
                    status_code=400,
                    detail="Wordファイルからテキストを抽出できませんでした。",
                )

        else:
            # 未対応形式
            raise HTTPException(
                status_code=400,
                detail=f"未対応のファイル形式です: .{ext or '不明'}（txt/pdf/docx などを利用してください）",
            )

        # ここまでで content にテキストが入っている前提
        doc_id = "user_" + uuid.uuid4().hex

        result = document_retriever.add_document(
            doc_id=doc_id,
            title=final_title,
            content=content,
        )

        print(f"[API] /api/documents/upload finished. doc_id={doc_id}, title={final_title!r}")
        return {
            "message": "アップロードしたファイルをRAGインデックスに登録しました。",
            "title": final_title,
            "doc_id": doc_id,
            "result": result,
        }

    except HTTPException:
        # HTTPException はそのまま伝播
        raise
    except Exception as e:
        import traceback
        print(f"Error in /api/documents/upload: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"ファイルアップロード中に予期せぬエラーが発生しました: {e}",
        )


# =========================
# 文書登録（コピペテキスト）
# =========================

@app.post("/api/documents/register")
async def register_document(payload: DocumentRegisterRequest):
    """
    ユーザーがアップロードした文書を RAG のインデックス（Chroma）に登録するエンドポイント
    """
    try:
        print(f"[API] /api/documents/register called. title={payload.title!r}")

        # ユーザー文書用の一意な doc_id を生成
        doc_id = "user_" + uuid.uuid4().hex

        result = document_retriever.add_document(
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


# =========================
# 文書一覧取得
# =========================

@app.get("/api/documents", response_model=DocumentListResponse)
async def list_documents():
    """
    登録済み文書の一覧を返すAPI
    （document_id ごとにタイトルとチャンク数をまとめたもの）
    """
    try:
        docs = document_retriever.list_documents()
        return DocumentListResponse(documents=docs)
    except Exception as e:
        import traceback
        print(f"Error in GET /api/documents: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"文書一覧の取得中にエラーが発生しました: {e}",
        )

# =========================
# 文書削除
# =========================

@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str):
    """
    指定した document_id に対応するチャンクをすべて削除する。
    """
    try:
        deleted = document_retriever.delete_document(document_id)
        if deleted == 0:
            # 見つからなかった場合は 404 扱い
            raise HTTPException(
                status_code=404,
                detail=f"document_id='{document_id}' に対応するデータは見つかりませんでした。",
            )
        return {"document_id": document_id, "deleted_chunks": deleted}
    except HTTPException:
        # そのまま再スロー
        raise
    except Exception as e:
        print(f"Error in DELETE /api/documents/{document_id}: {e}")
        return JSONResponse(
            content={"error": str(e), "message": "文書の削除中にエラーが発生しました。"},
            status_code=500,
        )


# =========================
# エージェント呼び出しAPI
# =========================

@app.post("/api/agent/ask", response_model=AskResponse)
async def ask_agent(request: AskRequest):
    """
    フロントエンドからの質問を受け取り、LangGraph エージェントを実行して回答を返すエンドポイント
    """
    try:
        print(f"[API] /api/agent/ask called. input={request.input[:50]!r}")

        # history が来ていればそれを使う（なければ空リスト）
        history_list = []
        if request.history:
            history_list = [
                {"role": m.role, "content": m.content}
                for m in request.history
            ]

        # LangGraph に渡す初期 state
        initial_state = {
            "input": request.input,
            "steps": [],
            "intent": None,
            "source": None,
            "rag_result": [],
            "chat_history": history_list,
        }

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
