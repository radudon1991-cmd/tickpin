// Vercel serverless relay for Yahoo Finance price history.
// Yahoo's v8 chart API is fetched server-side so the site gets
// same-origin JSON with a declared User-Agent, mirroring the EDGAR
// relay in api/companyfacts.js. Returns daily and weekly candles in
// the shared shape { t, o, h, l, c, v }, where t is a unix timestamp
// in SECONDS, ascending by time.

function toCandles(data) {
  const result = data?.chart?.result?.[0]
  const timestamps = result?.timestamp || []
  const quote = result?.indicators?.quote?.[0] || {}
  const candles = []
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i]
    const h = quote.high?.[i]
    const l = quote.low?.[i]
    const c = quote.close?.[i]
    // Drop any row with a missing price field (suspension days and
    // partial bars come back from Yahoo with null OHLC values).
    if (o == null || h == null || l == null || c == null) continue
    candles.push({
      t: timestamps[i],
      o,
      h,
      l,
      c,
      v: quote.volume?.[i] ?? null,
    })
  }
  return candles
}

async function fetchCandles(ticker, interval) {
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=5y&interval=${interval}`,
    {
      headers: {
        'User-Agent': 'TickPin research contact: radudon1991@gmail.com',
        Accept: 'application/json',
      },
    }
  )
  if (!upstream.ok) {
    const err = new Error(`Yahoo responded ${upstream.status}`)
    err.status = upstream.status
    throw err
  }
  const data = await upstream.json()
  if (data?.chart?.error || !data?.chart?.result?.[0]) {
    const err = new Error('Yahoo chart returned an error')
    err.status = 502
    throw err
  }
  return toCandles(data)
}

export default async function handler(req, res) {
  const tickerRaw = (req.query?.ticker || '').toString()
  if (!/^[A-Za-z.\-]{1,12}$/.test(tickerRaw)) {
    res.status(400).json({ error: 'ticker query parameter required' })
    return
  }
  const ticker = tickerRaw.toUpperCase()
  try {
    const daily = await fetchCandles(ticker, '1d')
    const weekly = await fetchCandles(ticker, '1wk')
    // Prices change at most daily; let the Vercel edge cache carry
    // repeat views for fifteen minutes.
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400')
    res.status(200).json({ daily, weekly })
  } catch (err) {
    res.status(err.status || 502).json({ error: err.status ? err.message : 'Yahoo fetch failed' })
  }
}
