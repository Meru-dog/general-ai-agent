# 汎用タスク実行 AI エージェント（General AI Agent）

自然言語で指示を送ると、

* その質問が **「手元文書に依存するか」**
* それとも **「一般知識だけで答えられるか」**
* さらに **「Web で最新情報を調べる必要があるか」**

をエージェントが自動で判定し、

* 文書依存 → 手元ドキュメントに対する **RAG 検索＋回答**
* 非文書依存 → **LLM 単体での一般的な回答**
* ニュース／相場など → **Web 検索＋LLM による要約**

を行うシンプルな **エージェント型 Web アプリケーション** です。

フロントエンドから

* 文書の手動登録（コピペ）
* ファイルからの登録（`.txt / .md / .pdf / .docx`）
* 質問入力 → 回答＋実行ログの確認

までをブラウザだけで完結できます。

---

## 1. 特徴

### 🧠 意図解析（Intent Analysis）

* ユーザー入力をもとに、

  * 「手元文書前提（doc_dependent）」か
  * 「一般知識で足りるか（general）」
    を LangGraph 上のノードで簡易判定します。
* アプリ側では、この判定に応じて RAG・Web 検索の使い方を切り替えています。

### 📄 RAG（手元文書ベースの検索）

* Chroma + OpenAI Embedding によるシンプルな RAG 実装です。
* 文書の登録方法は 2 通りあります：

  1. 画面上のフォームから **タイトル＋本文を直接コピペして登録**
  2. 画面の「ファイルから登録」から **`.txt / .md / .pdf / .docx` をアップロード**
* 登録された文書はチャンク化され、Chroma に保存されます。
* 「文書依存」と判定された質問については、RAG 検索結果を優先して回答を生成します。

### 📎 ファイルアップロード対応

* フロントからアップロードできる形式：

  * `.txt`, `.md`, `.markdown`, `.json`（UTF-8 テキスト）
  * `.pdf`（テキスト埋め込み型の PDF）
  * `.docx`（Word ファイル）
* バックエンド側でテキスト抽出したうえで、RAG 用インデックスに登録します。
* スキャン画像だけの PDF は、テキストが抽出できないためエラーとなります。

### 🌐 Web 検索連携

* 「今日」「最近」「ニュース」「相場」「為替」「株価」「金利」などのキーワードを含む質問の場合、

  * Web 検索（Tavily API）を自動実行し、
  * 結果を LLM のコンテキストに組み込んで回答します。
* 文書依存の質問の場合は、**手元文書の内容を優先**しつつ、必要に応じて Web 結果を補足情報として利用します。

### 🧾 思考ログの可視化

* LangGraph の各ステップ（ノード）の実行状況を、

  * `analysis`（意図解析）
  * `rag`（RAG 実行 or スキップ）
  * `web-search`（Web 検索実行 or スキップ）
  * `answer`（回答生成）
* といった形でフロントに表示します。
* 「RAG を使ったのか」「Web 検索を実行したのか」が一目でわかります。

### 💻 Web アプリとして利用可能

* フロントエンドは React + Vite。
* バックエンドは FastAPI。
* 必要な API URL を `.env` / Vite の環境変数で切り替えれば、

  * ローカル開発（localhost）
  * Render / Vercel などへのデプロイ
    の両方でそのまま利用できます。

---

## 2. アーキテクチャ

```text
User (Browser)
   ↓
React Frontend
   ├─ 文書登録フォーム（タイトル＋本文を直接POST）
   ├─ ファイルアップロード（txt/md/pdf/docx）
   └─ 質問送信フォーム
        ↓  POST /api/agent/ask  (JSON: { input })
FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   ├─ ノード2: RAG 実行 or スキップ (rag)
   ├─ ノード3: Web 検索実行 or スキップ (web-search)
   └─ ノード4: 回答生成 (answer)
        ├─ OpenAI Chat モデル
        └─ 手元文書＋Web検索結果を統合
   ↓
応答 JSON: { output, steps[] } をフロントに返却
```

---

## 3. 技術スタック

### Backend

* Python 3.11+
* FastAPI
* LangGraph
* Chroma DB（ローカルディスク保存）
* OpenAI API

  * Chat モデル（例：`gpt-4.1-mini` など）
  * Embedding モデル（例：`text-embedding-3-small`）
* Tavily Search API（Web 検索）

### Frontend

* React 18
* Vite
* Fetch API を用いたシンプルな API 呼び出し

### Infra（例）

* Backend: Render / Railway / Fly.io など
* Frontend: Vercel / Netlify など

---

## 4. 画面イメージと使い方（利用者向け）

### 4-1. 文書登録（手入力）

1. 画面上部の「文書登録（RAG対象にする文書）」セクションで、

   * 文書タイトル
   * 文書内容（全文）
     を入力します。
2. 「文書を登録」ボタンを押すと、バックエンド側で

   * テキストをチャンク化
   * Chroma に保存
     が行われ、RAG 対象として利用可能になります。

### 4-2. ファイルから登録

1. 「ファイルから登録」セクションで、

   * `.txt`, `.md`, `.pdf`, `.docx` などのファイルを選択します。
2. 「ファイルをアップロードして登録」ボタンを押すと、

   * サーバー側でテキスト抽出
   * チャンク化して Chroma に保存
     が実行されます。
3. 成功すると、画面に「◯◯.pdf を RAG インデックスに登録しました」といったメッセージが表示されます。

### 4-3. 質問を送る

1. 下部の「指示（質問）を入力してください：」欄に質問を入力します。

   例）

   * 「この契約書の成果物の権利帰属を要約して」
   * 「この NDA の秘密保持義務の範囲を整理して」
   * 「今日の為替相場を教えて」
   * 「最近の AI 規制に関する動向を教えて」

