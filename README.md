# General AI Agent with RAG（契約書向け）

手元の契約書や社内ドキュメントをベースに、LLM による対話・要約・検討を行うための **汎用タスク実行 AI エージェント** です。
RAG（Retrieval-Augmented Generation）と Web 検索を組み合わせ、複数セッションでの会話履歴も保持できます。

---

## 1. 機能概要

### ✅ RAG＋エージェント機能

* ChromaDB を用いたベクトル検索による RAG
* LangGraph ベースの簡易エージェントフロー
  * **質問意図解析**：文書に関連する質問か、一般的な会話かを自動判定
  * **RAG 実行の要否判定**：文書依存の場合のみ検索を実行
  * **Web 検索実行**（Tavily API）
  * **回答生成**：手元文書＋Web情報を統合して回答

### ✅ 文書登録（RAG 対象）

1. **テキスト貼り付けによる登録**
   * 利用シーン：NDA・業務委託契約・雇用契約などの契約書をそのまま貼り付けて登録
   * 項目：
     * 文書タイトル
     * 文書内容（全文コピペ）

2. **ファイルアップロードによる登録**
   * 対応形式：
     * `.txt`, `.md`, `.markdown`, `.json`（UTF-8）
     * `.pdf`（テキスト埋め込み型）
     * `.docx`（Wordファイル）
   * アップロード後、自動でテキスト抽出 → チャンク分割 → RAG インデックス登録

3. **登録済み文書一覧・削除**
   * 文書ごとの管理が可能（一覧表示、個別削除）

### ✅ セッション管理（ChatGPT 風）

* 左側サイドバーに **セッション一覧** を表示
* 各セッションごとに独立した会話履歴を持つ（localStorage保存）
* 機能：
  * **新規作成**：任意の名前でセッションを開始
  * **名称変更**：セッション名をいつでも編集可能
  * **削除**：不要なセッションを削除
  * **切り替え**：クリックでセッションを移動し、履歴を復元

### ✅ エージェント実行・回答表示

* **回答モード（プロファイル）**
  * 標準モード
  * 法務検討モード（条文番号や法的リスクへの言及を強化）
  * 要約モード
* **実行ログ表示**
  * エージェントの思考プロセス（Step）と、使用した参照元（References）を表示
  * RAGでヒットした文書タイトルや、Web検索で参照したURLを確認可能

---

## 2. アーキテクチャ

### フロントエンド (Vite + React + TypeScript)

* **言語**: TypeScript
* **コンポーネント構成**:
  * `App.tsx`: メインアプリケーションロジック・状態管理
  * `Sidebar.tsx`: サイドバー（セッション管理）
  * `ChatInterface.tsx`: チャット画面（メッセージ表示・入力）
  * `DocumentManager.tsx`: 文書管理画面（アップロード・一覧）
* **主なライブラリ**:
  * `react-markdown`: Markdownレンダリング
  * `lucide-react`: アイコン（必要に応じて）

### バックエンド (FastAPI + Python)

* **言語**: Python 3.10+
* **ディレクトリ構成**:
  * `app/main.py`: エントリーポイント
  * `app/routers/`: APIエンドポイント
    * `documents.py`: 文書管理API
    * `agent.py`: エージェント対話API
  * `app/services/`: 処理ロジック
    * `document_parser.py`: ファイル解析サービス
  * `app/agent/`: エージェント定義
    * `graph_builder.py`: LangGraphワークフロー構築
    * `nodes.py`: 各処理ノードの実装
    * `types.py`: 型定義
  * `app/rag/`: RAG関連
    * `retriever.py`: ChromaDB操作

---

## 3. セットアップ

### 3-1. 前提条件

* Node.js (v18以上推奨)
* Python (3.10以上推奨)
* OpenAI API Key
* Tavily API Key (Web検索用)

### 3-2. バックエンドの起動

1. ディレクトリ移動
   ```bash
   cd backend
   ```
2. 仮想環境作成・有効化
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```
3. 依存ライブラリインストール
   ```bash
   pip install -r requirements.txt
   ```
4. 環境変数設定 (`.env`)
   ```env
   OPENAI_API_KEY=sk-xxxx
   TAVILY_API_KEY=tvly-xxxx
   ```
5. サーバー起動
   ```bash
   # --reload-dir app を指定して再読み込みループを防止することを推奨
   uvicorn app.main:app --reload --reload-dir app --port 8000
   ```
   起動後、`http://localhost:8000/docs` でAPIドキュメントが確認できます。

### 3-3. フロントエンドの起動

1. ディレクトリ移動
   ```bash
   cd frontend
   ```
2. ライブラリインストール
   ```bash
   npm install
   ```
3. 開発サーバー起動
   ```bash
   npm run dev
   ```
   ブラウザで `http://localhost:5173` にアクセスしてください。

---

## 4. デプロイ

### フロントエンド（例: Vercel, Netlify）
* ビルドコマンド: `npm run build`
* 公開ディレクトリ: `dist`
* 環境変数:
  * `VITE_API_URL`: バックエンドのURL (例: `https://your-backend.onrender.com/api/agent/ask`)

### バックエンド（例: Render, Railway）
* ビルドコマンド: `pip install -r requirements.txt`
* 起動コマンド: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
* 環境変数:
  * `OPENAI_API_KEY`
  * `TAVILY_API_KEY`

---

## 5. ライセンス

MIT License
