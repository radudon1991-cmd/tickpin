// Build-time fetch of the SEC ticker list.
// www.sec.gov does NOT send CORS headers, so browsers cannot fetch
// company_tickers.json from the deployed site. Instead we download it
// here, at build time (server-side, declared User-Agent per SEC fair
// access), trim it, and ship it as a same-origin static file:
// public/tickers.json -> https://<site>/tickers.json
// Fallbacks keep the build green offline: keep an existing
// public/tickers.json, else write the starter watchlist only.
import { existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const SRC = 'https://www.sec.gov/files/company_tickers.json'
const OUT = new URL('../public/tickers.json', import.meta.url).pathname
const UA = 'TickPin research contact: radudon1991@gmail.com'

const STARTER = [
  { ticker: 'AAPL', cik_str: 320193, title: 'Apple Inc.' },
  { ticker: 'MSFT', cik_str: 789019, title: 'MICROSOFT CORP' },
  { ticker: 'NVDA', cik_str: 1045810, title: 'NVIDIA CORP' },
  { ticker: 'TSLA', cik_str: 1318605, title: 'Tesla, Inc.' },
  { ticker: 'ZENA', cik_str: 1872782, title: 'ZenaTech, Inc.' },
]

function save(rows, why) {
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, JSON.stringify(rows))
  console.log(`[tickers] wrote ${rows.length} rows (${why})`)
}

try {
  const res = await fetch(SRC, { headers: { 'User-Agent': UA } })
  if (!res.ok) throw new Error(`SEC responded ${res.status}`)
  const raw = await res.json()
  const rows = Object.values(raw).map((r) => ({
    ticker: r.ticker,
    cik_str: r.cik_str,
    title: r.title,
  }))
  if (rows.length < 1000) throw new Error(`suspicious row count: ${rows.length}`)
  save(rows, 'live SEC fetch')
} catch (err) {
  console.warn(`[tickers] live fetch failed: ${err.message}`)
  if (existsSync(OUT)) {
    console.log('[tickers] keeping existing public/tickers.json')
  } else {
    save(STARTER, 'starter fallback')
  }
}
