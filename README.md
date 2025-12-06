# 汎用タスク実行AIエージェント（Generic Agent）

ユーザーの自然言語による指示に対して、

* タスクの意図を解析し
* 「LLMのみで回答するか / RAG（手元ドキュメント検索）を使うか」を判断し
* 必要に応じて RAG で文書を検索し
* 最終回答と、途中の思考・実行ログを返す

という **汎用タスク実行AIエージェント**のサンプル実装。

バックエンドは FastAPI + LangGraph（相当のエージェント構造）、
フロントエンドは React（Vite）で構成されている。

---

## 1. アーキテクチャ概要

```text
ユーザー
  ↓（ブラウザ）
Frontend (React SPA)
  ↓ HTTP (POST /api/agent/ask)
Backend (FastAPI)
  ↓
Agent 層（エージェントロジック）
  ├ 意図解析ノード
  ├ RAG 実行ノード（必要時）
  └ 回答生成ノード
      ↓
  ベクトルストア（Chroma）
  ＋ OpenAI API（LLM/Embedding）
```

* **LLMのみ回答**：
  一般知識・推論だけで答えられそうな場合
* **RAG＋LLM回答**：
  手元の `documents/` 以下の文書が前提になっている質問の場合

---

## 2. 機能一覧（ざっくり）

* 自然文による指示入力（フロントのテキストボックス）
* 質問意図解析（文書依存 / 非文書依存）
* RAG利用の要否判断（`should_use_rag`）
* Chroma を用いた類似文書検索
* LLM による最終回答生成
* 実行ログ（analysis / rag / answer）の可視化

---

## 3. ディレクトリ構成

リポジトリ直下の構成（例）：

```text
general-ai-agent/
├─ backend/
│  ├─ app/
│  │  ├─ main.py           # FastAPI エントリポイント (/api/agent/ask)
│  │  ├─ config.py         # 設定（OpenAI, Chroma, documents など）
│  │  ├─ agent/            # エージェント関連モジュール
│  │  │  ├─ __init__.py
│  │  │  ├─ types.py       # AgentState, StepLog などの型定義
│  │  │  ├─ nodes.py       # 意図解析 / RAG判定 / 回答生成 ノード
│  │  │  ├─ graph_builder.py# エージェントグラフ構築
│  │  │  └─ rag_tool.py    # RAG をツールとして呼び出すラッパ
│  │  ├─ rag/              # RAG 関連モジュール
│  │  │  ├─ __init__.py
│  │  │  ├─ document_loader.py # documents/ から文書を読み込む
│  │  │  ├─ index_builder.py   # 文書 → チャンク → ベクトル登録
│  │  │  ├─ build_index.py     # インデックス構築用エントリポイント
│  │  │  └─ retriever.py       # Chroma から類似文書を取得
│  │  ├─ documents/        # RAG の対象となるテキスト文書
│  │  │  ├─ NDA.txt
│  │  │  └─ BusinessAgencyAgreement.txt
│  │  │  
│  │  └─ chroma_db/        # Chroma の永続化ディレクトリ（自動生成）
│  ├─ .env                 # OPENAI_API_KEY など（Git管理外）
│  └─ requirements.txt     # Python 依存パッケージ
│  
│
└─ frontend/
   ├─ index.html
   ├─ package.json
   ├─ vite.config.js
   └─ src/
      ├─ main.jsx          # React エントリポイント
      ├─ App.jsx           # 画面本体（入力 / 回答 / 実行ログ）
      ├─ App.css
      └─ index.css
   
```

---

## 4. 動作環境

* Python 3.11 〜 3.13 あたり
* Node.js 18+（Vite 推奨環境）
* OpenAI API アカウント

---

## 5. セットアップ手順（Backend）

### 5.1 依存パッケージのインストール

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows の場合は .venv\Scripts\activate
pip install -r requirements.txt
```

### 5.2 環境変数の設定

`backend/.env` を作成：

```env
OPENAI_API_KEY=sk-xxxxx（自分のキー）
```


### 5.3 文書の配置

`backend/app/documents/` 配下に、RAGの対象としたいテキストファイルを配置する：

```text
backend/app/documents/
  ├─ NDA.txt
  └─  BusinessAgencyAgreement.txt
