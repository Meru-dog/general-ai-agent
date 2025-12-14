# General AI Agent with RAG（契約書向け）

手元の契約書や社内ドキュメントをベースに、LLM による対話・要約・検討を行うための **汎用タスク実行 AI エージェント** です。
RAG（Retrieval-Augmented Generation）と Web 検索を組み合わせ、複数セッションでの会話履歴も保持できます。

---

## 1. 機能概要

### ✅ RAG＋エージェント機能

* ChromaDB を用いたベクトル検索による RAG
* LangGraph ベースの簡易エージェントフロー

  * 質問意図解析（文書依存か一般質問か）
  * RAG 実行の要否判定
  * Web 検索実行（Tavily API）
  * 回答生成（手元文書＋Web情報を考慮）

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

   * `document_id / タイトル / チャンク数` をテーブル表示
   * 個別削除ボタンから RAG インデックスからの削除が可能

### ✅ セッション管理（ChatGPT 風）

* 左側サイドバーに **セッション一覧** を表示
* 各セッションごとに独立した会話履歴を持つ
* セッションごとの情報：

  * **セッションタイトル**
  * **メッセージ数**
  * **削除ボタン**
* セッション切り替えで、対応する会話履歴（messages）が復元されます

#### セッションに関する操作

* **新規作成**

  * 「＋ 新規」ボタン押下時に、セッション名の入力を求めるダイアログを表示
  * 入力された名称がそのままセッションタイトルとして使用されます
* **名称変更**

  * サイドバーのセッション名をクリックすると、名称編集用の入力ダイアログが開きます
  * 編集後の名称は即時反映され、画面上部のタイトルにも連動します
* **削除**

  * サイドバー上の各セッションごとに「削除」ボタンを配置
  * 押下すると確認ダイアログ表示後、セッションとその会話履歴が削除されます
  * アクティブセッションを削除した場合は、残っているセッションのうち先頭をアクティブにします（存在しない場合は新規作成）

### ✅ 会話履歴（セッションごと）

* 各セッションごとに以下を保持：

  * `messages`: `{ role: "user" | "assistant", content: string }[]`
* UI 上の機能：

  * 「会話履歴」カードでメッセージ一覧を気泡（バブル）表示
  * Markdown（見出し・箇条書き・太字など）を `react-markdown` でレンダリング
  * 「会話履歴をクリア（現在のセッション）」ボタンで該当セッションの履歴のみ削除

### ✅ エージェント実行・回答表示

* **回答モード（プロファイル）**

  * 標準モード
  * 法務検討モード

    * 条文番号や法的リスクへの言及を強めたプロンプト
  * 要約モード
* 質問入力フォームからエージェントを実行

  * 送信後、入力欄は自動でクリア
  * 実行結果は「回答」カードに Markdown 表示
* 「実行ログ（エージェントの思考・行動）」カードで

  * `analysis / rag / web_search / answer` などのステップログを時系列表示

---

## 2. アーキテクチャ

### フロントエンド

* Vite + React
* 主なライブラリ

  * `react-markdown`：回答文・会話履歴の Markdown 表示
* 主な役割

  * RAG 対象文書の登録 UI（テキスト・ファイル）
  * 登録済み文書一覧・削除 UI
  * セッション一覧・作成・名称変更・削除
  * 会話履歴と回答・実行ログの表示
  * API 呼び出し（`/api/agent/ask`, `/api/documents/*`）

### バックエンド

* FastAPI + Uvicorn
* 主なコンポーネント

  * `app.main`：API エンドポイント定義

    * `/` … ヘルスチェック用
    * `/api/agent/ask` … エージェント実行
    * `/api/documents/register` … テキスト文書登録
    * `/api/documents/upload` … ファイルアップロード登録
    * `/api/documents` … 登録済み文書一覧
    * `/api/documents/{document_id}` … 文書削除
  * `app.agent.graph_builder`：LangGraph によるエージェントフロー定義
  * `app.rag.retriever`：ChromaDB を用いた RAG 検索
  * `app.rag.index_builder`：初期インデックス構築用スクリプト
  * Tavily API を用いた Web 検索ノード

