// frontend/src/App.jsx
// React から useState, useEffect をインポート（状態管理＋初期ロードに使用）
import { useState, useEffect } from "react";
// コンポーネント用のスタイルシートを読み込む
import "./App.css";

// バックエンドのエージェントAPIのURL
// 環境変数 VITE_API_URL から取得（設定されていない場合はローカル開発用のデフォルト値を使用）
const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/agent/ask";
const DEFAULT_ASK_URL = "http://localhost:8000/api/agent/ask";
const ASK_URL = import.meta.env.VITE_API_URL || DEFAULT_ASK_URL;

// ベースURL（例: http://localhost:8000）
const API_BASE_URL = API_URL.replace(/\/api\/agent\/ask$/, "");

// 文書登録（テキストコピペ）用
const DOC_REGISTER_URL =
  import.meta.env.VITE_UPLOAD_URL || `${API_BASE_URL}/api/documents/register`;

// ファイルアップロード用
const DOC_UPLOAD_URL = `${API_BASE_URL}/api/documents/upload`;

// 文書一覧＆削除用
const DOC_LIST_URL = `${API_BASE_URL}/api/documents`;
const DOC_DELETE_URL = (id) => `${API_BASE_URL}/api/documents/${id}`;

// デバッグ用：使用されているAPI URLをコンソールに出力（本番環境でも確認可能）
console.log("API URL:", API_URL);
console.log("Environment variable VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("ASK_URL:", ASK_URL);
console.log("API_BASE_URL:", API_BASE_URL);
console.log("DOC_REGISTER_URL:", DOC_REGISTER_URL);
console.log("DOC_UPLOAD_URL:", DOC_UPLOAD_URL);
console.log("DOC_LIST_URL:", DOC_LIST_URL);

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

  // 文書登録用（コピペ）
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadError, setUploadError] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  // ファイルアップロード用
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileUploadMessage, setFileUploadMessage] = useState("");

  // 文書一覧用
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docsError, setDocsError] = useState("");

  // 起動時に文書一覧を取得
  useEffect(() => {
    fetchDocuments();
  }, []);

  // ===== エージェントへの質問送信 =====
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!input.trim()) {
      setError("指示（質問）を入力してください。");
      return;
    }

    setIsLoading(true);
    setError("");
    setOutput("");
    setSteps([]);

    try {
      const res = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ input }),
      });

      if (!res.ok) {
        throw new Error(`サーバーエラー: ${res.status}`);
      }

      const data = await res.json();

      setOutput(data.output ?? "");
      setSteps(data.steps ?? []);
    } catch (err) {
      console.error("API呼び出しエラー:", err);
      console.error("使用されたAPI URL:", API_URL);
      console.error("エラー詳細:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
      });

      let errorMessage = "エージェントからの回答取得に失敗しました。";
      if (
        err.message.includes("Failed to fetch") ||
        err.message.includes("NetworkError")
      ) {
        errorMessage +=
          " ネットワークエラーが発生しました。API URLを確認してください: " +
          API_URL;
      } else if (err.message.includes("CORS")) {
        errorMessage +=
          " CORSエラーが発生しました。バックエンドのCORS設定を確認してください。";
      } else {
        errorMessage += " エラー: " + err.message;
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // ===== 文書登録（テキストコピペ） =====
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
      const res = await fetch(DOC_REGISTER_URL, {
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
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `サーバーエラー: ${res.status}`);
      }

      const data = await res.json();
      setUploadMessage(
        data.message ||
          `文書を登録しました（document_id: ${data.document_id}, chunks: ${data.chunks}）`
      );

      // 必要に応じて docContent をクリアする
      // setDocContent("");

      // 文書一覧を更新
      await fetchDocuments();
    } catch (err) {
      console.error("文書登録APIエラー:", err);
      setUploadError(`文書の登録に失敗しました: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  // ===== ファイルアップロード =====
  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    setSelectedFile(file);
    setFileUploadMessage("");
    if (!file) return;

    console.log("選択されたファイル:", file.name, file.type, file.size);
  };

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
      formData.append("file", selectedFile);
      formData.append("title", docTitle || selectedFile.name);

      const response = await fetch(DOC_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        console.error(
          "ファイルアップロード失敗:",
          errorData || response.statusText
        );
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

      // 文書一覧を更新
      await fetchDocuments();
    } catch (err) {
      console.error("ファイルアップロード中にエラー:", err);
      setError(`ファイルアップロード中にエラーが発生しました: ${err}`);
      setFileUploadMessage("");
    }
  };

  // ===== 文書一覧取得 =====
  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      setDocsError("");
      const res = await fetch(DOC_LIST_URL);

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `文書一覧APIエラー: ${res.status}`);
      }

      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("文書一覧取得エラー:", err);
      setDocsError(`文書一覧の取得に失敗しました: ${err.message}`);
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // ===== 文書削除 =====
  const handleDeleteDocument = async (documentId) => {
    const ok = window.confirm("この文書を削除しますか？");
    if (!ok) return;

    try {
      const res = await fetch(DOC_DELETE_URL(documentId), {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.detail || `削除APIエラー: ${res.status}`);
      }

      // 削除後に一覧を更新
      await fetchDocuments();
    } catch (err) {
      console.error("文書削除エラー:", err);
      alert("文書の削除に失敗しました。コンソールログを確認してください。");
    }
  };

  // JSX（画面の見た目）を返す
  return (
    <div className="app">
      {/* アプリのタイトル */}
      <h1 className="app-title">汎用タスク実行AIエージェント</h1>

      {/* 文書登録セクション（手動コピペ） */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">文書登録（RAG対象にする文書）</h2>
          <span className="section-tag">テキスト貼り付け</span>
        </div>
        <form className="upload-form" onSubmit={handleUploadDocument}>
          <label className="question-label">
            文書タイトル：
            <input
              className="text-input"
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

          <div className="document-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => {
                setDocTitle("");
                setDocContent("");
              }}
            >
              クリア
            </button>
            <button
              className="submit-button"
              type="submit"
              disabled={isUploading || !docTitle.trim() || !docContent.trim()}
            >
              {isUploading ? "文書を登録中..." : "文書を登録"}
            </button>
          </div>
        </form>

        {uploadError && <div className="error-message">{uploadError}</div>}
        {uploadMessage && (
          <div className="upload-message">{uploadMessage}</div>
        )}
      </section>

      {/* ファイルアップロード */}
      <section className="section">
        <div className="section-header">
          <h2 className="section-title">ファイルから登録</h2>
          <span className="section-tag">ファイルアップロード</span>
        </div>
        <p className="helper-text">
          現在はテキストファイル（.txt / .md など UTF-8）、PDF（テキスト埋め込み型）、
          Word（.docx）のアップロードに対応しています。
        </p>

        <div className="file-upload-row">
          <input
            className="file-input"
            type="file"
            accept=".txt,.md,.markdown,.json,.pdf,.docx"
            onChange={handleFileChange}
          />
          <button
            className="secondary-button"
            type="button"
            onClick={handleFileUpload}
          >
            ファイルをアップロードして登録
          </button>
        </div>

        {fileUploadMessage && (
          <p className="upload-message">{fileUploadMessage}</p>
        )}
      </section>

      {/* 登録済み文書一覧 */}
      <section className="section documents-section">
        <div className="section-header">
          <h2 className="section-title">登録済み文書</h2>
          <button
            className="secondary-button"
            type="button"
            onClick={fetchDocuments}
          >
            再読み込み
          </button>
        </div>

        {isLoadingDocs && <p>文書一覧を読み込み中です...</p>}
        {docsError && <div className="error-message">{docsError}</div>}

        {!isLoadingDocs && !docsError && documents.length === 0 && (
          <p className="placeholder-text">まだ文書が登録されていません。</p>
        )}

        {!isLoadingDocs && documents.length > 0 && (
          <table className="documents-table">
            <thead>
              <tr>
                <th>タイトル</th>
                <th>document_id</th>
                <th>チャンク数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.document_id}>
                  <td>{doc.document_title}</td>
                  <td className="mono-text">{doc.document_id}</td>
                  <td>{doc.chunk_count}</td>
                  <td>
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      onClick={() => handleDeleteDocument(doc.document_id)}
                    >
                      削除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {/* 質問フォーム */}
      <section className="section question-form">
        <div className="section-header">
          <h2 className="section-title">指示（質問）</h2>
          <span className="section-tag">エージェント実行</span>
        </div>
        <form className="question-form-inner" onSubmit={handleSubmit}>
          <label className="question-label">
            指示（質問）を入力してください：
            <textarea
              className="question-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
              placeholder="例：この契約書の成果物の権利帰属を要約して"
            />
          </label>

          <button
            className="submit-button"
            type="submit"
            disabled={isLoading || !input.trim()}
          >
            {isLoading ? "エージェントが思考中..." : "送信"}
          </button>
        </form>

        {error && <div className="error-message">{error}</div>}
      </section>

      {/* 最終回答表示 */}
      <div className="answer-section">
        <div className="answer-section-title">回答</div>
        {isLoading && <p>回答を生成しています...</p>}
        {!isLoading && output && (
          <pre className="answer-text">{output}</pre>
        )}
        {!isLoading && !output && !error && (
          <p className="placeholder-text">
            まだエージェントに指示が送信されていません。
          </p>
        )}
      </div>

      {/* 実行ログ */}
      <div className="steps-section">
        <div className="steps-title">実行ログ（エージェントの思考・行動）</div>
        {steps.length === 0 && <p>まだ実行ログはありません。</p>}

        <div className="steps-list">
          {steps.map((step, index) => (
            <div key={index} className="step-card">
              <div className="step-header">
                Step {step.step_id ?? index + 1} [{step.action}]
              </div>
              <div className="step-content">{step.content}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// このファイルのデフォルトエクスポートとして App コンポーネントを公開
export default App;
