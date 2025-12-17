export interface StepLog {
    step_idx: number;
    agent_node: string;
    step_input: string;
    step_output: string;
    tool_calls: unknown[];
    source?: string;
}

export interface Reference {
    title: string;
    url?: string;
    snippet?: string;
}

export interface Message {
    role: "user" | "assistant";
    content: string;
}

export interface Session {
    id: string;
    name: string;
    createdAt: number;
}

export interface DocumentSummary {
    document_id: string;
    document_title: string;
    chunk_count: number;
}

export interface AnswerProfile {
    label: string;
    systemPrompt: string;
}

export interface AnswerProfileMap {
    [key: string]: AnswerProfile;
}

export const ANSWER_PROFILES: AnswerProfileMap = {
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
