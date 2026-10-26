// News data layer — headlines come through our own serverless relay
// at /api/news, which fetches Yahoo Finance server-side (see
// api/news.js). Stories use the shape { title, publisher, url,
// publishedAt, thumbnail }, where publishedAt is a unix timestamp in
// SECONDS and the list is sorted newest first.

const NEWS_URL = (ticker) => `/api/news?ticker=${encodeURIComponent(ticker)}`

const newsCache = new Map()

export async function fetchNews(ticker) {
  const key = (ticker || '').toString().toUpperCase()
  if (newsCache.has(key)) return newsCache.get(key)
  const res = await fetch(NEWS_URL(ticker))
  if (!res.ok) throw new Error(`News fetch failed for ${key}: ${res.status}`)
  const data = await res.json()
  const stories = Array.isArray(data?.stories) ? data.stories : []
  newsCache.set(key, stories)
  return stories
}

// "just now" / "12m ago" / "3h ago" / "2d ago" / a short date for
// anything older — Apple-Stocks-style relative timestamps.
export function timeAgo(unixSeconds) {
  const t = Number(unixSeconds)
  if (!Number.isFinite(t) || t <= 0) return ''
  const diff = Math.floor(Date.now() / 1000) - t
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`
  return new Date(t * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}