```


### 5.4 ベクトルインデックスの構築

```bash
cd backend
python -m app.rag.build_index
```

成功すると：

```text
インデックス作成完了: XX チャンクを登録しました。
```

のようなログが出る。

### 5.5 開発サーバーの起動

```bash
cd backend
uvicorn app.main:app --reload
```

ブラウザから：

* Swagger UI: [http://localhost:8000/docs](http://localhost:8000/docs)

で動作確認可能。

---

## 6. セットアップ手順（Frontend）

```bash
cd frontend
npm install
npm run dev
```

* 開発用URL: [http://localhost:5173](http://localhost:5173)

`App.jsx` 内の `API_URL` がローカルバックエンドを指していることを確認：

```jsx
const API_URL = "http://localhost:8000/api/agent/ask";
```

---

## 7. 使い方

### 7.1 最低限の動作確認

1. Backend 起動（`uvicorn app.main:app --reload`）
2. Frontend 起動（`npm run dev`）
3. ブラウザから [http://localhost:5173](http://localhost:5173) にアクセス
4. 例：

   * 一般質問：

     * 「このアプリの目的は？」
       → 一般的なLLM回答（非文書依存）＋実行ログ表示
   * 文書依存の質問：

     * 「この NDA の趣旨を要約して」
       → 文書依存と判定 → RAG実行 → 文書内容に基づいた回答

### 7.2 実行ログの見方

画面下部に「実行ログ（エージェントの思考・行動）」として、
例えば次のようなステップが表示される：

* Step 1 [analysis]
  質問意図解析: 文書依存
* Step 2 [rag]
  RAG実行: 3件ヒット
* Step 3 [answer]
  回答を生成

これにより、

* 文書依存と判断されたのか
* RAGが何件ヒットしたのか
* 最終的にどういう流れで回答に至ったのか

がざっくり追える。

---

## 8. API仕様（Backend）

### 8.1 `POST /api/agent/ask`

* Request Body（JSON）

```json
{
  "input": "このアプリの目的は？"
}
```

* Response Body（JSON）

```json
{
  "output": "このアプリの目的は ... （LLMによる最終回答）",
  "steps": [
    {
      "step_id": 1,
      "action": "analysis",
      "content": "質問意図解析: 文書依存"
    },
    {
      "step_id": 2,
      "action": "rag",
      "content": "RAG実行: 3件ヒット"
    },
    {
      "step_id": 3,
      "action": "answer",
      "content": "回答を生成"
    }
  ]
}
```

---

## 9. デプロイ手順（Render + Vercel）

### 9.1 バックエンド（Render）のデプロイ

1. **RenderでWeb Serviceを作成**
   - GitHubリポジトリを接続
   - サービス名: `general-ai-agent`（任意）
   - 環境: `Python 3`
   - Root Directory: `backend`

2. **Build Command**
   ```bash
   pip install -r requirements.txt
   ```

3. **Start Command**
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port $PORT
   ```

4. **環境変数の設定**
   Renderのダッシュボードで以下を設定：
   - `OPENAI_API_KEY`: あなたのOpenAI APIキー
   - `BUILD_INDEX_ON_STARTUP`: `false`（デフォルト。起動時のインデックス構築をスキップ）

5. **インデックスの自動構築**
   - アプリケーション起動時に、インデックスが空（0件）の場合は自動的に構築されます
   - 手動で構築したい場合は、Renderのシェルから実行：
     ```bash
     python -m app.rag.build_index
     ```
   - または、初回デプロイ時に`BUILD_INDEX_ON_STARTUP=true`に設定して強制的に構築（起動後、`false`に戻すことも可能）

6. **注意事項**
   - `documents/`ディレクトリがGitHubに含まれていることを確認
   - `chroma_db/`ディレクトリは`.gitignore`に含まれているため、デプロイ後にインデックスを構築する必要があります

### 9.2 フロントエンド（Vercel）のデプロイ

1. **Vercelでプロジェクトを作成**
   - GitHubリポジトリを接続
   - Root Directory: `frontend`
   - Framework Preset: `Vite`

2. **環境変数の設定（通常は不要）**
   - フロントエンドは静的ファイルなので環境変数は不要

3. **API URLの更新**
   `frontend/src/App.jsx`の`API_URL`をRenderのURLに変更：
   ```jsx
   const API_URL = "https://your-app.onrender.com/api/agent/ask";
   ```

4. **ビルド設定**
   - Build Command: `npm run build`（自動検出される）
   - Output Directory: `dist`（自動検出される）

### 9.3 トラブルシューティング

**問題: サーバーエラー500が発生する**

- 環境変数`OPENAI_API_KEY`が正しく設定されているか確認
- Renderのログを確認してエラー内容を確認
- `documents/`ディレクトリがデプロイされているか確認
- インデックスが構築されているか確認（起動時に自動構築されるはずですが、失敗した場合は手動で`python -m app.rag.build_index`を実行）

**問題: RAG検索で0件ヒットする**

- 起動ログでインデックスの件数を確認（例: `インデックス確認完了（14件のチャンクが登録されています）`）
- インデックスが0件の場合は、起動時に自動構築されるはずですが、構築に失敗している可能性があります
- Renderのログで「インデックス構築完了」のメッセージを確認
- 手動でインデックスを構築: `python -m app.rag.build_index`

**問題: 起動がタイムアウトする**

- `BUILD_INDEX_ON_STARTUP=false`に設定して、起動時のインデックス構築をスキップ
- デプロイ後に手動でインデックスを構築

**問題: 文書が見つからない**

- `documents/`ディレクトリがGitHubリポジトリに含まれているか確認
- `.gitignore`で除外されていないか確認

---

## 10. 今後の拡張アイデア

* 計算ツールや日付計算ツールを追加し、
  RAG以外のツールも切り替えながら使えるようにする
* Web検索ツールの導入（外部情報も含めた回答）
* セッションメモリ導入（会話の履歴をまたいだ文脈保持）
* ログの整形・UIの改善（折りたたみ、ステップごとの詳細表示）
* 法務特化版 / 技術ノート特化版など、用途特化エージェントへの派生

---

## 11. メモ

* このリポジトリは「**自律的にタスクを実行するエージェント**」の
  最小構成サンプルとして位置づける。
* RAG / LLM / ツール呼び出し / ステップログといった要素を
  小さく一通り体験できるようにしている。
* 実運用時には OpenAI の料金・トークン使用量、
  誤回答・幻覚（Hallucination）への注意が必要。
