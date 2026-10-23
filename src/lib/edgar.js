// SEC EDGAR data layer — all data comes from the SEC's free public APIs.
// Rules (SEC fair access): descriptive User-Agent, max 10 req/sec.
// NOTE: browsers cannot set a custom User-Agent header; requests from the
// deployed site carry the browser UA. The scheduled ingest jobs (see
// /ingest) run server-side with a proper declared User-Agent.

// The ticker list is fetched at BUILD time by scripts/fetch-tickers.mjs
// and served same-origin: www.sec.gov sends no CORS headers, so a
// browser fetch from the deployed site is blocked (found live
// 2026-10-22, Bill's first visit). data.sec.gov below DOES send
// Access-Control-Allow-Origin: *, so company data fetches work live.
const TICKERS_URL = '/tickers.json'
const FACTS_URL = (cik) =>
  `https://data.sec.gov/api/xbrl/companyfacts/CIK${String(cik).padStart(10, '0')}.json`
const SUBMISSIONS_URL = (cik) =>
  `https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`

let tickersCache = null

export async function loadTickers() {
  if (tickersCache) return tickersCache
  const res = await fetch(TICKERS_URL)
  if (!res.ok) throw new Error(`EDGAR tickers fetch failed: ${res.status}`)
  const raw = await res.json()
  tickersCache = Object.values(raw).map((r) => ({
    ticker: r.ticker,
    cik: r.cik_str,
    name: r.title,
  }))
  return tickersCache
}

export async function fetchCompanyFacts(cik) {
  const res = await fetch(FACTS_URL(cik))
  if (!res.ok) throw new Error(`EDGAR companyfacts failed: ${res.status}`)
  return res.json()
}

export async function fetchSubmissions(cik) {
  const res = await fetch(SUBMISSIONS_URL(cik))
  if (!res.ok) throw new Error(`EDGAR submissions failed: ${res.status}`)
  return res.json()
}

// Pull the most recent value for an XBRL concept, deduped by period end.
// companyfacts repeats the same period across filings (restatements,
// prior-year columns) — keep the value from the most recently FILED
// document for each period end, then take the latest period.
function latestFact(facts, taxonomy, concept, { annualOnly = false } = {}) {
  const series = facts?.facts?.[taxonomy]?.[concept]
  if (!series) return null
  const units = series.units || {}
  const unitKey = Object.keys(units).find((u) => u === 'USD') || Object.keys(units)[0]
  if (!unitKey) return null
  let rows = units[unitKey].filter((r) => r.end && r.filed)
  if (annualOnly) rows = rows.filter((r) => r.fp === 'FY' && /^10-K/.test(r.form || ''))
  const byEnd = new Map()
  for (const r of rows) {
    const prev = byEnd.get(r.end)
    if (!prev || r.filed > prev.filed) byEnd.set(r.end, r)
  }
  const sorted = [...byEnd.values()].sort((a, b) => (a.end < b.end ? 1 : -1))
  return sorted[0] || null
}

export function extractSnapshot(facts) {
  if (!facts) return null
  const pick = (concept, opts) => latestFact(facts, 'us-gaap', concept, opts)
  return {
    revenue: pick('RevenueFromContractWithCustomerExcludingAssessedTax') || pick('Revenues'),
    netIncome: pick('NetIncomeLoss'),
    totalAssets: pick('Assets'),
    cash: pick('CashAndCashEquivalentsAtCarryingValue'),
    sharesOutstanding: latestFact(facts, 'dei', 'EntityCommonStockSharesOutstanding'),
  }
}

export function fmtUSD(v) {
  if (v == null || isNaN(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e12) return `$${(v / 1e12).toFixed(2)}T`
  if (abs >= 1e9) return `$${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
  return `$${v}`
}

export function fmtNum(v) {
  if (v == null || isNaN(v)) return '—'
  return new Intl.NumberFormat('en-US').format(v)
}
