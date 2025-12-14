import ReactMarkdown from "react-markdown";
import { useState, useEffect } from "react";
import "./App.css";

// ==============================
// API エンドポイント設定
// ==============================

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

// ==============================
// ローカルストレージ用キー
// ==============================
const SESSIONS_KEY = "general-ai-agent:sessions";
const ACTIVE_SESSION_KEY = "general-ai-agent:active-session";
const messagesKeyFor = (sessionId) =>
  `general-ai-agent:messages:${sessionId}`;

// ==============================
// 回答プロファイル（モード）
// ==============================
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
  // ==============================
  // セッション管理
  // ==============================
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [messages, setMessages] = useState([]);

  // ★ 追加: セッション名編集用 state
  const [editingSessionId, setEditingSessionId] = useState(null);
  const [editingSessionName, setEditingSessionName] = useState("");

  // 画面系の state
  const [inputText, setInputText] = useState("");
  const [output, setOutput] = useState("");
  const [steps, setSteps] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const [answerProfile, setAnswerProfile] = useState("default");

  // 文書登録（コピペ）
  const [docTitle, setDocTitle] = useState("");
  const [docContent, setDocContent] = useState("");
  const [docRegisterMessage, setDocRegisterMessage] = useState("");

  // ファイルアップロード
  const [uploadFile, setUploadFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState("");

  // 文書一覧
  const [documents, setDocuments] = useState([]);
  const [isLoadingDocs, setIsLoadingDocs] = useState(false);
  const [docListError, setDocListError] = useState("");

  // ------------------------------
  // セッション・メッセージ 保存/読込
  // ------------------------------
  useEffect(() => {
    // 初回マウント時にセッションとアクティブセッションを復元
    try {
      const storedSessions = localStorage.getItem(SESSIONS_KEY);
      let parsedSessions = [];
      if (storedSessions) {
        const tmp = JSON.parse(storedSessions);
        if (Array.isArray(tmp)) {
          parsedSessions = tmp;
        }
      }

      if (parsedSessions.length === 0) {
        // まだセッションがない場合はデフォルトセッションを作成
        const defaultSession = {
          id: "session-" + Date.now(),
          name: "メインセッション",
          createdAt: Date.now(),
        };
        parsedSessions = [defaultSession];

        // 旧バージョン（単一セッション）の履歴があればマイグレーション
        try {
          const legacy = localStorage.getItem("general-ai-agent:messages");
          if (legacy) {
            localStorage.setItem(messagesKeyFor(defaultSession.id), legacy);
            localStorage.removeItem("general-ai-agent:messages");
          }
        } catch (e) {
          console.warn("Failed to migrate legacy messages:", e);
        }

        localStorage.setItem(SESSIONS_KEY, JSON.stringify(parsedSessions));
      }

      setSessions(parsedSessions);

      // アクティブセッションIDを復元
      const storedActiveId = localStorage.getItem(ACTIVE_SESSION_KEY);
      const active =
        parsedSessions.find((s) => s.id === storedActiveId)?.id ??
        parsedSessions[0].id;
      setActiveSessionId(active);

      // そのセッションのメッセージを復元
      const storedMessages = localStorage.getItem(messagesKeyFor(active));
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages);
        if (Array.isArray(parsed)) {
          setMessages(parsed);
        }
      }
    } catch (e) {
      console.warn("Failed to init sessions/messages from localStorage:", e);
    }
  }, []);

  // アクティブセッションが変わったら、そのセッションのメッセージを読み込み
  useEffect(() => {
    if (!activeSessionId) return;
    try {
      localStorage.setItem(ACTIVE_SESSION_KEY, activeSessionId);
      const storedMessages = localStorage.getItem(
        messagesKeyFor(activeSessionId)
      );
      if (storedMessages) {
        const parsed = JSON.parse(storedMessages);
        setMessages(Array.isArray(parsed) ? parsed : []);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.warn("Failed to load messages for session:", e);
    }
  }, [activeSessionId]);

  // メッセージが変わるたびに、アクティブセッションのメッセージを保存
  useEffect(() => {
    if (!activeSessionId) return;
    try {
      const serialized = JSON.stringify(messages);
      localStorage.setItem(messagesKeyFor(activeSessionId), serialized);
    } catch (e) {
      console.warn("Failed to save messages to localStorage:", e);
    }
  }, [messages, activeSessionId]);

  // ★ 修正: セッション作成時にタイトルを入力させる
  const handleCreateSession = () => {
    const defaultName = `セッション ${sessions.length + 1}`;
    const name = window.prompt(
      "新しいセッション名を入力してください（例：NDA検討、雇用契約レビュー 等）",
      defaultName
    );

    if (!name) {
      return; // キャンセル or 空欄なら何もしない
    }

    const newSession = {
      id: "session-" + Date.now(),
      name: name.trim(),
      createdAt: Date.now(),
    };

    const nextSessions = [...sessions, newSession];
    setSessions(nextSessions);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));

    setActiveSessionId(newSession.id);
    setMessages([]);
    setOutput("");
    setSteps([]);
    setError("");
    setInputText("");
  };

  const handleSelectSession = (sessionId) => {
    if (sessionId === activeSessionId) return;
    setActiveSessionId(sessionId);
    setOutput("");
    setSteps([]);
    setError("");
    setInputText("");
  };

  // ★ 追加: セッション名編集開始
  const handleStartEditSessionName = (session) => {
    setEditingSessionId(session.id);
    setEditingSessionName(session.name);
  };

  // ★ 追加: セッション名保存
  const handleSaveSessionName = (sessionId) => {
    const trimmed = editingSessionName.trim();
    if (!trimmed) {
      // 空なら元の名前のままにして編集終了
      setEditingSessionId(null);
      setEditingSessionName("");
      return;
    }

    setSessions((prev) => {
      const updated = prev.map((s) =>
        s.id === sessionId ? { ...s, name: trimmed } : s
      );
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
      return updated;
    });

    setEditingSessionId(null);
    setEditingSessionName("");
  };

  // ★ 追加: セッション削除
  const handleDeleteSession = (sessionId) => {
    const target = sessions.find((s) => s.id === sessionId);
    const targetName = target ? target.name : "";

    if (
      !window.confirm(
        `セッション「${targetName}」を削除しますか？\nこのセッションの会話履歴もすべて削除されます。`
      )
    ) {
      return;
    }

    try {
      localStorage.removeItem(messagesKeyFor(sessionId));
    } catch (e) {
      console.warn("Failed to remove messages for session:", e);
    }

    const remaining = sessions.filter((s) => s.id !== sessionId);
    let nextSessions;
    if (remaining.length === 0) {
      // セッションが一つもなくなった場合はデフォルトを1つ作成
      const defaultSession = {
        id: "session-" + Date.now(),
        name: "メインセッション",
        createdAt: Date.now(),
      };
      nextSessions = [defaultSession];
    } else {
      nextSessions = remaining;
    }

    setSessions(nextSessions);
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));

    // アクティブセッションが消えた場合は先頭に切り替え
    if (sessionId === activeSessionId) {
      const nextActiveId = nextSessions[0]?.id ?? null;
      setActiveSessionId(nextActiveId);
      setOutput("");
      setSteps([]);
      setError("");
      setInputText("");

      if (!nextActiveId) {
        setMessages([]);
      }
    }
  };

  // =============================
  // 文書登録（テキスト貼り付け）
  // =============================
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
      // 入力を軽くクリア
      setDocTitle("");
      setDocContent("");

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

  // =============================
  // ファイルアップロード
  // =============================
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

  // =============================
  // 文書一覧取得
  // =============================
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

  // =============================
  // 文書削除
  // =============================
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

  // =============================
  // 回答モードに応じたプロンプト
  // =============================
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

  // =============================
  // エージェント呼び出し
  // =============================
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

    const userMessage = { role: "user", content: trimmedInput };
    const historyToSend = [...messages, userMessage];
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

      const assistantMessage = { role: "assistant", content: answerText };
      setMessages([...historyToSend, assistantMessage]);

      // ★ 実行後は入力欄をクリア
      setInputText("");
    } catch (err) {
      console.error("API呼び出し中にエラー:", err);
      setError(
        `エージェント呼び出し中にエラーが発生しました: ${err.message}`
      );
    } finally {
      setIsLoading(false);
    }
  };

  // 会話履歴クリア（現在のセッションのみ）
  const handleClearConversation = () => {
    if (
      !window.confirm(
        "このセッションの会話履歴（user/assistant）をすべてクリアしますか？"
      )
    ) {
      return;
    }

    setMessages([]);
    setOutput("");
    setSteps([]);
    setError("");

    if (activeSessionId) {
      try {
        localStorage.removeItem(messagesKeyFor(activeSessionId));
      } catch (e) {
        console.warn("Failed to clear chat history from localStorage:", e);
      }
    }
  };

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  return (
    <div className="app">
      <div className="layout">
        {/* ===== サイドバー（セッション一覧） ===== */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <div className="sidebar-title">汎用タスク実行AIエージェント</div>
            <div className="sidebar-subtitle">General AI Agent with RAG</div>
          </div>

          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">セッション</span>
              <button
                type="button"
                className="sidebar-new-button"
                onClick={handleCreateSession}
              >
                ＋ 新規
              </button>
            </div>

            <div className="session-list">
              {sessions.map((session) => {
                const isActive = session.id === activeSessionId;

                // ★ 修正: アクティブセッションは state の messages から件数を取得
                let messageCount = 0;
                if (isActive) {
                  messageCount = messages.length;
                } else {
                  try {
                    const raw = localStorage.getItem(
                      messagesKeyFor(session.id)
                    );
                    if (raw) {
                      const parsed = JSON.parse(raw);
                      if (Array.isArray(parsed)) {
                        messageCount = parsed.length;
                      }
                    }
                  } catch (e) {
                    console.warn("Failed to read messages for session:", e);
                  }
                }

                return (
                  <div
                    key={session.id}
                    className={
                      "session-row" +
                      (isActive ? " session-row-active" : "")
                    }
                  >
                    <button
                      type="button"
                      className="session-button"
                      onClick={() => handleSelectSession(session.id)}
                    >
                      <div className="session-name">
                        {editingSessionId === session.id ? (
                          <input
                            className="session-name-input"
                            value={editingSessionName}
                            onChange={(e) =>
                              setEditingSessionName(e.target.value)
                            }
                            onBlur={() => handleSaveSessionName(session.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSaveSessionName(session.id);
                              } else if (e.key === "Escape") {
                                setEditingSessionId(null);
                                setEditingSessionName("");
                              }
                            }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="session-name-text"
                            onClick={(e) => {
                              e.stopPropagation(); // セッション切替を防ぐ
                              handleStartEditSessionName(session);
                            }}
                          >
                            {session.name}
                          </span>
                        )}
                      </div>
                      <div className="session-meta">
                        {messageCount} 件のメッセージ
                      </div>
                    </button>

                    <button
                      type="button"
                      className="session-delete-button"
                      onClick={() => handleDeleteSession(session.id)}
                    >
                      削除
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>

        {/* ===== メインコンテンツ ===== */}
        <main className="main">
          <header className="main-header">
            <div>
              <h1 className="app-title">
                {/* ★ セッション名をページ上部のタイトルとして表示 */}
                {activeSession ? activeSession.name : "汎用タスク実行AIエージェント"}
              </h1>
              <p className="app-description">
                手元の契約書ファイルをRAGに登録しつつ、LLMと対話できます。
              </p>
            </div>
          </header>

          {/* ===== 文書登録エリア ===== */}
          <section className="section-grid">
            {/* テキスト貼り付けカード */}
            <div className="section-card">
              <h2 className="section-title">文書登録（テキスト貼り付け）</h2>
              <form className="document-form" onSubmit={handleRegisterDocument}>
                <label className="field-label">
                  文書タイトル
                  <input
                    type="text"
                    className="text-input"
                    value={docTitle}
                    onChange={(e) => setDocTitle(e.target.value)}
                    placeholder="例：A社 NDA、業務委託契約 など"
                  />
                </label>

                <label className="field-label">
                  文書内容（全文をコピペ）
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

            {/* ファイルアップロードカード */}
            <div className="section-card">
              <h2 className="section-title">文書登録（ファイルアップロード）</h2>
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
          </section>

          {/* ===== 登録済み文書一覧 ===== */}
          <section className="section-full">
            <div className="section-card">
              <div className="section-card-header">
                <h2 className="section-title">登録済み文書</h2>
                <div className="document-list-header">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={fetchDocuments}
                  >
                    再読み込み
                  </button>
                  {isLoadingDocs && (
                    <span className="helper-text">読込中...</span>
                  )}
                </div>
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

          {/* ===== 会話 / エージェント実行 ===== */}
          <section className="section-grid main-grid">
            {/* 会話履歴カード */}
            <div className="section-card">
              <h2 className="section-title">会話履歴</h2>
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
                  className="secondary-button full-width-button"
                  onClick={handleClearConversation}
                >
                  会話履歴をクリア（現在のセッション）
                </button>
              )}
            </div>

            {/* エージェント実行 & 回答カード */}
            <div className="section-card">
              <h2 className="section-title">エージェント実行</h2>
              <form className="question-form" onSubmit={handleAsk}>
                <div className="profile-row">
                  <label className="profile-label">
                    回答モード
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
                  指示（質問）
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

              <div className="answer-section">
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
            </div>
          </section>

          {/* ===== 実行ログ ===== */}
          <section className="section-full">
            <div className="section-card">
              <h2 className="section-title">実行ログ（エージェントの思考・行動）</h2>
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
        </main>
      </div>
    </div>
  );
}

export default App;
