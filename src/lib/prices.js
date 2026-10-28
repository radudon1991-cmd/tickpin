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

// Today's intraday session (1-minute bars incl. pre/post market) via
// the same relay. Short 30-second client cache: the Chart tab's Today
// view refreshes about once a minute while it is open.
const intraCache = new Map()

export async function fetchIntraday(ticker) {
  return fetchSessions(ticker, 1)
}

// Intraday sessions for the locked session chart: `days` trading
// sessions (1..365) of minute bars incl. pre/post market, plus the
// close before the window (prevClose).
export async function fetchSessions(ticker, days = 1) {
  const key = `${(ticker || '').toString().toUpperCase()}:${days}`
  const hit = intraCache.get(key)
  if (hit && Date.now() - hit.at < 30_000) return hit.data
  const res = await fetch(`${PRICES_URL(ticker)}&intraday=1&days=${days}`)
  if (!res.ok) throw new Error(`Intraday fetch failed for ${key}: ${res.status}`)
  const data = await res.json()
  intraCache.set(key, { at: Date.now(), data })
  return data
}
