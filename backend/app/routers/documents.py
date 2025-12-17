"""
backend/app/routers/documents.py

文書管理に関連するAPIエンドポイントを提供するルーターです。
文書のアップロード、テキスト登録、一覧取得、削除などの機能を含みます。
RAG（Retrieval-Augmented Generation）システムへの文書登録もここで行います。
"""

import uuid
from typing import List
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.rag.retriever import RAGRetriever
from app.services.document_parser import parse_document_content

# ルーターの定義
router = APIRouter(
    prefix="/api/documents",
    tags=["documents"],
)

# =================================================================
# 依存関係定義 (Dependency Injection)
# =================================================================

# RAGRetrieverのシングルトンインスタンスを保持する変数
_retriever_instance = None

def get_retriever():
    """
    RAGRetriever のインスタンスを取得する依存関係関数。
    初回呼び出し時にインスタンスを生成し、以降は同じインスタンスを返します（シングルトンパターン）。
    これにより、DB接続などのリソースを効率的に管理します。
    """
    global _retriever_instance
    if _retriever_instance is None:
        _retriever_instance = RAGRetriever()
    return _retriever_instance


# =================================================================
# Pydantic モデル定義 (リクエスト/レスポンススキーマ)
# =================================================================

class DocumentRegisterRequest(BaseModel):
    """
    テキスト直接登録用のリクエストボディ
    """
    title: str
    content: str

class DocumentSummary(BaseModel):
    """
    文書一覧取得時の各文書情報
    """
    document_id: str
    document_title: str
    chunk_count: int

class DocumentListResponse(BaseModel):
    """
    文書一覧取得APIのレスポンス
    """
    documents: List[DocumentSummary]


# =================================================================
# API エンドポイント
# =================================================================

@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    title: str | None = Form(None),
    retriever: RAGRetriever = Depends(get_retriever)
):
    """
    ファイルアップロードを行い、RAGインデックスに登録するエンドポイント。
    
    Args:
        file (UploadFile): アップロードされたファイル (PDF, Word, Text等)
        title (str | None): 文書のタイトル (省略時はファイル名を使用)
        retriever (RAGRetriever): RAG検索エンジンのインスタンス (DIで注入)
    
    Returns:
        JSON: 登録結果とドキュメントID
    """
    try:
        print(f"[API] /api/documents/upload called. filename={file.filename!r}, title={title!r}")

        # タイトルの決定（指定がなければファイル名）
        filename = file.filename or "uploaded_document"
        final_title = title or filename
        
        # ファイルの中身を読み込む（非同期）
        raw_bytes = await file.read()

        # ファイル形式に応じてテキスト抽出（サービス層の関数を利用）
        content = await parse_document_content(filename, raw_bytes)

        # ドキュメントIDの生成（一意なID）
        doc_id = "user_" + uuid.uuid4().hex
        
        # RAGインデックスへの登録処理
        result = retriever.add_document(
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
        # 既知のHTTPエラーはそのまま再送出
        raise
    except Exception as e:
        # 予期せぬエラーはログに出力し、500エラーとして返す
        import traceback
        print(f"Error in /api/documents/upload: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"ファイルアップロード中に予期せぬエラーが発生しました: {e}",
        )


@router.post("/register")
async def register_document(
    payload: DocumentRegisterRequest,
    retriever: RAGRetriever = Depends(get_retriever)
):
    """
    テキストデータを直接RAGインデックスに登録するエンドポイント。
    （例：クリップボードからの貼り付けなど）
    
    Args:
        payload (DocumentRegisterRequest): タイトルと本文を含むリクエストボディ
    """
    try:
        print(f"[API] /api/documents/register called. title={payload.title!r}")

        # ドキュメントIDの生成
        doc_id = "user_" + uuid.uuid4().hex
        
        # RAGインデックスへの登録
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


@router.get("", response_model=DocumentListResponse)
async def list_documents(retriever: RAGRetriever = Depends(get_retriever)):
    """
    登録済み文書の一覧（メタデータ）を取得するエンドポイント。
    """
    try:
        # 全ドキュメントのリストを取得
        docs = retriever.list_documents()
        return DocumentListResponse(documents=docs)
    except Exception as e:
        import traceback
        print(f"Error in GET /api/documents: {e}")
        print(traceback.format_exc())
        raise HTTPException(
            status_code=500,
            detail=f"文書一覧の取得中にエラーが発生しました: {e}",
        )


@router.delete("/{document_id}")
async def delete_document(
    document_id: str,
    retriever: RAGRetriever = Depends(get_retriever)
):
    """
    指定した document_id を持つ文書（およびその全チャンク）を削除するエンドポイント。
    """
    try:
        # 文書の削除を実行
        deleted = retriever.delete_document(document_id)
        
        # 削除数が0の場合は対象が見つからなかったとみなす
        if deleted == 0:
            raise HTTPException(
                status_code=404,
                detail=f"document_id='{document_id}' に対応するデータは見つかりませんでした。",
            )
            
        return {"document_id": document_id, "deleted_chunks": deleted}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in DELETE /api/documents/{document_id}: {e}")
        return JSONResponse(
            content={"error": str(e), "message": "文書の削除中にエラーが発生しました。"},
            status_code=500,
        )
