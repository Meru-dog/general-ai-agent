/**
 * frontend/src/components/DocumentManager.tsx
 * 
 * 文書管理コンポーネント。
 * RAG（Retrieval-Augmented Generation）で使用する文書の登録一覧表示、
 * テキストの直接登録、ファイルのアップロード、および削除機能を提供します。
 */

import React, { useState, useEffect } from "react";
import { DocumentSummary } from "../types";

// ==========================================
// Props Definition
// ==========================================
interface DocumentManagerProps {
    documents: DocumentSummary[]; // 一覧表示用の文書データ配列
    onUploadFile: (file: File) => Promise<void>; // ファイルアップロード時のコールバック
    onRegisterText: (title: string, content: string) => Promise<void>; // テキスト登録時のコールバック
    onDeleteDocument: (docId: string) => Promise<void>; // 削除時のコールバック
    onRefreshDocuments: () => void; // 一覧更新リクエスト
    isLoading: boolean; // 読み込み中フラグ
    error: string; // エラーメッセージ
}

export const DocumentManager: React.FC<DocumentManagerProps> = ({
    documents,
    onUploadFile,
    onRegisterText,
    onDeleteDocument,
    onRefreshDocuments,
    isLoading,
    error,
}) => {
    // ==========================================
    // Local State for Form Inputs
    // ==========================================
    // テキスト登録フォーム用
    const [docTitle, setDocTitle] = useState("");
    const [docContent, setDocContent] = useState("");
    const [registerResultMsg, setRegisterResultMsg] = useState("");

    // ファイルアップロード用
    const [uploadFile, setUploadFile] = useState<File | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadResultMsg, setUploadResultMsg] = useState("");

    // ==========================================
    // Event Handlers
    // ==========================================

    // テキスト登録ハンドラ
    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setRegisterResultMsg("");

        // バリデーション
        if (!docTitle.trim() || !docContent.trim()) {
            setRegisterResultMsg("タイトルと文書内容を入力してください。");
            return;
        }

        try {
            await onRegisterText(docTitle, docContent);
            // 成功時はフォームをクリア
            setDocTitle("");
            setDocContent("");
            setRegisterResultMsg("登録成功");
        } catch (err: any) {
            setRegisterResultMsg(`エラー: ${err.message}`);
        }
    };

    // ファイルアップロードハンドラ
    const handleUpload = async () => {
        setUploadResultMsg("");
        if (!uploadFile) {
            setUploadResultMsg("ファイルを選択してください");
            return;
        }
        try {
            setIsUploading(true);
            await onUploadFile(uploadFile);
            setUploadFile(null); // ファイル選択状態をリセット
            setUploadResultMsg("アップロード成功");
        } catch (err: any) {
            setUploadResultMsg(`エラー: ${err.message}`);
        } finally {
            setIsUploading(false);
        }
    };

    // コンポーネントマウント時に文書一覧を再取得
    useEffect(() => {
        onRefreshDocuments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ==========================================
    // Render
    // ==========================================
    return (
        <>
            {/* ===== 文書登録エリア ===== */}
            <section className="section-grid">

                {/* 1. テキスト貼り付け登録カード */}
                <div className="section-card">
                    <h2 className="section-title">文書登録（テキスト貼り付け）</h2>
                    <form className="document-form" onSubmit={handleRegister}>
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
                                onClick={() => {
                                    setDocTitle("");
                                    setDocContent("");
                                    setRegisterResultMsg("");
                                }}
                            >
                                クリア
                            </button>
                            <button type="submit" className="primary-button">
                                文書を登録
                            </button>
                        </div>
                    </form>
                    {registerResultMsg && (
                        <p className="helper-text">{registerResultMsg}</p>
                    )}
                </div>

                {/* 2. ファイルアップロードカード */}
                <div className="section-card">
                    <h2 className="section-title">文書登録（ファイルアップロード）</h2>
                    <p className="helper-text">
                        現在はテキストファイル（.txt / .md など UTF-8）、PDF（テキスト埋め込み型）、
                        Word（.docx）のアップロードに対応しています。
                    </p>

                    <div className="file-upload-row">
                        <input
                            type="file"
                            onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                            className="file-input"
                        />
                        <button
                            type="button"
                            className="primary-button"
                            onClick={handleUpload}
                            disabled={isUploading}
                        >
                            {isUploading ? "アップロード中..." : "ファイルをアップロードして登録"}
                        </button>
                    </div>

                    {uploadResultMsg && <p className="helper-text">{uploadResultMsg}</p>}
                </div>
            </section>

            {/* ===== 登録済み文書一覧表示エリア ===== */}
            <section className="section-full">
                <div className="section-card">
                    <div className="section-card-header">
                        <h2 className="section-title">登録済み文書</h2>
                        <div className="document-list-header">
                            <button
                                type="button"
                                className="secondary-button"
                                onClick={onRefreshDocuments}
                                disabled={isLoading}
                            >
                                更新
                            </button>
                        </div>
                    </div>

                    {error && <p className="error-text">{error}</p>}

                    {isLoading && documents.length === 0 ? (
                        <p>読み込み中...</p>
                    ) : (
                        <div className="document-table-wrapper">
                            <table className="document-table">
                                <thead>
                                    <tr>
                                        <th>文書ID</th>
                                        <th>タイトル</th>
                                        <th>チャンク数</th>
                                        <th>操作</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {documents.map(doc => (
                                        <tr key={doc.document_id}>
                                            <td className="doc-id-cell">{doc.document_id}</td>
                                            <td className="doc-title-cell">{doc.document_title}</td>
                                            <td>{doc.chunk_count}</td>
                                            <td>
                                                <button
                                                    className="delete-icon-button"
                                                    onClick={() => onDeleteDocument(doc.document_id)}
                                                >
                                                    削除
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {documents.length === 0 && (
                                        <tr>
                                            <td colSpan={4} className="empty-cell">登録された文書はありません</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </section>
        </>
    );
};
