# 汎用タスク実行 AI エージェント（General AI Agent）

ユーザーが自然言語で指示すると、
エージェントが「文書依存かどうか」を自動判定し、

* 文書依存 → 手元ドキュメントに対する RAG 検索＋回答
* 非文書依存 → LLM 単体での一般的な回答

を行うシンプルな **エージェント型 Web アプリケーション** です。

---

## 1. 特徴

* 🧠 **意図解析**
  入力された質問文をもとに、「手元文書前提か／一般知識で足りるか」をざっくり判定

* 📄 **RAG 連携**
  文書依存と判定された場合のみ、Chroma＋OpenAI Embedding で RAG 検索を実行

* 🧾 **思考ログの可視化**
  エージェントのステップ（意図解析 / RAG 実行 / 回答生成）を簡易ログとしてフロントに表示

* 🌐 **Web アプリとして利用可能**
  React フロントから、ブラウザだけで利用可能

---

## 2. アーキテクチャ

```text
User (Browser)
   ↓
React Frontend
   ↓  POST /api/agent/ask  (JSON: { input })
FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   ├─ ノード2: RAG 実行 or スキップ (rag)
   └─ ノード3: 回答生成 (answer)
        └─ OpenAI Chat モデル
   ↓
応答JSON: { output, steps[] } をフロントに返却
```

---

## 3. 技術スタック

* Backend

  * Python 3.11+
  * FastAPI
  * LangGraph
  * Chroma
  * OpenAI API（Chat + Embedding）
* Frontend

  * React
  * Vite
* Infra（例）

  * Backend: Render
  * Frontend: Vercel

---

## 4. 公開版アプリの使い方（利用者向け）

※ 実際の URL に置き換えてください。

1. フロントエンド URL を開く
   例：`https://<YOUR_FRONTEND_URL>`

2. テキスト入力欄に指示を入力

   * 例1（一般質問）：「このアプリの目的は？」
   * 例2（文書依存質問）：「業務委託契約の条項としてはどのようなものがありますか？」

3. 「送信」をクリックすると：

   * 上部に「回答」が表示
   * 下部に「実行ログ（analysis / rag / answer）」が表示され、

     * 文書依存かどうか
     * RAGが何件ヒットしたか
     * 回答生成ステップ
       が確認できます。

---

## 5. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント (/api/agent/ask)
│  │  ├─ config.py            # モデル名・パスなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義
│  │  │  ├─ nodes.py          # 各ステップ（analysis / rag / answer）の実装
│  │  │  └─ types.py          # AgentState / StepLog など
│  │  └─ rag/
│  │     ├─ document_loader.py
│  │     ├─ index_builder.py
│  │     ├─ retriever.py
│  │     └─ llm_client.py     # （必要に応じて）
│  ├─ documents/              # RAG 対象の文書 (.txt 等)
│  ├─ requirements.txt
│  └─ .env                    # OpenAI キーなど（Git 管理外）
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

## 6. 開発者向けセットアップ

### 6.1 バックエンド

```bash
cd backend

python -m venv .venv
source .venv/bin/activate  # Windows は .venv\Scripts\activate

pip install -r requirements.txt
```

`.env` を作成：

```bash
# backend/.env
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_LLM_MODEL="gpt-4.1-mini"
CHROMA_DIR="./chroma_db"
CHROMA_COLLECTION="documents"
DOCUMENTS_DIR="./app/documents"  # リポジトリ構成に合わせて調整
```

#### インデックス構築

```bash
cd backend
python -m app.rag.build_index
```

#### バックエンド起動

```bash
cd backend
uvicorn app.main:app --reload
```

---

### 6.2 フロントエンド

```bash
cd frontend
npm install
```

`src/App.jsx` で API URL を設定：

```js
const API_URL = "https://<YOUR_BACKEND_URL>/api/agent/ask";
// ローカル開発時の例： "http://localhost:8000/api/agent/ask"
```

ローカル開発サーバー起動：

```bash
npm run dev
```

ブラウザからアクセスして動作確認します。

---

## 7. デプロイ（概要）

### Backend（例：Render）

* Build Command：`pip install -r backend/requirements.txt`
* Start Command：`cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
* 環境変数に `.env` と同等の値（OpenAI API キー等）を設定

起動時に `index_builder` が自動実行される設計にしておけば、
Render 上でも初回起動時にインデックスが構築されます。

### Frontend（例：Vercel）

* Framework Preset：Vite
* Build Command：`npm run build`
* Output Directory：`dist`
* 環境に応じて `API_URL` を本番バックエンド URL に設定

---

## 8. 典型的なユースケース

* 自分の契約書・テンプレート集を `documents/` に入れておき、

  * 「この NDA の目的条項を要約して」
  * 「業務委託契約における成果物の権利帰属について教えて」
    などと質問 → 文書依存と判定された場合のみ RAG 実行

* 一方で、

  * 「このアプリは何をするもの？」
  * 「業務委託契約の一般的な条項を教えて」
    のような質問は、一般的な LLM 回答で処理し、
    不必要に RAG を叩かないことでコストを抑制

---

## 9. 制約・今後の拡張

### 制約（現状）

* Web検索や計算ツールなどは未実装（RAG＋LLM のみ）
* 長期メモリ（継続する会話コンテキスト）は持たず、
  1リクエストごとに完結する設計
* 文書アップロードはサーバー側に事前配置する方式

### 今後の拡張アイデア

* Web検索ツールの統合
* 簡単な計算ツール（日付計算、金額計算など）の追加
* 会話セッション単位でのメモリ保持（LangGraph の state 拡張）
* 所内ナレッジベースへの接続（注意深い権限・セキュリティ設計前提）

---

## 10. ライセンス

（必要に応じて追記：例：MIT License など）
