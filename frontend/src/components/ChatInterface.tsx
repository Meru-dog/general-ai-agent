import React, { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Message, StepLog, ANSWER_PROFILES, Reference } from "../types";

// ==========================================
// Props Definition
// ==========================================
interface ChatInterfaceProps {
    messages: Message[];
    output: string;
    steps: StepLog[];
    references?: Reference[]; // Added references
    isLoading: boolean;
    error: string;
    onSendMessage: (input: string, profileKey: string) => Promise<void>;
    onClearConversation: () => void;
}

// ==========================================
// Chat Interface Component
// ==========================================
export const ChatInterface: React.FC<ChatInterfaceProps> = ({
    messages,
    output,
    steps,
    references = [], // Default empty
    isLoading,
    error,
    onSendMessage,
    onClearConversation,
}) => {
    // State for input text and selected profile
    const [inputText, setInputText] = useState("");
    const [answerProfile, setAnswerProfile] = useState("default");

    // Handle form submission
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputText.trim()) return;

        await onSendMessage(inputText, answerProfile);
        setInputText("");
    };

    return (
        <>
            {/* ==========================================
                Chat Section (Input & History)
               ========================================== */}
            <section className="section-card chat-section">
                <div className="section-card-header">
                    <h2 className="section-title">エージェントへの指示</h2>
                    <button
                        type="button"
                        className="secondary-button"
                        onClick={onClearConversation}
                    >
                        会話履歴をクリア
                    </button>
                </div>

                {/* Message History */}
                <div className="chat-history">
                    {messages.map((msg, idx) => (
                        <div
                            key={idx}
                            className={`chat-message ${msg.role === "user" ? "chat-message-user" : "chat-message-assistant"
                                }`}
                        >
                            <div className="message-role">
                                {msg.role === "user" ? "User" : "Assistant"}
                            </div>
                            <div className="message-content">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Input Form */}
                <form className="chat-input-form" onSubmit={handleSubmit}>
                    <div className="chat-controls">
                        <label className="profile-label">
                            回答モード:
                            <select
                                value={answerProfile}
                                onChange={(e) => setAnswerProfile(e.target.value)}
                                className="profile-select"
                            >
                                {Object.entries(ANSWER_PROFILES).map(([key, profile]) => (
                                    <option key={key} value={key}>{profile.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="input-row">
                        {/* Enlarged textarea as requested */}
                        <textarea
                            className="chat-textarea"
                            placeholder="ここに質問や指示を入力してください..."
                            rows={8}
                            cols={80}
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault();
                                    handleSubmit(e);
                                }
                            }}
                        />
                        <button
                            type="submit"
                            className="primary-button send-button"
                            disabled={isLoading}
                        >
                            {isLoading ? "送信中..." : "送信"}
                        </button>
                    </div>
                </form>

                {error && <div className="error-text">{error}</div>}
            </section>

            {/* ==========================================
                Result Section (Output, Steps, References)
               ========================================== */}
            {(output || steps.length > 0) && (
                <section className="section-card result-section">
                    <h2 className="section-title">実行結果</h2>

                    {/* Step Visualization (Detail) */}
                    {steps.length > 0 && (
                        <details className="steps-details">
                            <summary>{steps.length} 個の思考ステップ（クリックで展開）</summary>
                            <div className="steps-list">
                                {steps.map((step, i) => (
                                    <div key={i} className="step-item">
                                        <div className="step-header">
                                            Step {step.step_idx}: <strong>{step.agent_node}</strong>
                                        </div>
                                        <div className="step-content">
                                            <div className="step-label">Input:</div>
                                            <pre>{step.step_input}</pre>
                                            <div className="step-label">Output:</div>
                                            <pre>{step.step_output}</pre>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </details>
                    )}

                    {/* References Display */}
                    {references.length > 0 && (
                        <div className="references-section">
                            <h3>参考にした文書・URL</h3>
                            <ul className="references-list">
                                {references.map((ref, idx) => (
                                    <li key={idx} className="reference-item">
                                        {ref.url ? (
                                            <a href={ref.url} target="_blank" rel="noopener noreferrer">
                                                {ref.title}
                                            </a>
                                        ) : (
                                            <span className="reference-title">{ref.title}</span>
                                        )}
                                        {ref.snippet && (
                                            <div className="reference-snippet">{ref.snippet.slice(0, 100)}...</div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {/* Final Output */}
                    <div className="final-output">
                        <h3>最終回答</h3>
                        <ReactMarkdown>{output}</ReactMarkdown>
                    </div>
                </section>
            )}
        </>
    );
};
