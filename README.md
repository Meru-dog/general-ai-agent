# 汎用タスク実行 AI エージェント（General AI Agent）

ユーザーが自然言語で指示すると、エージェントが

* 「手元文書に依存する質問か？」
* 「一般知識＋Web検索で足りるか？」

を自動判定し、

* 文書依存 → RAG（手元文書＋ベクトル検索）で回答
* 非文書依存 → LLM単体、または LLM＋Web検索 で回答

を行う **エージェント型 Web アプリケーション** です。

さらに、セッション内の **会話履歴（簡易メモリ）** を保持し、
「さっきの NDA の続きなんだけど…」といった対話も可能です。

---

## 1. 特徴

### 🧠 意図解析（ドキュメント依存かの判定）

* ユーザーの質問文をもとに
  「手元文書を読む必要があるか」／「一般的な知識で足りるか」
  を LangGraph のノードで判定します。
* 「契約書の○条を要約して」「この雇用契約の成果物の権利帰属は？」
  → 文書依存と判定
* 「NDA の一般的な条項構成を教えて」「RAG って何？」
  → 非文書依存と判定

### 📄 RAG 連携（手元文書ベースの回答）

* 文書依存と判定された場合のみ、RAG を実行
* Chroma＋OpenAI Embedding によるベクトル検索で関連チャンクを取得
* 関連チャンクを LLM のコンテキストに渡して回答生成
* 文書には以下のようなものを想定

  * NDA（秘密保持契約書）
  * 業務委託契約書
  * 雇用契約書
  * 売買・代理店契約 等

### 📥 文書登録機能（テキスト／ファイル）

RAG 対象の文書は Web UI から簡単に登録できます。

* **テキスト貼り付け**

  * タイトル＋本文をフォームに直接コピペして登録
* **ファイルアップロード**

  * `.txt` / `.md` / `.markdown` / `.json`（UTF-8 テキスト）
  * `.pdf`（テキスト埋め込み型）
  * `.docx`（Word）
* 登録された文書は

  * 一覧（タイトル・document_id・チャンク数）
  * 削除（document_id 単位で削除）
    が可能です。

### 🌐 Web 検索（Tavily）

* 「一般的な情報だが、最新の情報も見た方がよい」ケースでは
  Tavily API を通じて Web 検索を実行
* LangGraph のツールとして Web 検索ノードを追加し、
  RAG結果＋Web結果＋LLM 一般知識を組み合わせて回答を生成

### 💬 会話履歴（セッションメモリ）

* フロント側で `user` / `assistant` の会話履歴を保持し、
  `/api/agent/ask` に `history` として送信
* バックエンドでは `chat_history` として LangGraph に渡し、
  プロンプト内で「直近最大5ターンの会話」を参照
* 「さっきの NDA の定義条項に関連して〜」といった
  **コンテキストを踏まえた回答**が可能

### 🧾 思考ログの可視化

* エージェントのステップを「実行ログ」として表示

  * Step 1: 質問意図解析（analysis）
  * Step 2: RAG 実行 or スキップ（rag）
  * Step 3: Web検索（必要な場合のみ）
  * Step 4: 回答生成（answer）
* どのルートで回答が生成されたかが一目で分かります。

### 🌐 Web アプリとしてブラウザだけで利用可能

* フロントエンドは React（Vite）
* バックエンドは FastAPI + LangGraph
* Render / Vercel 等のホスティングにそのまま載せられる構成

---

## 2. アーキテクチャ

```text
User (Browser)
   ↓
React Frontend (Vite)
   ↓  POST /api/agent/ask  (JSON: { input, history[] })
FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   ├─ ノード2: ツールルーター (tool_router)
   │    ├─ 文書依存 → RAG ノードへ
   │    ├─ 非文書依存＋要Web情報 → Web検索ノードへ
   │    └─ 非文書依存のみ → そのまま回答生成へ
   ├─ ノード3: RAG 実行 (rag)
   │    └─ Chroma (RAGRetriever) で類似チャンク取得
   ├─ ノード4: Web検索 (web_search) ※Tavily
   └─ ノード5: 回答生成 (answer)
        └─ OpenAI Chat モデル
             + RAG結果
             + Web検索結果
             + 会話履歴（直近数ターン）
   ↓
応答 JSON: { output, steps[] } をフロントに返却
```

