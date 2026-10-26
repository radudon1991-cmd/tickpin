// Price history data layer — daily and weekly candles come through
// our own serverless relay at /api/prices, which fetches Yahoo
// Finance server-side (see api/prices.js). Candles use the shared
// shape { t, o, h, l, c, v }, where t is a unix timestamp in
// SECONDS, ascending by time.

const PRICES_URL = (ticker) => `/api/prices?ticker=${encodeURIComponent(ticker)}`

const pricesCache = new Map()

export async function fetchPrices(ticker) {
  const key = (ticker || '').toString().toUpperCase()
  if (pricesCache.has(key)) return pricesCache.get(key)
  const res = await fetch(PRICES_URL(ticker))
  if (!res.ok) throw new Error(`Prices fetch failed for ${key}: ${res.status}`)
  const data = await res.json()
  pricesCache.set(key, data)
  return data
}