### データストア

* `ChromaDB`（ローカルディレクトリ：`backend/app/chroma_db`）

  * `doc_id / document_title / chunk_id / content / metadata` を保持

* ブラウザ `localStorage`

  * セッション一覧：`general-ai-agent:sessions`
  * アクティブセッションID：`general-ai-agent:active-session`
  * 各セッションのメッセージ：`general-ai-agent:messages:<sessionId>`

---

## 3. セットアップ

### 3-1. 前提

* Node.js / npm（または pnpm / yarn）
* Python（3.10+ 推奨）
* OpenAI API キー
* Tavily API キー

### 3-2. リポジトリ取得

```bash
git clone <your-repo-url>
cd general-ai-agent
```

### 3-3. バックエンドセットアップ

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows の場合: .venv\Scripts\activate
pip install -r requirements.txt
```

#### 環境変数（.env）

`backend/.env` などに必要なキーを設定します。

```env
OPENAI_API_KEY=sk-xxxx
TAVILY_API_KEY=tvly-xxxx
# 必要に応じて
# ALLOWED_ORIGINS=http://localhost:5173
```

#### インデックス構築（初回）

```bash
cd backend
python -m app.rag.build_index
```

（※ 空のまま運用する場合は省略可。起動ログにインデックス件数が表示されます）

#### バックエンド起動

```bash
uvicorn app.main:app --reload --port 8000
```

* 起動後、`http://localhost:8000/docs` から Swagger UI で API 動作確認が可能です。

### 3-4. フロントエンドセットアップ

```bash
cd frontend
npm install
```

#### 環境変数（フロント）

`frontend/.env` などに API の URL を指定します。

```env
VITE_API_URL=http://localhost:8000/api/agent/ask
```

#### フロントエンド起動

```bash
npm run dev
```

* 通常は `http://localhost:5173/` でアクセスできます。

---

## 4. 主な使い方

1. **文書登録**

   * 左メイン画面上部の「文書登録（テキスト貼り付け）」または「文書登録（ファイルアップロード）」から、
     手元の契約書等を RAG インデックスに登録します。

2. **セッション作成**

   * 左サイドバーの「＋ 新規」ボタンから、任意のセッション名を入力して作成
   * セッション名は後からクリックして変更することも可能
   * 不要になったセッションは「削除」ボタンで削除

3. **質問・対話**

   * 「エージェント実行」カードの「回答モード」を選択
   * 質問文を入力して「送信」
   * RAG（手元の文書）＋ Web 検索結果を踏まえた回答が表示されます
   * Markdown による見出し・箇条書きなどもそのままレンダリングされます

4. **実行ログの確認**

   * 「実行ログ」カードで、エージェント内部のステップログ（意図解析 / RAG 実行 / Web検索 / 回答生成など）を確認できます。

---

## 5. デプロイ時の注意点

* **バックエンド（例：Render）**

  * Start Command の例：

    ```bash
    python -m app.rag.build_index && uvicorn app.main:app --host 0.0.0.0 --port $PORT
    ```
  * 環境変数：

    * `OPENAI_API_KEY`
    * `TAVILY_API_KEY`
    * 必要に応じて `ALLOWED_ORIGINS`（フロントの URL）

* **フロントエンド（例：Vercel など）**

  * 環境変数 `VITE_API_URL` に、デプロイ済みバックエンドの `/api/agent/ask` のフル URL を設定
    例：`https://general-ai-agent.onrender.com/api/agent/ask`

---

## 6. 制約・注意事項

* 会話履歴・セッション情報は **ブラウザの localStorage** に保存されます。

  * 端末やブラウザを跨いだ同期は行いません。
  * ブラウザのストレージクリアやシークレットモードでは履歴は保持されません。
* アップロードした文書は、バックエンド側のローカルディスク（Chroma のストレージ）に埋め込まれます。
* 法的な回答はあくまで参考情報であり、最終的な判断は必ず専門家が行う前提のツールです。

---

## 7. ライセンス

このリポジトリは **MIT License** のもとで公開されています。
詳細はリポジトリ内の `LICENSE` ファイルを参照してください。