---

## 3. 技術スタック

### Backend

* Python 3.11+
* FastAPI
* LangGraph
* OpenAI API（Chat, Embedding）
* Chroma (ベクトルDB)
* Tavily API（Web検索）
* pypdf / python-docx（PDF, Word テキスト抽出用）

### Frontend

* React
* Vite
* react-markdown（Markdown 表示用）

### Infra（例）

* Backend: Render
* Frontend: Vercel

---

## 4. 公開版アプリの使い方（利用者向け）

※ 実際の URL に置き換えてください。

1. フロントエンド URL を開く
   例：`https://<YOUR_FRONTEND_URL>`

2. 必要に応じて RAG 用の文書を登録する

   * 「文書登録（RAG対象にする文書）」セクションで、

     * テキスト貼り付け
     * ファイルアップロード（txt / pdf / docx 等）
   * 「登録済み文書」で文書一覧・削除が可能

3. 「指示（質問） / 会話」セクションで指示を入力

   * 例1（一般質問）
     「NDA の一般的な条文構成を教えて」
   * 例2（文書依存質問）
     「この業務委託契約書の成果物条項を要約して」
   * 例3（会話継続）
     「さっきの秘密保持条項と競業避止条項の関係を整理して」

4. 「送信」をクリックすると：

   * 「回答」欄に LLM の回答が表示
   * 「会話履歴」にユーザー／エージェントの発話が蓄積
   * 「実行ログ」に analysis / rag / web_search / answer のステップが表示される

---

## 5. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント（API群）
│  │  ├─ config.py            # モデル名・パスなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義
│  │  │  ├─ nodes.py          # analysis / rag / web_search / answer ノード
│  │  │  └─ types.py          # AgentState / StepLog など
│  │  └─ rag/
│  │     ├─ document_loader.py
│  │     ├─ index_builder.py
│  │     ├─ retriever.py      # RAGRetriever（Chromaラッパー）
│  │     └─ build_index.py    # 起動前に RAG インデックス構築するスクリプト
│  ├─ documents/              # 初期 RAG 対象の文書 (.txt 等)
│  ├─ requirements.txt
│  └─ .env                    # OpenAI/Tavily キー等（Git 管理外）
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
source .venv/bin/activate  # Windows: .venv\Scripts\activate

pip install -r requirements.txt
```

`.env` を作成（`backend/.env`）：

```bash
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_LLM_MODEL="gpt-4.1-mini"

CHROMA_DIR="./app/chroma_db"
CHROMA_COLLECTION="documents"
DOCUMENTS_DIR="./app/documents"

TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxxxxxxx"
TAVILY_MAX_RESULTS="5"             # 任意（検索件数）
TAVILY_SEARCH_DEPTH="basic"        # or "advanced"
```

#### RAG インデックス構築

```bash
cd backend
python -m app.rag.build_index
```

#### バックエンド起動

```bash
cd backend
uvicorn app.main:app --reload
# => http://127.0.0.1:8000/docs で OpenAPI UI が確認可能
```

---

### 6.2 フロントエンド

```bash
cd frontend
npm install
```

`frontend/.env`（または `.env.local`）などで API URL を設定：

```bash
VITE_API_URL="http://localhost:8000/api/agent/ask"
# 本番環境例: "https://<YOUR_BACKEND_URL>/api/agent/ask"
```

ローカル開発サーバー起動：

```bash
npm run dev
# => 通常 http://localhost:5173/ で起動
```

ブラウザでアクセスして動作確認を行います。

---

## 7. RAG 用文書の登録方法

### 7.1 テキスト貼り付けで登録

1. 「文書登録（RAG対象にする文書）」→「テキスト貼り付け」
2. タイトルを入力（例：`A社 NDA`）
3. 文書全文をテキストエリアに貼り付け
4. 「文書を登録」をクリック
5. 正常に登録されると、登録済み文書一覧に `document_id` と `チャンク数` が表示される

### 7.2 ファイルから登録

1. 「ファイルから登録」セクションでファイルを選択
2. 対応ファイル形式：

   * `.txt` / `.md` / `.markdown` / `.json`（UTF-8）
   * `.pdf`（テキスト埋め込み型）
   * `.docx`
3. 「ファイルをアップロードして登録」をクリック
4. 成功すると、ファイル名（または指定タイトル）で RAG インデックスに登録される

### 7.3 文書の削除

* 「登録済み文書」テーブルから対象行の「削除」ボタンをクリック
* バックエンドの Chroma 上からも該当 `document_id` に紐づくチャンクが削除されます

---

## 8. Web検索の利用イメージ

* 「一般知識＋インターネット上の情報」が必要な質問例：

  * 「最新の日本の金利状況を踏まえた一般的なコメントをして」
  * 「NDA の実務上の運用例を、最近のトレンドも含めて教えて」

* エージェントの内部動作：

  1. 質問意図解析で「Web検索が有用」と判断
  2. Tavily API を呼んで関連情報を取得
  3. RAG結果（あれば）＋Web結果＋一般知識をまとめて LLM に渡し回答生成

---

## 9. 会話履歴（セッションメモリ）の扱い

* フロントエンドでは `messages` ステートとして会話履歴を保持

  ```ts
  type Message = { role: "user" | "assistant"; content: string };
  ```

* `/api/agent/ask` へのリクエストボディ例：

  ```json
  {
    "input": "さっきの NDA の定義条項に関連して質問です…",
    "history": [
      { "role": "user", "content": "NDA 契約について条文を教えてください。" },
      { "role": "assistant", "content": "..." }
    ]
  }
  ```

* バックエンドでは `chat_history` として LangGraph に渡し、
  `generate_answer` ノードで直近数ターンをプロンプトに埋め込みます。

* フロント側からは「会話履歴をクリア」ボタンで
  `messages` を空にリセットすることも可能です。

---

## 10. 典型的なユースケース

* 自分の契約書・テンプレート集を `documents/` に入れ、
  あるいは Web UI からアップロードした上で：

  * 「この NDA の目的条項を要約して」
  * 「業務委託契約における成果物の権利帰属について教えて」
  * 「さっきの雇用契約の秘密保持条項と職務著作の関係を整理して」

  といった質問に、手元文書ベースで回答させる。

* 一方で、

  * 「NDA の一般的な条項構成を教えて」
  * 「RAG のメリットとデメリットを箇条書きで」
  * 「Web検索も併用して、最近の動向を踏まえてコメントして」

  のような質問は、一般 LLM 回答＋Web検索で処理し、
  不必要に RAG を叩かないことでコストを抑制。

---

## 11. 制約・今後の拡張

### 制約（現状）

* セッション単位の簡易メモリのみで、長期記憶は未実装
* ユーザー毎の認証・権限管理は未実装（ログイン前提ではない）
* Web検索は Tavily に依存しており、API キーが必須
* 画像のみの PDF などはテキスト抽出できない（pypdfベース）

### 今後の拡張アイデア

* ユーザー毎の永続メモリ（DB による会話履歴保存）
* より高度なツール連携（計算・カレンダー・メール等）
* 所内ナレッジベースとの安全な接続（権限管理込み）
* 文書ごと／トピックごとのプロンプトテンプレート切り替え
* LangGraph 上でのマルチエージェント構成（レビューエージェント等）

---

## 12. ライセンス

## 12. ライセンス

本リポジトリは MIT License のもとで公開されています。  
詳細はリポジトリ直下の `LICENSE` ファイルを参照してください。
