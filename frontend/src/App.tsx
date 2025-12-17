/**
 * frontend/src/App.tsx
 * 
 * アプリケーションのメインコンポーネントです。
 * 全体的な状態管理（セッション、メッセージ、文書、UI状態）を行い、
 * 各コンポーネント（Sidebar, DocumentManager, ChatInterface）をレイアウトに配置します。
 */

import { useState, useEffect } from "react";
import "./App.css";

import { Sidebar } from "./components/Sidebar";
import { DocumentManager } from "./components/DocumentManager";
import { ChatInterface } from "./components/ChatInterface";
import { Session, Message, DocumentSummary, ANSWER_PROFILES, Reference, StepLog } from "./types";

// ==============================
// API エンドポイント設定
// ==============================
// 環境変数からAPIのURLを取得。未設定の場合はローカルホスト（デフォルト）を使用。
const API_URL =
    import.meta.env.VITE_API_URL || "http://localhost:8000/api/agent/ask";

const ASK_URL = API_URL;
// ベースURLの算出（/api/agent/ask から /api までを除いた部分）
const API_BASE_URL = ASK_URL.replace(/\/api\/agent\/ask$/, "");

const DOC_REGISTER_URL = `${API_BASE_URL}/api/documents/register`;
const DOC_UPLOAD_URL = `${API_BASE_URL}/api/documents/upload`;
const DOC_LIST_URL = `${API_BASE_URL}/api/documents`;
// 文書削除用URL生成関数
const DOC_DELETE_URL = (documentId: string) =>
    `${API_BASE_URL}/api/documents/${documentId}`;

// ==============================
// ローカルストレージ用キー
// ==============================
// セッション一覧やアクティブなセッション、各セッションのメッセージを保存するためのキー
const SESSIONS_KEY = "general-ai-agent:sessions";
const ACTIVE_SESSION_KEY = "general-ai-agent:active-session";
const messagesKeyFor = (sessionId: string) =>
    `general-ai-agent:messages:${sessionId}`;


