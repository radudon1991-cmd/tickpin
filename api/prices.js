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

async function fetchCandles(ticker, interval, range = '5y', extra = '') {
  const upstream = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${range}&interval=${interval}${extra}`,
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
    if ((req.query?.intraday || '').toString() === '1') {
      // Intraday sessions at minute resolution, including pre-market
      // (from 04:00 ET) and after-hours (to 20:00 ET) bars. ?days=N
      // (1..30, default 1) selects how many trading sessions to
      // return: the locked session chart's day-count filter. Also
      // returns prevClose — the close before the returned window —
      // which the chart draws as its dashed reference line.
      let days = parseInt((req.query?.days || '1').toString(), 10)
      if (!Number.isFinite(days)) days = 1
      days = Math.min(30, Math.max(1, days))
      const ladder =
        days === 1
          ? ['1d', '1m']
          : days <= 5
            ? ['5d', '1m']
            : days <= 10
              ? ['1mo', '5m']
              : ['3mo', '15m']
      const up = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?range=${ladder[0]}&interval=${ladder[1]}&includePrePost=true`,
        {
          headers: {
            'User-Agent': 'TickPin research contact: radudon1991@gmail.com',
            Accept: 'application/json',
          },
        }
      )
      if (!up.ok) {
        res.status(up.status).json({ error: `Yahoo responded ${up.status}` })
        return
      }
      const data = await up.json()
      const result = data?.chart?.result?.[0]
      if (data?.chart?.error || !result) {
        res.status(502).json({ error: 'Yahoo chart returned an error' })
        return
      }
      let intraday = toCandles(data)
      let prevClose = result.meta?.chartPreviousClose ?? result.meta?.previousClose ?? null
      if (days > 1 && intraday.length > 0) {
        // Keep only the last `days` distinct ET session dates, and set
        // the reference close to the last bar before the window.
        const dateFmt = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/New_York',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        })
        const dates = []
        const seen = new Set()
        for (const b of intraday) {
          const d = dateFmt.format(new Date(b.t * 1000))
          if (!seen.has(d)) {
            seen.add(d)
            dates.push(d)
          }
        }
        const keep = new Set(dates.slice(-days))
        const firstKept = intraday.findIndex((b) => keep.has(dateFmt.format(new Date(b.t * 1000))))
        if (firstKept > 0) prevClose = intraday[firstKept - 1].c
        intraday = intraday.filter((b) => keep.has(dateFmt.format(new Date(b.t * 1000))))
      }
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300')
      res.status(200).json({ intraday, prevClose, days })
      return
    }
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
