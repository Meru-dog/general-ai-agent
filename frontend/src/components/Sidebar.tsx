/**
 * frontend/src/components/Sidebar.tsx
 * 
 * サイドバーコンポーネント。
 * セッション（会話履歴の単位）一覧の表示、新規作成、選択、名前変更、削除機能を提供します。
 */

import React, { useState } from "react";
import { Session } from "../types";

interface SidebarProps {
    sessions: Session[];                     // セッション一覧データ
    activeSessionId: string | null;          // 現在選択されているセッションID
    onSelectSession: (id: string) => void;   // セッション選択時のハンドラ
    onCreateSession: () => void;             // 新規セッション作成時のハンドラ
    onDeleteSession: (id: string) => void;   // セッション削除時のハンドラ
    onSaveSessionName: (id: string, newName: string) => void; // セッション名保存時のハンドラ
    getMessageCount: (sessionId: string) => number; // メッセージ数を取得する関数
}

export const Sidebar: React.FC<SidebarProps> = ({
    sessions,
    activeSessionId,
    onSelectSession,
    onCreateSession,
    onDeleteSession,
    onSaveSessionName,
    getMessageCount,
}) => {
    // セッション名編集用の一時的な状態
    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editingSessionName, setEditingSessionName] = useState("");

    // 編集モード開始
    const handleStartEdit = (session: Session) => {
        setEditingSessionId(session.id);
        setEditingSessionName(session.name);
    };

    // 編集内容を保存してモード終了
    const handleSave = (sessionId: string) => {
        onSaveSessionName(sessionId, editingSessionName);
        setEditingSessionId(null);
        setEditingSessionName("");
    };

    // キーボード操作ハンドリング (Enterで保存, Escapeでキャンセル)
    const handleKeyDown = (e: React.KeyboardEvent, sessionId: string) => {
        if (e.key === "Enter") {
            e.preventDefault();
            handleSave(sessionId);
        } else if (e.key === "Escape") {
            setEditingSessionId(null);
            setEditingSessionName("");
        }
    };

    return (
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
                        onClick={onCreateSession}
                    >
                        ＋ 新規
                    </button>
                </div>

                <div className="session-list">
                    {sessions.map((session) => {
                        const isActive = session.id === activeSessionId;
                        const messageCount = getMessageCount(session.id);

                        return (
                            <div
                                key={session.id}
                                className={
                                    "session-row" + (isActive ? " session-row-active" : "")
                                }
                            >
                                {/* セッション選択ボタン（全体をクリック可能に） */}
                                <button
                                    type="button"
                                    className="session-button"
                                    onClick={() => onSelectSession(session.id)}
                                >
                                    <div className="session-name">
                                        {/* 編集モード中かどうかで表示を切り替え */}
                                        {editingSessionId === session.id ? (
                                            <input
                                                className="session-name-input"
                                                value={editingSessionName}
                                                onChange={(e) => setEditingSessionName(e.target.value)}
                                                onBlur={() => handleSave(session.id)}
                                                onKeyDown={(e) => handleKeyDown(e, session.id)}
                                                autoFocus
                                                onClick={(e) => e.stopPropagation()} // 親の選択イベント発火防止
                                            />
                                        ) : (
                                            <span
                                                className="session-name-text"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleStartEdit(session); // クリックで編集開始
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

                                {/* 削除ボタン */}
                                <button
                                    type="button"
                                    className="session-delete-button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onDeleteSession(session.id);
                                    }}
                                >
                                    削除
                                </button>
                            </div>
                        );
                    })}
                </div>
            </div>
        </aside>
    );
};
