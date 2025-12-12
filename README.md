# 汎用タスク実行 AI エージェント（General AI Agent）

ブラウザから自然言語で指示すると、

* 「手元文書を読まないと答えられない質問」か
* 「一般知識だけで答えられる質問」か

をエージェントが自動で判定し、

* 文書依存 → 手元ドキュメントに対する RAG（Chroma＋Embedding）検索＋回答
* 非文書依存 → LLM 単体での一般的な回答
* 必要に応じて Web 検索（Tavily API）も併用

を行う **エージェント型 Web アプリケーション** です。

契約書（NDA・業務委託・雇用契約など）に特化せず、任意のドキュメントを対象にできます。

---

## 1. 特徴

### 🧠 質問意図の自動判定

* 入力された質問文から、

  * 「手元の documents を前提にすべきか（文書依存）」
  * 「一般的な知識だけで足りるか（非文書依存）」
    を LangGraph のノードでざっくり判定します。

### 📄 RAG（手元文書検索）

* 文書依存と判定された場合のみ、

  * Chroma（ベクターストア）
  * OpenAI Embedding（`text-embedding-3-small` など）
* を使って RAG 検索を実行し、類似度の高いチャンクを取得して回答に反映します。

### 📂 文書登録（テキスト＆ファイル）

RAG 対象の文書は、ブラウザから登録できます。

* **テキスト貼り付け**

  * タイトル＋本文をフォームに入力して登録
* **ファイルアップロード**

  * 対応形式：

    * `.txt`, `.md`, `.markdown`, `.json`（UTF-8 テキスト）
    * `.pdf`（テキスト埋め込み型）
    * `.docx`（Word ファイル）
  * 複数ファイルを順次アップロード可能
* 登録済み文書は一覧表示され、`document_id` 単位で削除も可能です。

### 🌐 Web 検索連携（Tavily）

* 「一般知識でも回答できるが、最新情報や補足があると望ましい」ケースで Web 検索を実行
* Tavily API を使って外部サイトから要約情報を取得し、回答に統合
* 環境変数で Web 検索のオン／オフ切り替えや検索件数などを調整可能

### 💬 会話履歴の保持・表示・クリア

* ユーザーとエージェントの発話を会話履歴として保持
* フロントエンドで「ユーザー」「エージェント」ごとのチャットバブルとして表示
* マークダウン（見出し・箇条書き・強調など）をレンダリング
* 「会話履歴をクリア」ボタンで、セッション内の履歴を任意タイミングで消去可能

### 🎛 回答モード（プロファイル）切り替え

質問送信時に、回答のスタイルをフロント側から切り替えられます。

* **標準**

  * これまでどおりのバランスの取れた説明回答
* **法務検討モード**

  * 条文番号や条文構造、リスク・限界の指摘などを厚めに出す
  * 「一般論」と「手元文書に基づく話」をできるだけ区別して説明
* **要約モード**

  * できるだけ短く、要点を箇条書き中心で出力することを優先

バックエンドの API 仕様はそのままに、フロント側でプロンプトを組み立てて切り替えています。

### 🧾 思考ログの可視化（LangGraph ステップ）

* LangGraph エージェントのノードごとの処理を「実行ログ」として表示

  * 例：`analysis` / `rag` / `web_search` / `answer` など
* 「どのような判断で文書依存判定されたか」「RAG が何件ヒットしたか」等を確認できます。

### 🌐 Web アプリとして利用可能

* React（Vite）フロントエンドから、ブラウザだけで利用可能
* Backend（FastAPI）は Render 等にデプロイ可能
* Frontend は Vercel 等にデプロイすることを想定

---

## 2. アーキテクチャ

