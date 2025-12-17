"""
backend/app/services/document_parser.py

アップロードされたファイル（PDF, Word, Text）からテキストを抽出・解析するためのサービスモジュールです。
ファイル形式ごとのパース処理を関数として提供します。
"""

import io
from docx import Document
from pypdf import PdfReader
from fastapi import HTTPException

def parse_text(raw_bytes: bytes) -> str:
    """
    テキストファイルのバイナリデータを読み込み、文字列として返します。
    UTF-8 エンコーディングを想定しています。
    """
    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        # UTF-8 でデコードできない場合は 400 エラーを発生させる
        raise HTTPException(
            status_code=400,
            detail="テキストファイルをUTF-8として読み取れませんでした。",
        )

def parse_pdf(raw_bytes: bytes) -> str:
    """
    PDFファイルのバイナリデータを読み込み、各ページからテキストを抽出して結合します。
    """
    try:
        # バイトデータをファイルライクオブジェクトに変換
        pdf_stream = io.BytesIO(raw_bytes)
        reader = PdfReader(pdf_stream)
        texts: list[str] = []
        
        # 全ページをループしてテキスト抽出
        for i, page in enumerate(reader.pages):
            page_text = page.extract_text() or ""
            texts.append(page_text)
        
        # 改行で結合して一つのテキストにする
        content = "\n\n".join(texts).strip()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"PDFファイルの読み取りに失敗しました: {e}",
        )
    
    # テキストが抽出できなかった場合のエラーハンドリング
    if not content:
        raise HTTPException(
            status_code=400,
            detail="PDFからテキストを抽出できませんでした。（画像のみのPDFの可能性があります）",
        )
    return content

def parse_docx(raw_bytes: bytes) -> str:
    """
    Wordドキュメント (.docx) のバイナリデータを読み込み、段落ごとのテキストを抽出して結合します。
    """
    try:
        # バイトデータをファイルライクオブジェクトに変換
        doc_stream = io.BytesIO(raw_bytes)
        doc = Document(doc_stream)
        
        # 空でない段落のテキストをリスト化
        paragraphs: list[str] = [p.text for p in doc.paragraphs if p.text]
        content = "\n".join(paragraphs).strip()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Wordファイル(.docx)の読み取りに失敗しました: {e}",
        )
    
    # テキストが抽出できなかった場合のエラーハンドリング
    if not content:
        raise HTTPException(
            status_code=400,
            detail="Wordファイルからテキストを抽出できませんでした。",
        )
    return content

async def parse_document_content(filename: str, raw_bytes: bytes) -> str:
    """
    ファイル名（拡張子）に基づいて適切なパーサーを選択し、テキストコンテンツを返します。
    対応フォーマット: .txt, .md, .json, .pdf, .docx
    """
    ext = ""
    # 拡張子の抽出（最後のドット以降を小文字化）
    if "." in filename:
        ext = filename.rsplit(".", 1)[-1].lower()

    # 拡張子ごとの分岐処理
    if ext in {"txt", "md", "markdown", "json"}:
        return parse_text(raw_bytes)
    elif ext == "pdf":
        return parse_pdf(raw_bytes)
    elif ext == "docx":
        return parse_docx(raw_bytes)
    else:
        # 未対応の形式
        raise HTTPException(
            status_code=400,
            detail=f"未対応のファイル形式です: .{ext or '不明'}（txt/pdf/docx などを利用してください）",
        )
