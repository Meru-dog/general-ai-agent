# backend/app/rag/index_builder.py
from typing import List
import chromadb
from chromadb.utils import embedding_functions

from app import config
from app.rag.document_loader import load_documents, Document


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    """
    長いテキストをチャンクに分割する。
    """
    chunks: List[str] = []
    start = 0
    length = len(text)

    while start < length:
        end = min(start + chunk_size, length)
        chunk = text[start:end]
        chunks.append(chunk)
        if end == length:
            break
        start = end - overlap

    return chunks


def build_index() -> None:
    """
    documents/ から文書を読み込み、
    チャンク化 → 埋め込み計算 → Chroma に登録する。
    """
    # 1) 文書読み込み
    docs = load_documents()

    # 2) Chroma クライアント作成
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))

    # 3) 埋め込み関数
    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=config.OPENAI_API_KEY,
        model_name=config.EMBEDDING_MODEL,
    )

    collection_name = config.CHROMA_COLLECTION

    # 4) 既存コレクション取得（なければ作成）
    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=openai_ef,
    )

    # 5) すでにデータが入っている場合は、「中身だけ」全削除（コレクション自体は残す）
    try:
        existing_count = collection.count()
        if existing_count > 0:
            all_docs = collection.get()  # 小規模前提なので全部取得でOK
            all_ids = all_docs.get("ids", [])
            if all_ids:
                collection.delete(ids=all_ids)
                print(f"既存コレクション '{collection_name}' から {len(all_ids)} 件を削除しました。")
    except Exception as e:
        # ここでのエラーは致命的ではないのでログだけ出して続行
        print(f"既存データ削除時にエラー（無視して続行）: {e}")

    # 6) 新しいデータを追加
    ids: List[str] = []
    documents: List[str] = []
    metadatas: List[dict] = []

    for doc in docs:
        chunks = chunk_text(doc.content)
        for idx, chunk in enumerate(chunks):
            chunk_id = f"{doc.id}_chunk_{idx}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "document_id": doc.id,
                    "document_title": doc.title,
                    "chunk_index": idx,
                }
            )

    if not ids:
        raise RuntimeError("チャンクが1つも生成されませんでした。")

    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(f"インデックス作成完了: {len(ids)} チャンクを登録しました。")
