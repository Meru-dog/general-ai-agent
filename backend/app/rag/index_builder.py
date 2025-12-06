# backend/app/rag/index_builder.py
from typing import List                # 型ヒント用
import chromadb                        # ベクトルストア Chroma のライブラリ
from chromadb.utils import embedding_functions  # 埋め込み関数を使うため

from app import config                                # 設定
from app.rag.document_loader import load_documents, Document  # 文書読み込み


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> List[str]:
    """
    長いテキストを「チャンク」に分割する。
    chunk_size: 1チャンクの長さ（文字数）
    overlap: チャンク同士をどれくらい重ねるか（コンテキスト維持のため）
    """
    chunks: List[str] = []
    start = 0
    length = len(text)

    # start を動かしながらテキストをスライスしていく
    while start < length:
        end = min(start + chunk_size, length)  # テキストの末尾を超えないようにする
        chunk = text[start:end]                # start〜end の範囲を1チャンクとして取り出す
        chunks.append(chunk)
        if end == length:
            # 最後まで到達したらループ終了
            break
        # 次のチャンクの開始位置を、少し戻して設定（オーバーラップ分）
        start = end - overlap

    return chunks


def build_index() -> None:
    """
    documents/ から文書を読み込み、
    チャンク化 → 埋め込み計算 → Chroma に登録する。
    """
    # すべての文書を読み込む
    docs = load_documents()

    # 永続化モードの Chroma クライアントを作成
    client = chromadb.PersistentClient(path=str(config.CHROMA_DIR))

    # OpenAI の埋め込み関数を作成
    openai_ef = embedding_functions.OpenAIEmbeddingFunction(
        api_key=config.OPENAI_API_KEY,
        model_name=config.EMBEDDING_MODEL,
    )

    # コレクション（テーブルのようなもの）を取得 or 作成
    collection = client.get_or_create_collection(
        name=config.CHROMA_COLLECTION,
        embedding_function=openai_ef,
    )

    # すでにデータが入っている場合は、一旦全削除して作り直す方針
    if collection.count() > 0:
        collection.delete(where={})  # where={} は「全件削除」の意味

    ids: List[str] = []        # 各チャンクのID
    documents: List[str] = []  # 各チャンクのテキスト本体
    metadatas: List[dict] = [] # 文書IDやタイトルなどのメタ情報

    # 各文書についてチャンク化し、Chroma に登録するための配列を作る
    for doc in docs:
        chunks = chunk_text(doc.content)
        for idx, chunk in enumerate(chunks):
            # チャンクごとに一意なIDを作る（docID + "_chunk_" + インデックス）
            chunk_id = f"{doc.id}_chunk_{idx}"
            ids.append(chunk_id)
            documents.append(chunk)
            metadatas.append(
                {
                    "document_id": doc.id,   # どの文書に属するチャンクか
                    "document_title": doc.title,
                    "chunk_index": idx,      # 文書内の何番目のチャンクか
                }
            )

    # 1つもチャンクがないのはさすがにおかしいのでエラー
    if not ids:
        raise RuntimeError("チャンクが1つも生成されませんでした。")

    # Chroma に一括で追加
    collection.add(
        ids=ids,
        documents=documents,
        metadatas=metadatas,
    )

    print(f"インデックス作成完了: {len(ids)} チャンクを登録しました。")
