# backend/scripts/build_index.py
from pathlib import Path  # パス操作用
import sys                # sys.path をいじるため

# このファイル自身（scripts/build_index.py）のパスから backend/ を求める
BASE_DIR = Path(__file__).resolve().parent.parent

# backend/ のパスを Python のモジュール探索パスに追加
# → "from app.rag.index_builder import ..." ができるようになる
sys.path.append(str(BASE_DIR))

from app.rag.index_builder import build_index  # noqa: E402  # 上でsys.pathをいじった後にimportしているので警告抑制


if __name__ == "__main__":
    # このファイルを直接実行したときに、インデックス構築処理を行う
    build_index()
