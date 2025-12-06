// frontend/src/App.jsx
// React から useState をインポート（状態管理に使用）
import { useState } from "react";
// コンポーネント用のスタイルシートを読み込む
import "./App.css";

// バックエンドのエージェントAPIのURL
// 環境変数 VITE_API_URL から取得（設定されていない場合はローカル開発用のデフォルト値を使用）
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/agent/ask";

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
      console.error(err);
      setError("エージェントからの回答取得に失敗しました。サーバーが起動しているか確認してください。");
    } finally {
      // 成功・失敗に関わらずローディング状態を解除
      setIsLoading(false);
    }
  };

  // JSX（画面の見た目）を返す
  return (
    <div className="app">
      {/* アプリのタイトル */}
      <h1 className="app-title">汎用タスク実行AIエージェント</h1>

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