2. 「送信」ボタンを押すと、

   * 上部に **回答** が表示されます。
   * 下部に **実行ログ（analysis / rag / web-search / answer）** が表示され、

     * 文書依存かどうか
     * RAG が何件ヒットしたか
     * Web 検索を実行したか
     * どの順番でステップが実行されたか
       が確認できます。

---

## 5. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント
│  │  ├─ config.py            # モデル名・パス・APIキーなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義（analysis / rag / web-search / answer）
│  │  │  ├─ nodes.py          # 各ステップの実装
│  │  │  └─ types.py          # AgentState / StepLog などの型
│  │  ├─ rag/
│  │  │  ├─ document_loader.py
│  │  │  ├─ index_builder.py
│  │  │  ├─ build_index.py    # 初期インデックス構築スクリプト（任意）
│  │  │  └─ retriever.py      # Chroma への登録・検索
│  │  └─ tools/
│  │     └─ web_search.py     # Tavily を使った Web 検索ラッパ
│  ├─ documents/              # 必要に応じて初期文書を配置
│  ├─ requirements.txt
│  └─ .env                    # OpenAI / Tavily キーなど（Git 管理外）
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

## 6. バックエンドセットアップ（開発者向け）

### 6-1. インストール

```bash
cd backend

python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

### 6-2. 環境変数（`.env`）

`backend/.env` を作成し、少なくとも次を定義します：

```bash
# OpenAI
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
OPENAI_LLM_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

# Chroma
CHROMA_DIR="./app/chroma_db"
CHROMA_COLLECTION="documents"

# 文書ディレクトリ（初期インデックス用に使う場合）
DOCUMENTS_DIR="./app/documents"

# Tavily（Web検索）
TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxx"
```

### 6-3. （任意）初期インデックス構築

リポジトリにあらかじめ `documents/` を置いておき、初期インデックスを作りたい場合：

```bash
cd backend
python -m app.rag.build_index
```

※ アプリ起動後は、フロントからの「文書登録」「ファイルから登録」でインデックスを追加していく運用も可能です。

### 6-4. バックエンド起動

```bash
cd backend
uvicorn app.main:app --reload
```

* `http://localhost:8000/docs` から Swagger UI を確認できます。
* `POST /api/agent/ask` でエージェント API をテストできます。
* `POST /api/documents/register` / `POST /api/documents/upload` で文書登録 API をテストできます。

---

## 7. フロントエンドセットアップ

```bash
cd frontend
npm install
```

### 7-1. 環境変数（Vite）

`frontend/.env.local` などに、バックエンドのエージェント API URL を指定します。

```bash
# 例：ローカル開発
VITE_API_URL="http://localhost:8000/api/agent/ask"
```

> ※ バックエンドの `/api/agent/ask` に直接向ける想定です。
> デプロイ環境では Render 等の URL に置き換えてください。

必要に応じて、文書アップロード用の URL も環境変数化できます（例）：

```bash
VITE_UPLOAD_URL="http://localhost:8000/api/documents/upload"
```

### 7-2. 開発サーバー起動

```bash
npm run dev
```

ブラウザで `http://localhost:5173` にアクセスして動作を確認します。

---

## 8. デプロイ（概要）

### Backend（例：Render）

* Build Command：`pip install -r backend/requirements.txt`
* Start Command：`cd backend && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
* 環境変数として `.env` 相当の値を設定（OPENAI_API_KEY / TAVILY_API_KEY など）
* 永続化されたディスクを利用する場合は、`CHROMA_DIR` をそのパスに設定

### Frontend（例：Vercel）

* Framework Preset：Vite
* Build Command：`npm run build`
* Output Directory：`dist`
* `VITE_API_URL` / `VITE_UPLOAD_URL` を本番バックエンドの URL に合わせて設定

---

## 9. 典型的なユースケース

* 自分の契約書・テンプレート集を `documents/` に入れる or 画面から登録しておき、

  * 「この NDA の目的条項を要約して」
  * 「業務委託契約における成果物の権利帰属について教えて」
  * 「この雇用契約書の競業避止条項を整理して」
    などと質問 → 文書依存と判定された場合に RAG 実行

* 一方で、純粋な一般論や最新情報は Web 検索に任せる：

  * 「業務委託契約の一般的な条項を教えて」
  * 「今日のドル円相場を教えて」
  * 「最近の生成AI規制のニュースをざっくりまとめて」
    → 文書依存ではないと判定された場合、一般知識＋Web検索で回答

* 社内ナレッジベースの簡易ビューア／QA ボットとして：

  * 就業規則 / 社内ルール / 手順書 PDF をまとめてアップロード
  * そこに対して QA を投げる

---

## 10. 制約・今後の拡張

### 制約（現状）

* Web 検索は Tavily API に依存
* 会話履歴はセッション内の軽いコンテキスト利用にとどまり、

  * 長期メモリ（ユーザーごとの継続的なコンテキスト保存）は未実装
* 文書アップロードはプレーンテキスト／テキスト抽出前提

  * 画像だけの PDF（スキャン）には対応していません

### 今後の拡張アイデア

* Web 検索 ON/OFF のトグルスイッチをフロントに実装
* セッション単位のメモリ保持（LangGraph の state 拡張）によるマルチターン QA 強化
* 文書ごとの管理機能（一覧表示／削除／タグ付け）
* 所内ナレッジベースや DMS との連携（権限・セキュリティ設計を含めて）

---

## 11. ライセンス

必要に応じて、MIT など任意の OSS ライセンスを付与してください。
