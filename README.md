# 汎用タスク実行 AI エージェント（General AI Agent）

ブラウザから自然言語で指示すると、

- 手元の文書（契約書など）をもとにした **RAG 検索**
- 外部 Web を使った **Web 検索（Tavily）**
- それらを使わない **LLM 単体の一般回答**

を自動で組み合わせて回答する **エージェント型 Web アプリケーション** です。

単なる「チャットボット」ではなく、

- 文書アップロード＆インデックス構築
- 文書一覧・削除
- Web 検索と RAG の併用
- エージェントのステップログ表示

までを一通り備えた「汎用タスク実行エージェント」の最小構成を目指しています。

---

## 1. 特徴

### 🧠 意図解析（Intent Routing）

入力された質問から、エージェントがざっくりと以下を判定します。

- 手元の文書に依拠すべきか（`doc_dependent`）
- Web で最新情報を取りに行くべきか（`web_required`）
- 通常の一般知識だけで足りるか（`llm_only`）
- その組み合わせ（例：doc + Web）

この判定結果に応じて、RAG / Web / LLM を柔軟に使い分けます。

---

### 📄 文書登録 & RAG 連携

RAG 対象の文書は、以下の 2 通りの方法で登録できます。

1. **画面上にコピペして登録**

   - タイトルと本文（全文）を入力 → `/api/documents/register` でインデックスに登録
   - NDA / 業務委託契約 / 雇用契約 など、テキストベースの契約書を想定

2. **ファイルをアップロードして登録**

   対応形式：

   - `.txt` / `.md` / `.markdown` / `.json`（UTF-8 テキスト）
   - `.pdf`（テキスト埋め込み型）
   - `.docx`（Word ファイル）

   → `/api/documents/upload` 経由でテキスト抽出 → Chroma にチャンクとして保存され、RAG で検索可能になります。

登録された文書は、Chroma ベースのベクターストアにチャンク分割・埋め込みされ、
LangGraph の RAG ノードから検索されます。

---

### 📚 文書一覧・削除

登録済み文書は UI から一覧表示できます。

- タイトル
- document_id
- チャンク数

不要になった文書は、**document_id 単位で一括削除**できます。

---

### 🌐 Web 検索連携（Tavily）

Web 参照が必要と判断された質問に対しては、Tavily API を使って検索し、  
取得した外部コンテキスト（検索結果サマリ）も LLM に渡します。

- ニュース・相場・法改正など、**手元文書には存在しない最新情報**を補完する用途を想定
- RAG と Web の両方が有効な場合は、**手元文書の情報を優先しつつ、外部情報を参考として付加**するプロンプト設計にしています。

---

### 🧾 思考ログの可視化

エージェントの各ステップ（例）：

- `analysis` : 質問意図解析（文書依存か / Web 必要か / LLM のみか）
- `rag`      : RAG 実行＆ヒット件数のログ
- `web`      : Web 検索実行＆簡易サマリ
- `answer`   : 最終回答生成

を、フロント側の「実行ログ」エリアにリスト表示します。

---

### 💻 Web アプリとして利用可能

- フロントエンド：React（Vite）
- バックエンド：FastAPI + LangGraph

ブラウザからアクセスするだけで、

1. 文書登録（コピペ / ファイル）
2. 質問入力
3. 回答＋実行ログ確認

まで完結します。

---

## 2. アーキテクチャ

```text
User (Browser)
   ↓
React Frontend
   ├─ 文書登録（POST /api/documents/register）
   ├─ ファイルアップロード（POST /api/documents/upload）
   ├─ 文書一覧取得（GET /api/documents）
   ├─ 文書削除（DELETE /api/documents/{document_id}）
   └─ 質問送信（POST /api/agent/ask）

FastAPI Backend
   ↓
LangGraph エージェント
   ├─ ノード1: 質問意図解析 (analysis)
   │      └─ doc_dependent / web_required / llm_only / both を判定
   ├─ ノード2: RAG 実行 (rag)
   │      └─ Chroma（documents コレクション）からベクトル検索
   ├─ ノード3: Web 検索 (web)
   │      └─ Tavily API で外部 Web 情報を取得
   └─ ノード4: 回答生成 (answer)
          └─ OpenAI Chat モデルに
              「質問 + 会話履歴 + RAG結果 + Web結果」を渡して回答生成

応答 JSON: { output, steps[] } をフロントに返却
```