function App() {
    // ==============================
    // State 定義: セッション管理
    // ==============================
    const [sessions, setSessions] = useState<Session[]>([]);           // セッション一覧
    const [activeSessionId, setActiveSessionId] = useState<string | null>(null); // 現在選択中のセッションID
    const [messages, setMessages] = useState<Message[]>([]);           // 現在のセッションのメッセージ履歴

    // ==============================
    // State 定義: チャット画面・エージェント応答
    // ==============================
    const [output, setOutput] = useState("");                          // エージェントの最終回答
    const [steps, setSteps] = useState<StepLog[]>([]);                 // 思考ステップのログ
    const [references, setReferences] = useState<Reference[]>([]);     // 参照情報（RAG/Web検索）
    const [isLoading, setIsLoading] = useState(false);                 // エージェント実行中フラグ
    const [error, setError] = useState("");                            // エラーメッセージ

    // ==============================
    // State 定義: 文書管理
    // ==============================
    const [documents, setDocuments] = useState<DocumentSummary[]>([]); // 登録済み文書一覧
    const [isLoadingDocs, setIsLoadingDocs] = useState(false);         // 文書一覧取得中フラグ
    const [docListError, setDocListError] = useState("");              // 文書関連のエラー

    // ==============================
    // 初期化処理 (useEffect)
    // ==============================
    // アプリ起動時にローカルストレージからセッション情報を読み込む
    useEffect(() => {
        try {
            const storedSessions = localStorage.getItem(SESSIONS_KEY);
            let parsedSessions: Session[] = [];
            if (storedSessions) {
                const tmp = JSON.parse(storedSessions);
                if (Array.isArray(tmp)) {
                    parsedSessions = tmp;
                }
            }

            // セッションが存在しない場合はデフォルトのセッションを作成
            if (parsedSessions.length === 0) {
                const defaultSession: Session = {
                    id: "session-" + Date.now(),
                    name: "メインセッション",
                    createdAt: Date.now(),
                };
                parsedSessions = [defaultSession];

                // レガシーデータ（古い形式のローカルストレージ）への対応
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

            // 前回アクティブだったセッションを復元
            const storedActiveId = localStorage.getItem(ACTIVE_SESSION_KEY);
            const active =
                parsedSessions.find((s) => s.id === storedActiveId)?.id ??
                parsedSessions[0].id;
            setActiveSessionId(active);

            // アクティブセッションのメッセージを読み込み
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

    // アクティブセッションが切り替わったときにメッセージを読み込む
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

    // メッセージが更新されたらローカルストレージに保存する
    useEffect(() => {
        if (!activeSessionId) return;
        try {
            const serialized = JSON.stringify(messages);
            localStorage.setItem(messagesKeyFor(activeSessionId), serialized);
        } catch (e) {
            console.warn("Failed to save messages to localStorage:", e);
        }
    }, [messages, activeSessionId]);


    // ==============================
    // イベントハンドラ: セッション操作
    // ==============================

    // 新規セッション作成
    const handleCreateSession = () => {
        const defaultName = `セッション ${sessions.length + 1}`;
        const name = window.prompt(
            "新しいセッション名を入力してください（例：NDA検討、雇用契約レビュー 等）",
            defaultName
        );

        if (!name) return;

        const newSession: Session = {
            id: "session-" + Date.now(),
            name: name.trim(),
            createdAt: Date.now(),
        };

        const nextSessions = [...sessions, newSession];
        setSessions(nextSessions);
        localStorage.setItem(SESSIONS_KEY, JSON.stringify(nextSessions));

        // 新しいセッションに切り替え
        setActiveSessionId(newSession.id);
        setMessages([]);
        setOutput("");
        setSteps([]);
        setReferences([]);
        setError("");
    };

    // セッション切り替え
    const handleSelectSession = (sessionId: string) => {
        if (sessionId === activeSessionId) return;
        setActiveSessionId(sessionId);
        setOutput("");
        setSteps([]);
        setReferences([]);
        setError("");
    };

    // セッション名の変更
    const handleSaveSessionName = (sessionId: string, newName: string) => {
        const trimmed = newName.trim();
        if (!trimmed) return;

        setSessions((prev) => {
            const updated = prev.map((s) =>
                s.id === sessionId ? { ...s, name: trimmed } : s
            );
            localStorage.setItem(SESSIONS_KEY, JSON.stringify(updated));
            return updated;
        });
    };

    // セッション削除
    const handleDeleteSession = (sessionId: string) => {
        const target = sessions.find((s) => s.id === sessionId);
        const targetName = target ? target.name : "";

        if (
            !window.confirm(
                `セッション「${targetName}」を削除しますか？\nこのセッションの会話履歴もすべて削除されます。`
            )
        ) {
            return;
        }

        // ストレージから履歴を削除
        try {
            localStorage.removeItem(messagesKeyFor(sessionId));
        } catch (e) {
            console.warn("Failed to remove messages for session:", e);
        }

        const remaining = sessions.filter((s) => s.id !== sessionId);
        let nextSessions;

        // 全て削除された場合はデフォルトセッションを再作成
        if (remaining.length === 0) {
            const defaultSession: Session = {
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

        // アクティブセッションだった場合は切り替え
        if (sessionId === activeSessionId) {
            const nextActiveId = nextSessions[0]?.id ?? null;
            setActiveSessionId(nextActiveId);
            setOutput("");
            setSteps([]);
            setReferences([]);
            setError("");

            if (!nextActiveId) {
                setMessages([]);
            }
        }
    };

    // セッションごとのメッセージ数を取得（UI表示用）
    const getMessageCount = (sessionId: string) => {
        if (sessionId === activeSessionId) return messages.length;
        try {
            const raw = localStorage.getItem(messagesKeyFor(sessionId));
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) return parsed.length;
            }
        } catch (e) { }
        return 0;
    };

    // =============================
    // イベントハンドラ: 文書操作 (API連携)
    // =============================

    // 文書一覧取得
    const fetchDocuments = async () => {
        try {
            setIsLoadingDocs(true);
            setDocListError("");
            const res = await fetch(DOC_LIST_URL, { method: "GET" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.detail || "文書一覧の取得に失敗しました。");
            }
            const data = await res.json();
            setDocuments(data.documents || []);
        } catch (err: any) {
            setDocListError(`文書一覧の取得中にエラーが発生しました: ${err.message}`);
        } finally {
            setIsLoadingDocs(false);
        }
    };

    // テキスト直接登録
    const handleRegisterText = async (title: string, content: string) => {
        const res = await fetch(DOC_REGISTER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, content }),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || "文書登録に失敗しました。");
        }
        await fetchDocuments(); // 一覧更新
    };

    // ファイルアップロード
    const handleUploadFile = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await fetch(DOC_UPLOAD_URL, {
            method: "POST",
            body: formData,
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || "ファイルアップロードに失敗しました。");
        }
        await fetchDocuments(); // 一覧更新
    };

    // 文書削除
    const handleDeleteDocument = async (documentId: string) => {
        const res = await fetch(DOC_DELETE_URL(documentId), { method: "DELETE" });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.detail || "文書削除に失敗しました。");
        }
        setDocuments((prev) => prev.filter((doc) => doc.document_id !== documentId));
    };


    // =============================
    // イベントハンドラ: チャット / エージェント連携
    // =============================

    // メッセージ送信
    const handleSendMessage = async (input: string, profileKey: string) => {
        // UI状態のリセット
        setError("");
        setSteps([]);
        setReferences([]);
        setIsLoading(true);

        // 回答プロファイル（システムプロンプト）の適用
        const profile = ANSWER_PROFILES[profileKey] || ANSWER_PROFILES.default;
        let promptToSend = input;

        // システムプロンプトがある場合は入力テキストに付与して送信
        if (profile.systemPrompt) {
            promptToSend = `
[回答プロファイル]: ${profile.label}

${profile.systemPrompt}

--- ユーザーからの指示 ---
${input}
`.trim();
        }

        // ユーザー自身のメッセージ表示用（生の入力を表示）
        const userMessage: Message = { role: "user", content: input };

        // API送信用の履歴作成（現在のメッセージを追加）
        const historyToSend = [...messages, userMessage];

        try {
            // API呼び出し
            const res = await fetch(ASK_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    input: promptToSend, // 実際にはプロファイル付きのテキストを送信
                    history: historyToSend,
                }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || data.detail || "サーバー側でエラーが発生しました。");
            }

            // レスポンスの解析
            const data = await res.json();
            const answerText = data.output || "";
            const newSteps = data.steps || [];
            const newReferences = data.references || [];

            // 結果をStateに反映
            setOutput(answerText);
            setSteps(newSteps);
            setReferences(newReferences);

            // アシスタントの回答を履歴に追加
            const assistantMessage: Message = { role: "assistant", content: answerText };
            setMessages([...historyToSend, assistantMessage]);

        } catch (err: any) {
            console.error(err);
            setError(`エージェント呼び出し中にエラーが発生しました: ${err.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    // 会話履歴のクリア
    const handleClearConversation = () => {
        if (!window.confirm("このセッションの会話履歴（user/assistant）をすべてクリアしますか？")) {
            return;
        }
        setMessages([]);
        setOutput("");
        setSteps([]);
        setReferences([]);
        setError("");
        if (activeSessionId) {
            localStorage.removeItem(messagesKeyFor(activeSessionId));
        }
    };

    // 現在のアクティブセッション情報取得
    const activeSession = sessions.find((s) => s.id === activeSessionId);

    // ==============================
    // レンダリング
    // ==============================
    return (
        <div className="app">
            <div className="layout">
                {/* サイドバー: セッション管理 */}
                <Sidebar
                    sessions={sessions}
                    activeSessionId={activeSessionId}
                    onSelectSession={handleSelectSession}
                    onCreateSession={handleCreateSession}
                    onDeleteSession={handleDeleteSession}
                    onSaveSessionName={handleSaveSessionName}
                    getMessageCount={getMessageCount}
                />

                {/* メインコンテンツエリア */}
                <main className="main">
                    <header className="main-header">
                        <div>
                            <h1 className="app-title">
                                {activeSession ? activeSession.name : "汎用タスク実行AIエージェント"}
                            </h1>
                            <p className="app-description">
                                手元の契約書ファイルをRAGに登録しつつ、LLMと対話できます。
                            </p>
                        </div>
                    </header>

                    {/* 文書管理コンポーネント */}
                    <DocumentManager
                        documents={documents}
                        onUploadFile={handleUploadFile}
                        onRegisterText={handleRegisterText}
                        onDeleteDocument={handleDeleteDocument}
                        onRefreshDocuments={fetchDocuments}
                        isLoading={isLoadingDocs}
                        error={docListError}
                    />

                    {/* チャットインターフェース */}
                    <ChatInterface
                        messages={messages}
                        output={output}
                        steps={steps}
                        references={references}
                        isLoading={isLoading}
                        error={error}
                        onSendMessage={handleSendMessage}
                        onClearConversation={handleClearConversation}
                    />
                </main>
            </div>
        </div>
    );
}

export default App;
