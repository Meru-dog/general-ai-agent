# backend/app/rag/document_loader.py
from dataclasses import dataclass  # データをまとめる軽量クラスを定義するため
from pathlib import Path           # パス操作用
from typing import List            # 型ヒント用の List

from app import config             # 先ほどの config.py を読み込む


# Document という名前のシンプルなデータ構造を定義
@dataclass
class Document:
    id: str        # 文書ID（ここではファイル名から作成）
    title: str     # 文書タイトル（ここではファイル名をそのまま）
    path: Path     # ファイルのパス
    content: str   # ファイルの中身（テキスト）


def load_documents() -> List[Document]:
    """
    documents/ ディレクトリにある .txt / .md ファイルをすべて読み込み、
    Document オブジェクトのリストとして返す。
    """
    docs: List[Document] = []
    doc_dir = config.DOCUMENTS_DIR  # backend/documents のパス

    # ディレクトリ自体が存在しない場合はエラー
    if not doc_dir.exists():
        raise RuntimeError(f"DOCUMENTS_DIR が存在しません: {doc_dir}")

    # documents/ 配下のファイルを1つずつ見る
    for path in doc_dir.iterdir():
        # ディレクトリはスキップ
        if not path.is_file():
            continue
        # 拡張子が .txt または .md のものだけを対象にする
        if path.suffix.lower() not in [".txt", ".md"]:
            continue

        # ファイル内容をUTF-8で読み込む
        content = path.read_text(encoding="utf-8")
        # ファイル名（拡張子なし）を ID として使う
        doc_id = path.stem
        # ファイル名（拡張子なし）をタイトルとして使う
        title = path.stem

        # Document インスタンスを作成してリストに追加
        docs.append(Document(id=doc_id, title=title, path=path, content=content))

    # 有効な文書が1つもなければエラーにする
    if not docs:
        raise RuntimeError(f"DOCUMENTS_DIR に有効な文書がありません: {doc_dir}")

    return docs