RAG に使うベクターストアには **Chroma** を採用しており、
インデックス再構築用のスクリプト `app/rag/build_index.py` も用意しています。

---

## 3. 技術スタック

### Backend

* Python 3.11+
* FastAPI
* LangGraph
* Chroma
* OpenAI API（Chat + Embedding）
* Tavily Web Search API
* pypdf（PDF テキスト抽出）
* python-docx（Word ファイルテキスト抽出）

### Frontend

* React
* Vite

### Infra（一例）

* Backend: Render
* Frontend: Vercel

---

## 4. 画面イメージ（概要）

メインの画面には、以下のブロックがあります。

1. **文書登録（テキスト貼り付け）**

   * 文書タイトル
   * 文書内容（全文）
   * クリアボタン
   * 登録ボタン

2. **ファイルから登録**

   * ファイル入力（`.txt` / `.md` / `.pdf` / `.docx` 等）
   * アップロードして登録ボタン

3. **登録済み文書一覧**

   * タイトル / document_id / チャンク数
   * 削除ボタン
   * 再読み込みボタン

4. **指示（質問）フォーム**

   * テキストエリア
   * 送信ボタン

5. **回答表示エリア**

   * LLM からの最終回答を表示

6. **実行ログ**

   * LangGraph の各ステップを順に表示

---

## 5. 利用方法（エンドユーザー向け）

### 5.1 文書を登録する（コピペ）

1. 「文書登録（RAG 対象にする文書）」セクションに移動
2. 「文書タイトル」に任意のタイトル（例：`A社 NDA`）を入力
3. 「文書内容（全文をコピペ）」に契約書などの全文を貼り付け
4. 「文書を登録」ボタンをクリック

登録に成功すると、メッセージが表示され、
「登録済み文書」一覧にも行が追加されます。

---

### 5.2 ファイルから登録する

1. 「ファイルから登録」セクションに移動
2. アップロードしたいファイルを選択（例：`BusinessAgencyAgreement.txt`）
3. 「ファイルをアップロードして登録」をクリック

対応形式：

* `.txt` / `.md` / `.markdown` / `.json`（UTF-8 テキスト）
* `.pdf`（テキスト埋め込み型）
* `.docx`（Word）

アップロード後、自動的にテキスト抽出 → RAG インデックス登録まで行われます。

---

### 5.3 文書一覧を確認・削除する

1. 「登録済み文書」セクションで一覧を確認
2. 不要な文書があれば、行右端の「削除」ボタンをクリック
3. 確認ダイアログで OK を押すと、document_id に紐づくチャンクがすべて削除されます。

---

### 5.4 質問してみる

1. 「指示（質問）」セクションで質問を入力

   * 例1（文書依存）：
     「この契約書の成果物の権利帰属を要約して」
   * 例2（文書＋Web）：
     「この NDA の内容を踏まえつつ、最近の判例動向も加味してポイントを教えて」
   * 例3（Web メイン）：
     「最近の生成 AI に関する日本の法制度の議論状況を教えて」
   * 例4（一般質問）：
     「このアプリは何をするもの？」

2. 「送信」ボタンを押すと、

   * 上部に「回答」が表示
   * 下部に「実行ログ（analysis / rag / web / answer）」が表示されます。

---

## 6. API エンドポイント（開発者向け）

### 6.1 エージェント実行

* `POST /api/agent/ask`

```json
// request
{
  "input": "この契約書の成果物の権利帰属を要約して"
}

// response（例）
{
  "output": "…LLMの回答テキスト…",
  "steps": [
    {
      "step_id": 1,
      "action": "analysis",
      "content": "質問意図解析: 文書依存と判断..."
    },
    {
      "step_id": 2,
      "action": "rag",
      "content": "RAG実行: 3件ヒット..."
    },
    {
      "step_id": 3,
      "action": "web",
      "content": "Web検索実行: ... "
    },
    {
      "step_id": 4,
      "action": "answer",
      "content": "RAG結果とWeb結果を踏まえて回答を生成しました。"
    }
  ]
}
```

---

### 6.2 文書登録（テキスト）

* `POST /api/documents/register`

```json
// request
{
  "title": "雇用契約書",
  "content": "（契約書本文全文）"
}
```

レスポンスには `doc_id` やチャンク数などが含まれます。

---

### 6.3 ファイルアップロード

* `POST /api/documents/upload`（multipart/form-data）

フィールド：

* `file`: アップロードするファイル
* `title`（任意）: UI 上に表示する文書タイトル（未指定ならファイル名）

