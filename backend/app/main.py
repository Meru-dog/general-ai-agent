"""
backend/app/main.py

FastAPI アプリケーションのエントリーポイントです。
アプリケーションの初期化、CORS設定、各ルーターの登録、および起動時のイベントハンドラを定義します。
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 各機能ごとのルーターモジュールをインポート
# documents: 文書管理（アップロード・一覧・削除など）
# agent: エージェント対話機能
from app.routers import documents, agent
from app.routers.documents import get_retriever  # 起動時にインデックスの状態を確認するため

# FastAPI アプリケーションのインスタンス作成
app = FastAPI()

# =========================
# CORS (Cross-Origin Resource Sharing) 設定
# =========================
# フロントエンド (localhost:5173 など) からのアクセスを許可します。
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 開発環境用設定。本番環境ではフロントエンドのドメインを指定するなど制限が必要。
    allow_credentials=True,
    allow_methods=["*"],   # 全てのHTTPメソッド (GET, POST, OPTIONS etc.) を許可
    allow_headers=["*"],   # 全てのヘッダーを許可
)

# =========================
# ルーターの登録
# =========================
# 分割された機能モジュールをアプリケーションに組み込みます。
app.include_router(documents.router)
app.include_router(agent.router)

# =========================
# 起動時イベント
# =========================
@app.on_event("startup")
def startup_event():
    """
    アプリケーション起動時に実行される処理。
    RAG用のベクトルDB（Chroma）のインデックス状態を確認し、ログ出力します。
    """
    try:
        # RAGRetriever のインスタンスを取得（シングルトン的な挙動）
        retriever = get_retriever()
        # 現在登録されているチャンク数を取得
        count = retriever.collection.count()
        print(f"アプリケーション起動: インデックス確認完了（{count}件のチャンクが登録されています）")
    except Exception as e:
        # 起動時のエラーはログに出力するが、アプリ自体は停止させない
        print(f"警告: 起動時のインデックス確認に失敗しました: {e}")

# =========================
# ヘルスチェック
# =========================
@app.get("/")
async def root():
    """
    サーバーの稼働確認（ヘルスチェック）用エンドポイント。
    """
    return {"status": "ok", "message": "general-ai-agent backend is running"}
