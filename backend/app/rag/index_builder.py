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

    # ★ ここで「既存コレクションを削除してから」作り直す
    collection_name = config.CHROMA_COLLECTION

    try:
        client.delete_collection(name=collection_name)
        print(f"既存コレクション '{collection_name}' を削除しました。")
    except Exception as e:
        # 初回など、そもそも存在しない場合はエラーになるので無視してOK
        print(f"既存コレクション削除時にエラー（無視して続行）: {e}")

    # 新しくコレクションを作り直す
    collection = client.get_or_create_collection(
        name=collection_name,
        embedding_function=openai_ef,
    )

    # ↓ ここから下（ids / documents / metadatas 作って add する処理）は今のままでOK
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
