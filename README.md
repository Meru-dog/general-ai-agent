# 汎用タスク実行 AI エージェント（General AI Agent）

ユーザーが自然言語で指示すると、エージェントがまず

* 「手元文書（RAG）が必要か」
* 「一般知識（LLMだけ）で足りるか」
* 「Web検索（Tavily）が必要か」

を判定し、適切なルートで回答を生成する **エージェント型 Web アプリケーション** です。

さらに、

* 手元文書は Web 画面から登録（コピペ or ファイルアップロード）
* 登録済み文書の一覧・削除
* 会話履歴の表示・クリア
* ブラウザリロード後も会話履歴を保持（localStorage）

といった運用まわりも含めて、ひと通り完結するようになっています。

---

## 1. 主な機能

### 1-1. 文書依存判定 ＋ RAG

* ユーザー入力をもとに

  * **文書依存（doc_dependent）**
  * **非文書依存（general）**
* を LangGraph ノードで判定
* 文書依存と判定された場合のみ、Chroma DB に対して RAG 検索を実行し、手元文書に基づいて回答

### 1-2. Web検索（Tavily）

* 「一般的な質問」や「Web で最新情報を取るべき質問」の場合は、Tavily API を通じて Web 検索を実行
* RAG結果 + Web検索結果 + モデルの一般知識を合わせて回答を生成

### 1-3. 文書登録（RAG インデックス）

**(A) テキスト貼り付けで登録**

* 画面上のフォームから

  * タイトル
  * 文書全文（コピペ）
* を入力して「文書を登録」ボタンを押すと、その内容が Chroma DB にチャンク分割されて保存されます。

**(B) ファイルアップロードで登録**

* 以下の形式に対応しています：

  * `.txt`, `.md`, `.markdown`, `.json`（UTF-8テキスト）
  * `.pdf`（テキスト埋め込み型のPDF）
  * `.docx`（Wordファイル）
* 選択したファイルをアップロードすると、バックエンド側でテキスト抽出 → チャンク分割 → Chroma へ登録まで自動で行います。

### 1-4. 登録済み文書の一覧・削除

* 画面上に「登録済み文書」テーブルが表示されます：

  * タイトル
  * `document_id`
  * チャンク数
  * 「削除」ボタン
* 「削除」ボタンを押すと、その `document_id` に紐づくチャンクが Chroma から削除されます。

### 1-5. 会話履歴の表示・保持・クリア

* 画面右側に「会話履歴」セクションを表示

  * 「ユーザー」と「エージェント」の発話が順番に表示され、Markdown も反映されるように整形済み
* 会話履歴（`messages`）は **ブラウザの localStorage に保存される** ため、

  * ページをリロードしても直前の会話内容が残ります
* 「会話履歴をクリア」ボタンを押すと

  * 画面上の履歴
  * localStorage に保存された履歴
    の両方が削除され、完全にリセットできます。

---

## 2. アーキテクチャ概要

```text
User (Browser)
   ↓
React Frontend (Vite)
   ├─ /api/agent/ask               ... 質問送信
   ├─ /api/documents/register      ... テキスト貼り付け登録
   ├─ /api/documents/upload       ... ファイルアップロード登録
   ├─ /api/documents (GET)        ... 登録済み文書一覧
   └─ /api/documents/{id} (DELETE)... 文書削除
   ↓
FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   ├─ ノード2: RAG 実行 or スキップ (rag)
   ├─ ノード3: Web検索 or スキップ (web_search)
   └─ ノード4: 回答生成 (answer)
        ├─ OpenAI Chat モデル
        └─ RAG + Web検索結果を統合して回答
   ↓
応答 JSON: { output, steps[], ... } をフロントに返却

＋ ブラウザ側では messages を localStorage に保存し、
  リロード時に復元して会話履歴を再表示
```

---

## 3. 技術スタック

### Backend

* Python 3.11+
* FastAPI
* LangGraph
* Chroma (local vector store)
* OpenAI API

  * Chat モデル（例: `gpt-4.1-mini`）
  * Embedding モデル（例: `text-embedding-3-small`）
* Tavily API（Web検索）
* pypdf（PDFテキスト抽出）
* python-docx（Word `.docx` テキスト抽出）

### Frontend

* React
* Vite
* Fetch API によるバックエンド通信
* ブラウザ `localStorage` による会話履歴保持

### Infra（例）

* Backend: Render
* Frontend: Vercel

---

## 4. 画面構成（ざっくり）

1. **文書登録エリア**

   * 「テキスト貼り付け」タブ

     * 文書タイトル
     * 文書内容（全文コピペ）
     * 「クリア」「文書を登録」ボタン
   * 「ファイルから登録」タブ

     * ファイル選択
     * 「ファイルをアップロードして登録」ボタン
     * 対応形式の説明（txt / md / pdf / docx）

2. **登録済み文書一覧テーブル**

   * タイトル
   * `document_id`
   * チャンク数
   * 「削除」ボタン
   * 「再読み込み」ボタン

3. **指示入力エリア**

   * テキストエリア（ユーザーの指示・質問を入力）
   * 「送信」ボタン
   * 送信中はローディング表示

4. **回答エリア**

   * 最新のエージェント回答（Markdown整形済み）

