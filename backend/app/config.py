# =========================
# 設定ファイル
# =========================
import os
from pathlib import Path
from dotenv import load_dotenv

# .env から環境変数を読み込み
load_dotenv()

# =========================
# OpenAI API
# =========================
# APIキー（環境変数から取得）
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY")

# LLMモデル（LangGraphの推論用モデル）
LLM_MODEL: str = "gpt-4.1-mini"  # or "gpt-4o-mini"

# 埋め込みモデル（文書ベクトル化用）
EMBEDDING_MODEL: str = "text-embedding-3-small"


# =========================
# Chroma の設定
# =========================
# ベクトルDB格納先（相対パス → backend/app/chroma_db）
BASE_DIR = Path(__file__).resolve().parent
CHROMA_DIR = BASE_DIR / "chroma_db"

# コレクション名（テーブル名のようなもの）
CHROMA_COLLECTION: str = "documents"


# =========================
# RAGドキュメント
# =========================
# 文書配置ディレクトリ（backend/app/documents）
DOCUMENTS_DIR = BASE_DIR / "documents"