```text
User (Browser)
   ↓
React Frontend (Vite, ReactMarkdown)
   ↓  POST   /api/agent/ask          (JSON: { input, history[] })
      POST   /api/documents/register (JSON: { title, content })
      POST   /api/documents/upload   (multipart/form-data: file[, title])
      GET    /api/documents          (文書一覧)
      DELETE /api/documents/{id}     (文書削除)
FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   ├─ ノード2: RAG 実行 or スキップ (rag)
   ├─ ノード3: Web 検索 or スキップ (web_search)
   └─ ノード4: 回答生成 (answer)
        └─ OpenAI Chat モデル + RAG結果 + Web検索結果
   ↓
応答 JSON: {
  output: string,
  steps: StepLog[],
}
をフロントに返却
```

---

## 3. 技術スタック

### Backend

* Python 3.11+
* FastAPI
* LangGraph
* Chroma（ベクターストア）
* OpenAI API

  * Chat モデル（例：`gpt-4.1-mini` 等）
  * Embedding モデル（例：`text-embedding-3-small`）
* Tavily API（Web検索）
* pypdf / python-docx（PDF / Word のテキスト抽出）

### Frontend

* React
* Vite
* ReactMarkdown（回答・会話履歴の Markdown 表示）
* シンプルな CSS（モバイル対応レイアウト）

### Infra（想定例）

* Backend: Render（Python Web Service）
* Frontend: Vercel（Vite プロジェクト）

---

## 4. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント
│  │  ├─ config.py            # モデル名・パスなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義
│  │  │  ├─ nodes.py          # 各ステップ（analysis / rag / web_search / answer）
│  │  │  └─ types.py          # AgentState / StepLog など
│  │  └─ rag/
│  │     ├─ document_loader.py
│  │     ├─ index_builder.py
│  │     ├─ retriever.py      # Chroma とのやり取り（検索・文書登録・削除）
│  ├─ documents/              # 初期登録用の文書（任意）
│  ├─ chroma_db/              # ベクターストアの永続化ディレクトリ（起動後に生成）
│  ├─ requirements.txt
│  └─ .env                    # OpenAI / Tavily キー等（Git 管理外）
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

## 5. 公開版アプリの使い方（利用者向け）

### 5.1 基本的な利用の流れ

1. フロントエンドの URL を開く
   例：`https://<YOUR_FRONTEND_URL>`

2. 必要に応じて文書を登録する

   * 「文書登録（RAG対象にする文書）」セクションから：

     * テキスト貼り付けで契約書や規程全文を登録
     * もしくはファイルアップロードで `.txt / .md / .pdf / .docx` を登録

3. 「指示（質問） / 会話」セクションで指示を入力

   * 例（文書依存）：

     * 「この NDA の秘密保持義務条項のポイントを要約して」
     * 「この業務委託契約の成果物の権利帰属を説明して」
   * 例（一般質問）：

     * 「業務委託契約と雇用契約の一般的な違いを教えて」

4. 必要に応じて「回答モード」を選択

   * 標準 / 法務検討モード / 要約モード から選択

5. 「送信」ボタンを押すと：

   * 上部に「回答」が表示（Markdown で整形表示）
   * 下部「実行ログ」に analysis / rag / web_search / answer のステップログ
   * 左側（または上部）に会話履歴（ユーザー／エージェント）がチャット形式で表示

6. 会話履歴をクリアしたい場合は「会話履歴をクリア」ボタンを押下

---

## 6. 開発者向けセットアップ

### 6.1 バックエンド

```bash
cd backend

python -m venv .venv
source .venv/bin/activate       # Windows は .venv\Scripts\activate

pip install -r requirements.txt
```

`.env` を作成（例）：

```bash
# backend/.env
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"
OPENAI_LLM_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

CHROMA_DIR="./app/chroma_db"
CHROMA_COLLECTION="documents"
DOCUMENTS_DIR="./app/documents"   # 必要に応じて変更

# Web検索（Tavily）
TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxx"
TAVILY_ENABLED=true             # false にすると Web 検索を無効化
TAVILY_MAX_RESULTS=5            # 必要なら検索件数なども調整
```

#### （任意）ローカルでのインデックス構築

すでに `documents/` フォルダに初期文書がある場合：

```bash
cd backend
python -m app.rag.build_index
```

#### バックエンド起動