5. **実行ログエリア**

   * `analysis / rag / web_search / answer` の各ステップを簡易ログとして表示

6. **会話履歴エリア**

   * 過去のユーザー・エージェントのやり取りを時系列で一覧表示
   * Markdown が見やすいように整形
   * 「会話履歴をクリア」ボタンで messages ＋ localStorage をリセット

---

## 5. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント
│  │  ├─ config.py            # モデル名・パスなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義
│  │  │  ├─ nodes.py          # analysis / rag / web_search / answer ノード実装
│  │  │  └─ types.py          # AgentState / StepLog など
│  │  └─ rag/
│  │     ├─ document_loader.py
│  │     ├─ index_builder.py
│  │     ├─ retriever.py
│  │     └─ llm_client.py     # （必要に応じて）
│  ├─ documents/              # 初期RAG対象文書 (.txt 等)
│  ├─ requirements.txt
│  └─ .env                    # OpenAI/Tavily キーなど（Git管理外）
└─ frontend/
   ├─ index.html
   ├─ package.json
   ├─ vite.config.js
   └─ src/
      ├─ main.jsx
      ├─ App.jsx
      ├─ App.css
      └─ index.css
```

---

## 6. バックエンドのセットアップ

```bash
cd backend

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

`.env` を作成（例）：

```bash
# backend/.env
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_LLM_MODEL="gpt-4.1-mini"

CHROMA_DIR="./app/chroma_db"
CHROMA_COLLECTION="documents"
DOCUMENTS_DIR="./app/documents"  # 初期文書フォルダ

TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxx"
TAVILY_MAX_RESULTS="5"
```

### 6-1. 初期インデックス構築（ローカル開発時）

```bash
cd backend
python -m app.rag.build_index
```

### 6-2. バックエンド起動

```bash
cd backend
uvicorn app.main:app --reload
```

ブラウザで `http://127.0.0.1:8000/docs` にアクセスすると、Swagger UI から API を確認できます。

---

## 7. フロントエンドのセットアップ

```bash
cd frontend
npm install
```

`.env` または `vite.config` で API URL を設定（ローカル開発例）：

```bash
# frontend/.env
VITE_API_URL="http://localhost:8000/api/agent/ask"
VITE_API_BASE_URL="http://localhost:8000"
```

`npm run dev` で起動：

```bash
npm run dev
# 例: http://localhost:5173/ にアクセス
```

---

## 8. 典型的なユースケース

### 8-1. 手元の契約書をRAG対象にした Q&A

1. `documents/` に NDA や業務委託契約書などを置く
   またはフロントからファイルアップロード／テキスト貼り付けで登録
2. 「このNDAの目的条項を要約して」などと質問
3. 文書依存と判定された場合、該当文書のチャンクを元に回答
4. 会話履歴にログが蓄積され、次回アクセス時も同じブラウザなら履歴を継続利用可能

### 8-2. 一般的な法律・ビジネス系質問（＋Web検索）

* 「NDA締結時の一般的な注意点は？」
* 「業務委託契約と雇用契約の違いを教えて」
* 「最近の生成AI契約でよく問題になるポイントは？」

など、文書依存ではない質問は Web検索＋LLM で回答します。

---

## 9. 会話履歴（ローカル保存）の仕様

* ブラウザ側で `messages`（user/assistant の配列）を `localStorage` に保存

  * キー名：`general-ai-agent:messages`
* 初回ロード時に localStorage から読み込み、React の state 初期値として利用
* `会話履歴をクリア` ボタンを押すと：

  * React の state を空にリセット
  * localStorage の `general-ai-agent:messages` も削除
* サーバー側には会話履歴を保存していません（ローカルのみ）

---

## 10. デプロイ（例）

### Backend（Render）

* Root Directory: `backend`

* Build Command: `pip install -r backend/requirements.txt`

* Start Command（例）：

  ```bash
  cd backend && python -m app.rag.build_index && uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

* Render の Dashboard で環境変数を設定：

  * `OPENAI_API_KEY`
  * `OPENAI_EMBEDDING_MODEL`
  * `OPENAI_LLM_MODEL`
  * `CHROMA_DIR`
  * `CHROMA_COLLECTION`
  * `DOCUMENTS_DIR`
  * `TAVILY_API_KEY`
  * など

### Frontend（Vercel）

* Framework Preset: Vite
* Build Command: `npm run build`
* Output Directory: `dist`
* 環境変数：

  * `VITE_API_URL`：本番バックエンドの `/api/agent/ask` エンドポイント
  * `VITE_API_BASE_URL`：本番バックエンドのベースURL（例: `https://general-ai-agent.onrender.com`）

---

## 11. 今後の拡張アイデア

* セッション（案件）単位の会話履歴管理（複数スレッドの切り替え）
* 役割プリセット（「NDAレビュー」「M&A DD」などモード切り替え）
* 所内ナレッジベース（プライベートリポジトリ／社内Wiki）との連携
* ユーザーごとに文書・履歴を分離管理する認証付きバージョン
* 簡易な数値計算・日付計算ツールの統合

---

## 12. ライセンス
本リポジトリは MIT License のもとで公開されています。