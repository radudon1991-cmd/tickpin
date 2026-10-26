// Vercel serverless relay for SEC EDGAR company submissions.
// data.sec.gov sends no usable CORS headers for browsers (same
// situation as api/companyfacts.js), so the Info tab fetches the
// submissions payload server-side with a declared User-Agent (SEC
// fair access: max 10 req/sec, we are far below) and gets a shaped
// same-origin JSON: identity, classification, HQ address, and the
// most recent filings. Fields EDGAR does not carry stay null —
// nothing is invented here.
export default async function handler(req, res) {
  const cikRaw = (req.query?.cik || '').toString().replace(/\D/g, '')
  if (!cikRaw || cikRaw.length > 10) {
    res.status(400).json({ error: 'cik query parameter required' })
    return
  }
  const cik = cikRaw.padStart(10, '0')
  try {
    const upstream = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, {
      headers: {
        'User-Agent': 'TickPin research contact: radudon1991@gmail.com',
        Accept: 'application/json',
      },
    })
    if (!upstream.ok) {
      res.status(502).json({ error: `EDGAR responded ${upstream.status}` })
      return
    }
    const data = await upstream.json()

    const biz = data.addresses?.business || null
    const business = biz
      ? {
          street1: biz.street1 || null,
          street2: biz.street2 || null,
          city: biz.city || null,
          stateOrCountry: biz.stateOrCountry || null,
          // EDGAR's own plain-text rendering of the code above (e.g.
          // "A1" -> "British Columbia, Canada"); carried through when
          // present so the UI does not show raw codes.
          stateOrCountryDescription: biz.stateOrCountryDescription || null,
          zip: biz.zipCode || null,
        }
      : null

    // filings.recent is a set of parallel arrays, already newest-first.
    const recent = data.filings?.recent || {}
    const count = Math.min(8, recent.form?.length || 0)
    const recentFilings = []
    for (let i = 0; i < count; i++) {
      recentFilings.push({
        form: recent.form[i] || null,
        filingDate: recent.filingDate?.[i] || null,
        reportDate: recent.reportDate?.[i] || null,
        accessionNumber: recent.accessionNumber?.[i] || null,
        primaryDocument: recent.primaryDocument?.[i] || null,
        items: recent.items?.[i] || '',
      })
    }

    // The newest annual report is rarely among the 8 latest filings
    // (Form 4s and 8-Ks flood the top), so scan the full recent arrays
    // for the newest 10-K / 20-F / 40-F and carry it separately.
    const ANNUAL_FORMS = ['10-K', '20-F', '40-F']
    let latestAnnual = null
    const total = recent.form?.length || 0
    for (let i = 0; i < total; i++) {
      if (ANNUAL_FORMS.includes(recent.form[i])) {
        latestAnnual = {
          form: recent.form[i],
          filingDate: recent.filingDate?.[i] || null,
          reportDate: recent.reportDate?.[i] || null,
          accessionNumber: recent.accessionNumber?.[i] || null,
        }
        break
      }
    }

    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400')
    res.status(200).json({
      name: data.name || null,
      tickers: Array.isArray(data.tickers) ? data.tickers : [],
      exchanges: Array.isArray(data.exchanges) ? data.exchanges : [],
      sic: data.sic || null,
      sicDescription: data.sicDescription || null,
      // EDGAR sometimes embeds a literal "<br>" in this string (e.g.
      // "Non-accelerated filer<br>Emerging growth company") — flatten
      // it so the UI never shows raw markup.
      category: data.category ? data.category.replace(/<br\s*\/?>/gi, ' · ') : null,
      fiscalYearEnd: data.fiscalYearEnd || null,
      stateOfIncorporation: data.stateOfIncorporation || null,
      stateOfIncorporationDescription: data.stateOfIncorporationDescription || null,
      phone: data.phone || null,
      // Only carried through when EDGAR actually provides one.
      website: data.website || data.investorWebsite || null,
      description: data.description || null,
      addresses: { business },
      recentFilings,
      latestAnnual,
    })
  } catch (err) {
    res.status(502).json({ error: 'EDGAR fetch failed' })
  }
}
