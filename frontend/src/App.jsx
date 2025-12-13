import ReactMarkdown from "react-markdown";
import { useState, useEffect } from "react";
import "./App.css";

// メインのエージェントAPIのURL
const API_URL =
  import.meta.env.VITE_API_URL || "http://localhost:8000/api/agent/ask";

// そこから他のエンドポイント用の BASE_URL を推定
const ASK_URL = API_URL;
const API_BASE_URL = ASK_URL.replace(/\/api\/agent\/ask$/, "");

const DOC_REGISTER_URL = `${API_BASE_URL}/api/documents/register`;
const DOC_UPLOAD_URL = `${API_BASE_URL}/api/documents/upload`;
const DOC_LIST_URL = `${API_BASE_URL}/api/documents`;
const DOC_DELETE_URL = (documentId) =>
  `${API_BASE_URL}/api/documents/${documentId}`;
// 会話履歴保存用のキー
const CHAT_HISTORY_STORAGE_KEY = "general-ai-agent:messages";

// 回答プロファイル（モード）定義
const ANSWER_PROFILES = {
  default: {
    label: "標準",
    systemPrompt: "",
  },
  legal: {
    label: "法務検討モード",
    systemPrompt: `
あなたは日本法を扱う法律実務家向けのAIアシスタントです。
- 条文番号や条文構造に言及できるときは、可能な範囲で触れてください。
- 断定を避け、前提・限界やリスクにも言及してください。
- 「一般論」と「手元文書に基づく話」をできるだけ区別して説明してください。
`.trim(),
  },
  summary: {
    label: "要約モード",
    systemPrompt: `
あなたは文章要約に特化したアシスタントです。
- 出力はできるだけ簡潔に、要点を箇条書きでまとめてください。
- 不明な点や前提条件が必要な点は、その旨を短く指摘してください。
`.trim(),
  },
};

console.log("API URL:", API_URL);
console.log("Environment variable VITE_API_URL:", import.meta.env.VITE_API_URL);
console.log("ASK_URL:", ASK_URL);
console.log("API_BASE_URL:", API_BASE_URL);
console.log("DOC_REGISTER_URL:", DOC_REGISTER_URL);
console.log("DOC_UPLOAD_URL:", DOC_UPLOAD_URL);
console.log("DOC_LIST_URL:", DOC_LIST_URL);

