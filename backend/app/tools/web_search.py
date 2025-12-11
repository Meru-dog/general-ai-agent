from typing import List, Dict
from tavily import TavilyClient
from app import config

# Tavily クライアントの初期化
if not config.TAVILY_API_KEY:
    # キーがない場合は None にしておいて、呼び出し時に警告を出す
    tavily_client = None
else:
    tavily_client = TavilyClient(api_key=config.TAVILY_API_KEY)


def run_web_search(query: str, max_results: int = 5) -> List[Dict]:
    """
    Web検索を実行して、LLM がそのまま食べやすい形の結果を返す。
    戻り値の各 dict には、title / url / content などを含める前提。
    """
    if tavily_client is None:
        print("[WebSearch] Tavily API キーが設定されていません。")
        return []

    try:
        # Tavily の search API 呼び出し
        # docs: https://docs.tavily.com/documentation/api-reference/endpoint/search :contentReference[oaicite:1]{index=1}
        resp = tavily_client.search(
            query=query,
            max_results=max_results,
            # 必要に応じて topic / search_depth なども指定可能
            # topic="general",
            # search_depth="basic",
        )
        # resp は dict: { "query": ..., "results": [...], ... } のイメージ
        results = resp.get("results", [])
        print(f"[WebSearch] query={query!r}, hits={len(results)}")
        return results
    except Exception as e:
        print(f"[WebSearch] 検索中にエラーが発生しました: {e}")
        return []