---

### 6.4 文書一覧・削除

* `GET /api/documents`

```json
{
  "documents": [
    {
      "document_id": "user_xxx",
      "document_title": "BusinessAgencyAgreement.txt",
      "chunk_count": 7
    }
  ]
}
```

* `DELETE /api/documents/{document_id}`

指定した document_id に紐づくチャンクをすべて削除します。

---

## 7. リポジトリ構成（例）

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py              # FastAPI エントリポイント
│  │  ├─ config.py            # モデル名・パスなどの設定
│  │  ├─ agent/
│  │  │  ├─ graph_builder.py  # LangGraph グラフ定義
│  │  │  ├─ nodes.py          # analysis / rag / web / answer ノード実装
│  │  │  └─ types.py          # AgentState / StepLog など
│  │  └─ rag/
│  │     ├─ document_loader.py
│  │     ├─ index_builder.py  # 既存文書のインデックス構築ロジック
│  │     ├─ build_index.py    # 起動時などに使うスクリプトエントリ
│  │     └─ retriever.py      # Chroma への add/query/list/delete を担当
│  ├─ documents/              # 初期 RAG 対象の文書 (.txt 等)
│  ├─ requirements.txt
│  └─ .env                    # OpenAI/Tavily キーなど（Git 管理外）
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

## 8. セットアップ（ローカル開発）

### 8.1 Backend

```bash
cd backend

python -m venv .venv
source .venv/bin/activate  # Windows は .venv\Scripts\activate

pip install -r requirements.txt
```

`.env` を作成（例）：

```bash
# backend/.env
OPENAI_API_KEY="sk-xxxxxxxxxxxxxxxxxxxxx"
OPENAI_LLM_MODEL="gpt-4.1-mini"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"

TAVILY_API_KEY="tvly-xxxxxxxxxxxxxxxx"

CHROMA_DIR="./app/chroma_db"
CHROMA_COLLECTION="documents"
DOCUMENTS_DIR="./app/documents"
```

#### （任意）初期インデックス構築

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

### 8.2 Frontend

```bash
cd frontend
npm install
```

`.env` または `.env.local` などで API URL を指定：

```bash
# frontend/.env.local
VITE_API_URL="http://localhost:8000/api/agent/ask"
```

ローカル開発サーバー起動：

```bash
npm run dev
```

ブラウザから `http://localhost:5173/` にアクセスして動作確認します。

---

## 9. デプロイ（概要）

### Backend（例：Render）

* Root Directory：`backend`

* Build Command：`pip install -r backend/requirements.txt`

* Start Command（一例）：

  ```bash
  cd backend && python -m app.rag.build_index && uvicorn app.main:app --host 0.0.0.0 --port $PORT
  ```

* 環境変数に `.env` と同等の値（OpenAI / Tavily / Chroma 等）を設定

### Frontend（例：Vercel）

* Framework Preset：Vite
* Build Command：`npm run build`
* Output Directory：`dist`
* 環境変数 `VITE_API_URL` を本番バックエンド URL に設定

---

## 10. 典型的なユースケース

* 自分の契約書・テンプレート集を `documents/` と Web UI に登録しておき、

  * 「この NDA の秘密保持義務の範囲を要約して」
  * 「業務委託契約における成果物の権利帰属について教えて」
    などと聞くと、文書依存と判定された場合のみ RAG が走る

* 逆に、

  * 「最近の暗号資産規制の国際的な流れは？」
    のような質問は Web 検索ベースで回答

* LLM 単体でよい一般質問

  * 「このアプリは何をするもの？」
  * 「RAG とは何か、簡単に教えて」

---

## 11. 制約・今後の拡張

### 制約（現状）

* Web 検索は Tavily に依存しており、対応範囲・言語は Tavily 側の仕様に準拠
* 認証・ユーザー毎の文書分離は未実装（シングルユーザー前提）
* 会話セッション単位の長期メモリは持たず、1 リクエストごとに完結
* 文書アップロードサイズやページ数には実質的な上限（メモリ・応答時間）がある

### 今後の拡張アイデア

* ユーザー認証と「ユーザー毎の文書空間」の分離
* 会話セッション単位のメモリ保持（LangGraph の state 拡張）
* ツール追加（計算、カレンダー、社内 API など）
* 文書ビューワ・ヒット箇所ハイライト
* より高度なルーティング（リスクスコアリングやツール優先度調整など）