function App() {
  // ====== エージェント関連 ======
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState("");
  const [steps, setSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  // 会話履歴
  const [messages, setMessages] = useState(() => {
    try {
      const stored = localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      console.log("Loaded messages from localStorage (init):", stored);
      if (!stored) return [];
      const parsed = JSON.parse(stored);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn("Failed to init messages from localStorage:", e);
      return [];
    }
  });

  // messages が変わるたびに localStorage に保存
  useEffect(() => {
    try {
      const serialized = JSON.stringify(messages);
      console.log("Saving messages to localStorage:", serialized);
      localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, serialized);
    } catch (e) {
      console.warn("Failed to save messages to localStorage:", e);
    }
  }, [messages]);


  // ★ 追加：現在の回答モード
  const [answerProfile, setAnswerProfile] = useState("default");

  // ====== 文書登録（コピペ） ======
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docRegisterMessage, setDocRegisterMessage] = useState("");

  // ====== ファイルアップロード ======
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // ====== 文書一覧 ======
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docListError, setDocListError] = useState("");

  // -----------------------------
  // 文書登録（テキスト貼り付け）
  // -----------------------------
  const handleRegisterDocument = async (e) => {
    e.preventDefault();
    setDocRegisterMessage("");

    if (!docTitle.trim() || !docContent.trim()) {
      setDocRegisterMessage("タイトルと文書内容を入力してください。");
      return;
    }

    try {
      const res = await fetch(DOC_REGISTER_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: docTitle.trim(),
          content: docContent,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("文書登録エラー:", data);
        throw new Error(data.detail || "文書登録に失敗しました。");
      }

      const data = await res.json();
      console.log("文書登録成功:", data);
      setDocRegisterMessage(
        `文書を登録しました（title: ${data.title}, doc_id: ${data.doc_id}）。`
      );

      // 一覧を再取得
      await fetchDocuments();
    } catch (err) {
      console.error("文書登録中にエラー:", err);
      setDocRegisterMessage(
        `文書登録中にエラーが発生しました: ${err.message}`
      );
    }
  };

  const handleClearDocumentForm = () => {
    setDocTitle("");
    setDocContent("");
    setDocRegisterMessage("");
  };

  // -----------------------------
  // ファイルアップロード
  // -----------------------------
  const handleFileChange = (e) => {
    const file = e.target.files?.[0] ?? null;
    setUploadFile(file);
    setUploadMessage("");
    if (file) {
      console.log("選択されたファイル:", file.name, file.type, file.size);
    }
  };

  const handleUploadFile = async () => {
    setUploadMessage("");

    if (!uploadFile) {
      setUploadMessage("アップロードするファイルを選択してください。");
      return;
    }

    try {
      setIsUploading(true);
      console.log("ファイルアップロード開始:", uploadFile.name);

      const formData = new FormData();
      formData.append("file", uploadFile);
      // 必要であればタイトルを別途送る
      // formData.append("title", uploadFile.name);

      const res = await fetch(DOC_UPLOAD_URL, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("ファイルアップロードエラー:", data);
        throw new Error(data.detail || "ファイルアップロードに失敗しました。");
      }

      const data = await res.json();
      console.log("ファイルアップロード成功:", data);
      setUploadMessage(
        `ファイルを登録しました（title: ${data.title}, doc_id: ${data.doc_id}）。`
      );
      setUploadFile(null);

      // 一覧を再取得
      await fetchDocuments();
    } catch (err) {
      console.error("ファイルアップロード中にエラー:", err);
      setUploadMessage(
        `ファイルアップロード中にエラーが発生しました: ${err.message}`
      );
    } finally {
      setIsUploading(false);
    }
  };

  // -----------------------------
  // 文書一覧取得
  // -----------------------------
  const fetchDocuments = async () => {
    try {
      setIsLoadingDocs(true);
      setDocListError("");

      const res = await fetch(DOC_LIST_URL, {
        method: "GET",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("文書一覧取得エラー:", data);
        throw new Error(data.detail || "文書一覧の取得に失敗しました。");
      }

      const data = await res.json();
      console.log("文書一覧取得成功:", data);
      setDocuments(data.documents || []);
    } catch (err) {
      console.error("文書一覧取得中にエラー:", err);
      setDocListError(
        `文書一覧の取得中にエラーが発生しました: ${err.message}`
      );
    } finally {
      setIsLoadingDocs(false);
    }
  };

  // -----------------------------
  // 文書削除
  // -----------------------------
  const handleDeleteDocument = async (documentId) => {
    if (!window.confirm(`document_id='${documentId}' を削除しますか？`)) {
      return;
    }

    try {
      const res = await fetch(DOC_DELETE_URL(documentId), {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("文書削除エラー:", data);
        throw new Error(
          data.detail ||
            "文書削除に失敗しました。document_id が存在しない可能性があります。"
        );
      }

      const data = await res.json();
      console.log("文書削除成功:", data);

      // ローカル state からも削除
      setDocuments((prev) =>
        prev.filter((doc) => doc.document_id !== documentId)
      );
    } catch (err) {
      console.error("文書削除中にエラー:", err);
      alert(`文書削除中にエラーが発生しました: ${err.message}`);
    }
  };

  // -----------------------------
  // 回答モードに応じたプロンプト組み立て
  // -----------------------------
  const buildPrompt = (rawInput) => {
    const profile = ANSWER_PROFILES[answerProfile] || ANSWER_PROFILES.default;

    if (!profile.systemPrompt) {
      // デフォルトはそのまま送る
      return rawInput;
    }

    return `
[回答プロファイル]: ${profile.label}

${profile.systemPrompt}

--- ユーザーからの指示 ---
${rawInput}
`.trim();
  };

  // -----------------------------
  // エージェント呼び出し（会話履歴対応）
  // -----------------------------
  const handleAsk = async (e) => {
    e.preventDefault();
    setError("");
    setSteps([]);
    setIsLoading(true);

    const trimmedInput = inputText.trim();
    if (!trimmedInput) {
      setError("指示（質問）を入力してください。");
      setIsLoading(false);
      return;
    }

    // 送信前に「今回のユーザー発話」を履歴に追加したものを history として送る
    const userMessage = { role: "user", content: trimmedInput };
    const historyToSend = [...messages, userMessage];

    // ★ モードに応じて送信用プロンプトを組み立てる
    const promptToSend = buildPrompt(trimmedInput);

    try {
      const res = await fetch(ASK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: promptToSend,
          history: historyToSend,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.error("APIエラー応答:", data);
        throw new Error(
          data.message || data.detail || "サーバー側でエラーが発生しました。"
        );
      }

      const data = await res.json();
      console.log("APIレスポンス:", data);

      const answerText = data.output || "";
      const newSteps = data.steps || [];

      setOutput(answerText);
      setSteps(newSteps);

      // assistant の発話を履歴に追加
      const assistantMessage = { role: "assistant", content: answerText };
      setMessages([...historyToSend, assistantMessage]);

      // 入力欄はそのままでもOK
      // setInputText("");
    } catch (err) {
      console.error("API呼び出し中にエラー:", err);
      setError(
        `エージェント呼び出し中にエラーが発生しました: ${err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

// 会話履歴クリア
const handleClearConversation = () => {
  if (
    !window.confirm(
      "これまでの会話履歴（user/assistant）をすべてクリアしますか？"
    )
  ) {
    return;
  }

  // 画面上の状態をリセット
  setMessages([]);
  setOutput("");
  setSteps([]);
  setError("");

  // localStorage もクリア
  try {
    localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
  } catch (e) {
    console.warn("Failed to clear chat history from localStorage:", e);
  }
};


  return (
    <div className="app">
      <h1 className="app-title">汎用タスク実行AIエージェント</h1>

      {/* ===== 文書登録（RAG対象にする文書） ===== */}
      <section className="section">
        <h2 className="section-title">文書登録（RAG対象にする文書）</h2>

        {/* テキスト貼り付け */}
        <div className="subsection">
          <h3 className="subsection-title">テキスト貼り付け</h3>
          <form className="document-form" onSubmit={handleRegisterDocument}>
            <label className="field-label">
              文書タイトル：
              <input
                type="text"
                className="text-input"
                value={docTitle}
                onChange={(e) => setDocTitle(e.target.value)}
                placeholder="例：A社 NDA、業務委託契約 など"
              />
            </label>

            <label className="field-label">
              文書内容（全文をコピペ）：
              <textarea
                className="textarea-input"
                rows={6}
                value={docContent}
                onChange={(e) => setDocContent(e.target.value)}
                placeholder="ここに契約書などの全文を貼り付けてください"
              />
            </label>

            <div className="form-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={handleClearDocumentForm}
              >
                クリア
              </button>
              <button type="submit" className="primary-button">
                文書を登録
              </button>
            </div>
          </form>
          {docRegisterMessage && (
            <p className="helper-text">{docRegisterMessage}</p>
          )}
        </div>

        {/* ファイルから登録 */}
        <div className="subsection">
          <h3 className="subsection-title">ファイルから登録</h3>
          <p className="helper-text">
            現在はテキストファイル（.txt / .md など UTF-8）、PDF（テキスト埋め込み型）、
            Word（.docx）のアップロードに対応しています。
          </p>

          <div className="file-upload-row">
            <input
              type="file"
              onChange={handleFileChange}
              className="file-input"
            />
            <button
              type="button"
              className="primary-button"
              onClick={handleUploadFile}
              disabled={isUploading}
            >
              {isUploading ? "アップロード中..." : "ファイルをアップロードして登録"}
            </button>
          </div>

          {uploadMessage && <p className="helper-text">{uploadMessage}</p>}
        </div>

        {/* 登録済み文書一覧 */}
        <div className="subsection">
          <h3 className="subsection-title">登録済み文書</h3>
          <div className="document-list-header">
            <button
              type="button"
              className="secondary-button"
              onClick={fetchDocuments}
            >
              再読み込み
            </button>
            {isLoadingDocs && <span className="helper-text">読込中...</span>}
          </div>

          {docListError && (
            <p className="error-message inline-error">{docListError}</p>
          )}

          <div className="document-table-wrapper">
            <table className="document-table">
              <thead>
                <tr>
                  <th>タイトル</th>
                  <th>document_id</th>
                  <th>チャンク数</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      現在登録されている文書はありません。
                    </td>
                  </tr>
                ) : (
                  documents.map((doc) => (
                    <tr key={doc.document_id}>
                      <td>{doc.document_title}</td>
                      <td className="mono">{doc.document_id}</td>
                      <td>{doc.chunk_count}</td>
                      <td>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => handleDeleteDocument(doc.document_id)}
                        >
                          削除
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ===== 指示（質問）＆ 会話 ===== */}
      <section className="section">
        <h2 className="section-title">指示（質問） / 会話</h2>

        {/* 会話履歴 */}
        <div className="subsection">
          <h3 className="subsection-title">会話履歴</h3>
          <div className="chat-history">
            {messages.length === 0 ? (
              <p className="helper-text">まだ会話履歴はありません。</p>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={
                    m.role === "user"
                      ? "chat-bubble chat-user"
                      : "chat-bubble chat-assistant"
                  }
                >
                  <div className="chat-role">
                    {m.role === "user" ? "ユーザー" : "エージェント"}
                  </div>
                  <div className="chat-content">
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                  </div>
                </div>
              ))
            )}
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              className="secondary-button"
              onClick={handleClearConversation}
            >
              会話履歴をクリア
            </button>
          )}
        </div>

        {/* 指示フォーム */}
        <div className="subsection">
          <h3 className="subsection-title">エージェント実行</h3>
          <form className="question-form" onSubmit={handleAsk}>
            {/* ★ 追加：回答モード選択 */}
            <div className="profile-row">
              <label className="profile-label">
                回答モード：
                <select
                  value={answerProfile}
                  onChange={(e) => setAnswerProfile(e.target.value)}
                  className="profile-select"
                >
                  {Object.entries(ANSWER_PROFILES).map(([key, profile]) => (
                    <option key={key} value={key}>
                      {profile.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <label className="field-label">
              指示（質問）を入力してください：
              <textarea
                className="textarea-input"
                rows={4}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="例）この契約書の成果物の権利帰属を要約して"
              />
            </label>

            <button
              type="submit"
              className="primary-button"
              disabled={isLoading}
            >
              {isLoading ? "送信中..." : "送信"}
            </button>
          </form>

          {error && <div className="error-message">{error}</div>}
        </div>

        {/* 回答表示 */}
        <div className="subsection answer-section">
          <h3 className="subsection-title">回答</h3>
          {isLoading && <p>回答を生成しています...</p>}
          {!isLoading && output && (
            <div className="answer-text">
              <ReactMarkdown>{output}</ReactMarkdown>
            </div>
          )}

          {!isLoading && !output && !error && (
            <p className="helper-text">
              まだエージェントに指示が送信されていません。
            </p>
          )}
        </div>

        {/* 実行ログ */}
        <div className="subsection log-section">
          <h3 className="subsection-title">実行ログ（エージェントの思考・行動）</h3>
          {steps.length === 0 && (
            <p className="helper-text">まだ実行ログはありません。</p>
          )}
          <div className="steps-container">
            {steps.map((step, index) => (
              <div key={index} className="step-item">
                <div className="step-header">
                  Step {step.step_id ?? index + 1} [{step.action}]
                </div>
                <div className="step-content">{step.content}</div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default App;
