export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

class SearchServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SearchServiceError';
  }
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new SearchServiceError(err.error || `Search error (${res.status})`);
    }

    const data = await res.json();
    return data.results || [];
  } catch (error) {
    throw error instanceof Error ? error : new SearchServiceError('Failed to execute web search');
  }
}
