// frontend/src/App.jsx
// React から useState をインポート（状態管理に使用）
import { useState } from "react";
// コンポーネント用のスタイルシートを読み込む
import "./App.css";

// バックエンドのエージェントAPIのURL
// 環境変数 VITE_API_URL から取得（設定されていない場合はローカル開発用のデフォルト値を使用）
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/agent/ask";
const DEFAULT_ASK_URL = "http://localhost:8000/api/agent/ask";
const ASK_URL = import.meta.env.VITE_API_URL || DEFAULT_ASK_URL;
const API_BASE_URL = API_URL.replace(/\/api\/agent\/ask$/, "");
const DOC_REGISTER_URL = `${API_BASE_URL}/api/documents/register`;
const DOC_UPLOAD_URL = `${API_BASE_URL}/api/documents/upload`;

// 一旦、ベースURLは「直書き」
const UPLOAD_URL =
  import.meta.env.VITE_UPLOAD_URL || "http://localhost:8000/api/documents/register";

// デバッグ用：使用されているAPI URLをコンソールに出力（本番環境でも確認可能）
console.log("API URL:", API_URL);
console.log("Environment variable VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("ASK_URL:", ASK_URL);
console.log("UPLOAD_URL:", UPLOAD_URL);
console.log("API_BASE_URL:", API_BASE_URL);

function App() {
  // ユーザーの入力（指示文）を保持する state
  const [input, setInput] = useState("");
  // エージェントが生成した最終回答を保持する state
  const [output, setOutput] = useState("");
  // エージェントの実行ステップ（思考ログ）を配列で保持する state
  const [steps, setSteps] = useState([]);
  // API呼び出し中かどうかのフラグ
  const [isLoading, setIsLoading] = useState(false);
  // エラー発生時のメッセージ
  const [error, setError] = useState("");

  // 文書登録用
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ファイルアップロード用
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUploadMessage, setFileUploadMessage] = useState("");



  // フォーム送信時（「送信」ボタン押下時）に呼ばれる関数
  const handleSubmit = async (e) => {
    // デフォルトのフォーム送信（ページリロード）を防ぐ
    e.preventDefault();

    // 入力が空白のみの場合はエラーを表示して処理中断
    if (!input.trim()) {
      setError("指示（質問）を入力してください。");
      return;
    }

    // ローディング状態にして、前回の結果をクリア
    setIsLoading(true);
    setError("");
    setOutput("");
    setSteps([]);

    try {
      // fetch でバックエンドのエージェントAPIに POST リクエストを送る
      const res = await fetch(API_URL, {
        method: "POST", // メソッドは POST
        headers: {
          "Content-Type": "application/json", // JSON を送ることを明示
        },
        // body には { "input": "..." } という形で指示文を渡す
        body: JSON.stringify({ input }),
      });

      // ステータスコードが 2xx 以外ならエラーとして扱う
      if (!res.ok) {
        throw new Error(`サーバーエラー: ${res.status}`);
      }

      // レスポンスボディを JSON としてパース
      const data = await res.json();

      // 最終回答（output）を state に反映（なければ空文字）
      setOutput(data.output ?? "");
      // 実行ステップ（steps）を state に反映（なければ空配列）
      setSteps(data.steps ?? []);
    } catch (err) {
      // 例外発生時にはコンソールに出力し、ユーザーにエラーメッセージを表示
      console.error("API呼び出しエラー:", err);
      console.error("使用されたAPI URL:", API_URL);
      console.error("エラー詳細:", {
        message: err.message,
        stack: err.stack,
        name: err.name
      });
      
      // より詳細なエラーメッセージを表示
      let errorMessage = "エージェントからの回答取得に失敗しました。";
      if (err.message.includes("Failed to fetch") || err.message.includes("NetworkError")) {
        errorMessage += " ネットワークエラーが発生しました。API URLを確認してください: " + API_URL;
      } else if (err.message.includes("CORS")) {
        errorMessage += " CORSエラーが発生しました。バックエンドのCORS設定を確認してください。";
      } else {
        errorMessage += " エラー: " + err.message;
      }
      setError(errorMessage);
    } finally {
      // 成功・失敗に関わらずローディング状態を解除
      setIsLoading(false);
    }
  };

  const handleUploadDocument = async (e) => {
    e.preventDefault();

    if (!docTitle.trim() || !docContent.trim()) {
      setUploadError("タイトルと文書内容の両方を入力してください。");
      return;
    }

    setIsUploading(true);
    setUploadError("");
    setUploadMessage("");

    try {
      const res = await fetch(UPLOAD_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: docTitle,
          content: docContent,
        }),
      });

      if (!res.ok) {
        throw new Error(`サーバーエラー: ${res.status}`);
      }

      const data = await res.json();
      setUploadMessage(
        data.message ||
          `文書を登録しました（document_id: ${data.document_id}, chunks: ${data.chunks}）`
      );
      // 成功したら内容を残してもいいし、クリアしてもいい
      // ここではタイトルだけ残して本文はクリアしておく
      // setDocContent("");
    } catch (err) {
      console.error("文書登録APIエラー:", err);
      setUploadError(`文書の登録に失敗しました: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ファイル選択時の処理
const handleFileChange = (event) => {
  const file = event.target.files?.[0] || null;
  setSelectedFile(file);
  setFileUploadMessage("");
  if (!file) return;

  console.log("選択されたファイル:", file.name, file.type, file.size);
};

// ファイルアップロードボタン押下時の処理
const handleFileUpload = async () => {
  if (!selectedFile) {
    setError("アップロードするファイルを選択してください。");
    return;
  }

  try {
    setError("");
    setFileUploadMessage("アップロード中です...");
    console.log("ファイルアップロード開始:", selectedFile.name);

    const formData = new FormData();
    // FastAPI 側の UploadFile = File(...) と対応
    formData.append("file", selectedFile);
    // タイトルをフォームから渡したければここで
    formData.append("title", docTitle || selectedFile.name);

    const response = await fetch(DOC_UPLOAD_URL, {
      method: "POST",
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      console.error("ファイルアップロード失敗:", errorData || response.statusText);
      setError(
        `ファイルアップロードに失敗しました: ${
          errorData?.detail || response.statusText
        }`
      );
      setFileUploadMessage("");
      return;
    }

    const data = await response.json();
    console.log("ファイルアップロード成功:", data);
    setFileUploadMessage(
      `ファイル「${data.title}」をRAGインデックスに登録しました。`
    );
  } catch (err) {
    console.error("ファイルアップロード中にエラー:", err);
    setError(`ファイルアップロード中にエラーが発生しました: ${err}`);
    setFileUploadMessage("");
  }
};


  // JSX（画面の見た目）を返す
  return (
    <div className="app">
      {/* アプリのタイトル */}
      <h1 className="app-title">汎用タスク実行AIエージェント</h1>

      {/* 文書登録セクション */}
      <section className="upload-section">
        <h2>文書登録（RAG対象にする文書）</h2>
        <form className="upload-form" onSubmit={handleUploadDocument}>
          <label className="question-label">
            文書タイトル：
            <input
              className="question-input"
              type="text"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              placeholder="例：業務委託契約書（A社との契約）"
            />
          </label>

          <label className="question-label">
            文書内容（全文をコピペ）：
            <textarea
              className="question-input"
              rows={6}
              value={docContent}
              onChange={(e) => setDocContent(e.target.value)}
              placeholder="契約書などの本文をここに貼り付けてください。"
            />
          </label>

          <button
            className="submit-button"
            type="submit"
            disabled={isUploading || !docTitle.trim() || !docContent.trim()}
          >
            {isUploading ? "文書を登録中..." : "文書を登録"}
          </button>
        </form>

        {uploadError && <div className="error-message">{uploadError}</div>}
        {uploadMessage && (
          <div className="upload-message">{uploadMessage}</div>
        )}
      </section>

      <hr />

  {/* 新規: ファイルアップロード */}
  <div className="file-upload-block">
    <h3>ファイルから登録</h3>
    <p className="help-text">
      現在はテキストファイル（.txt / .md など UTF-8）のアップロードに対応しています。
    </p>

    <div className="file-upload-row">
      <input
      type="file"
      accept=".txt,.md,.markdown,.json,.pdf,.docx"
      onChange={handleFileChange}
    />

      <button type="button" onClick={handleFileUpload}>
        ファイルをアップロードして登録
      </button>
    </div>

    {fileUploadMessage && (
      <p className="info-message">{fileUploadMessage}</p>
    )}
  </div>

      {/* 入力フォーム全体 */}
      <form className="question-form" onSubmit={handleSubmit}>
        <label className="question-label">
          指示（質問）を入力してください：
          <textarea
            className="question-input"
            value={input} // state input の値を反映
            onChange={(e) => setInput(e.target.value)} // 入力のたびに state を更新
            rows={4}
            placeholder="例：このアプリの構成を要約して、改善案も教えて など"
          />
        </label>

        {/* 送信ボタン。ローディング中 or 空入力のときは disabled にする */}
        <button
          className="submit-button"
          type="submit"
          disabled={isLoading || !input.trim()}
        >
          {/* ボタンのラベルはローディング状態で出し分け */}
          {isLoading ? "エージェントが思考中..." : "送信"}
        </button>
      </form>

      {/* エラーがあればメッセージを表示 */}
      {error && <div className="error-message">{error}</div>}

      {/* 最終回答の表示エリア */}
      <div className="answer-section">
        <h2>回答</h2>
        {isLoading && <p>回答を生成しています...</p>}
        {!isLoading && output && (
          // preタグで改行やインデントをそのまま表示
          <pre className="answer-text">{output}</pre>
        )}
        {!isLoading && !output && !error && (
          <p className="placeholder-text">まだエージェントに指示が送信されていません。</p>
        )}
      </div>

      {/* エージェントの実行ステップ（思考ログ）表示エリア */}
      <div className="steps-section">
        <h2>実行ログ（エージェントの思考・行動）</h2>
        {/* ステップが1つもない場合 */}
        {steps.length === 0 && <p>まだ実行ログはありません。</p>}

        {/* ステップがある場合、1つずつカードとして表示 */}
        {steps.map((step, index) => (
          <div key={index} className="step-card">
            {/* ステップ番号 */}
            <div className="step-header">
              Step {step.step_id ?? index + 1} [{step.action}]
            </div>
            <div className="step-content">{step.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// このファイルのデフォルトエクスポートとして App コンポーネントを公開
export default App;
