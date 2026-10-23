// Vercel serverless proxy for SEC EDGAR companyfacts.
// data.sec.gov sends NO CORS headers on successful responses (verified
// live 2026-10-22: the 200 response has no Access-Control-Allow-Origin;
// only its error responses carry one, which misled an earlier check).
// Browsers therefore block the site's direct fetch. This function
// fetches server-side with a declared User-Agent (SEC fair access:
// max 10 req/sec, we are far below) and returns the JSON same-origin.
export default async function handler(req, res) {
  const cikRaw = (req.query?.cik || '').toString().replace(/\D/g, '')
  if (!cikRaw) {
    res.status(400).json({ error: 'cik query parameter required' })
    return
  }
  const cik = cikRaw.padStart(10, '0')
  try {
    const upstream = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      {
        headers: {
          'User-Agent': 'TickPin research contact: radudon1991@gmail.com',
          Accept: 'application/json',
        },
      }
    )
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `EDGAR responded ${upstream.status}` })
      return
    }
    const data = await upstream.json()
    // Company facts change at most when a new filing lands; let the
    // Vercel edge cache carry repeat views for an hour.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    res.status(200).json(data)
  } catch (err) {
    res.status(502).json({ error: 'EDGAR fetch failed' })
  }
}