```bash
cd backend
uvicorn app.main:app --reload
```

起動ログに

```text
アプリケーション起動: インデックス確認完了（XX件のチャンクが登録されています）
```

のようなメッセージが出れば成功です。

---

### 6.2 フロントエンド

```bash
cd frontend
npm install
```

`.env` または `.env.local` を作成し、バックエンドの URL を指定：

```bash
# frontend/.env.local
VITE_API_URL="http://localhost:8000/api/agent/ask"
# デプロイ後はバックエンドの本番URLに変更
# 例: "https://general-ai-agent.onrender.com/api/agent/ask"
```

ローカル開発サーバー起動：

```bash
npm run dev
```

ブラウザで `http://localhost:5173`（デフォルト）にアクセスして動作確認します。

---

## 7. 文書管理（一覧・削除）

フロントエンドの「登録済み文書」セクションから：

* 「再読み込み」ボタン
  → `/api/documents` から一覧取得し、タイトル・document_id・チャンク数を表示
* 各行の「削除」ボタン
  → `/api/documents/{document_id}` で対象文書のチャンクをすべて削除

バックエンド側で管理しているのは「チャンク（分割済みテキスト）」なので、
1つの `document_id` に対応するチャンクがすべて消えます。

---

## 8. 会話・回答モードについて

### 8.1 会話履歴

* `history` としてバックエンドに渡し、LangGraph 側で文脈付きの応答が可能
* フロントでユーザー／エージェントの発話をチャットバブルとして表示
* `ReactMarkdown` を使って Markdown をレンダリング

  * 長文回答の見出し・箇条書きが読みやすく表示されます

### 8.2 回答モード（プロファイル）

* フロントのセレクトボックスからモードを選択すると、

  * 送信前にプロンプトの先頭に「モード説明＋指示文」が自動で付与され、
  * バックエンドの LLM に対する出力スタイルを制御します。

モードの追加・調整は、フロントエンドの `ANSWER_PROFILES` を編集するだけで可能です。

---

## 9. デプロイ（概要）

### Backend（例：Render）

* **Service Type**: Web Service

* **Environment**: Python

* **Build Command**:

  ```bash
  pip install -r backend/requirements.txt
  ```

* **Start Command**:

  ```bash
  cd backend && python -m app.rag.build_index && uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

  * 起動時にインデックス構築 → FastAPI 起動の順で動かす想定です。

* 環境変数（Render のダッシュボードから）：

  * `.env` と同等の値（OpenAI / Tavily / Chroma 設定など）を登録

### Frontend（例：Vercel）

* **Framework Preset**: Vite
* **Build Command**: `npm run build`
* **Output Directory**: `dist`
* 環境変数：

  * `VITE_API_URL` を Render で動いている Backend の URL（`/api/agent/ask` まで含める）に設定

---

## 10. 制約・今後の拡張

### 現状の制約

* Web 検索は Tavily API に依存（利用には API キーが必要）
* 長期的な「ユーザーごとの永続メモリ」は未実装
  → 現在は 1 セッション内での会話履歴のみ
* 文書アップロードは 1 ファイルずつ（バッチアップロード未対応）
* 認証・認可（ユーザーごとの文書分離）は未実装（開発用・社内 PoC 想定）

### 今後の拡張アイデア

* ユーザーアカウント単位での文書・会話履歴の分離
* より多機能なツールチェーン（計算・カレンダー・メール等）の追加
* 会話セッション単位でのメモリ保持（LangGraph の state 拡張）
* 組織内ナレッジベースとの連携（社内 Confluence / Notion 等）

---

## 11. ライセンス

このリポジトリは、必要に応じて OSS ライセンスを付与して公開できます。

例として MIT License を利用する場合：

1. リポジトリ直下に `LICENSE` ファイルを作成し、MIT License の本文を記載
2. 本 README 末尾に、次のような記述を追加します：

```text
本リポジトリは MIT License のもとで公開されています。
詳細はリポジトリ直下の LICENSE ファイルを参照してください。
```

