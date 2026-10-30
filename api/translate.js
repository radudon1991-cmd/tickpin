// Vercel serverless relay for translating article text in the
// on-site reader. Primary engine: Wikimedia's MinT machine
// translation service (public, no API key, no cost — powered by
// open models). Fallback: Google Translate's free public endpoint
// (client=gtx). Both are fetched server-side so the browser gets
// same-origin JSON. Nothing is stored: translation is per-click,
// in memory only. News sources are English, so the source language
// is fixed to "en". Accepts POST JSON { text, target } and returns
// { ok: true, text } or { ok: false }.

const MAX_TEXT = 5000

// MinT uses plain ISO codes; map the region-tagged ones we offer.
const MINT_CODES = { 'zh-CN': 'zh', 'zh-TW': 'zh', fil: 'tl' }

async function translateMint(text, target) {
  const tl = MINT_CODES[target] || target
  const upstream = await fetch(`https://translate.wmcloud.org/api/translate/en/${tl}`, {
    method: 'POST',
    signal: AbortSignal.timeout(15000),
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'TickPin/1.0 (contact: radudon1991@gmail.com)',
    },
    body: JSON.stringify({ text }),
  })
  if (!upstream.ok) throw new Error(`mint responded ${upstream.status}`)
  const data = await upstream.json()
  if (!data?.translation) throw new Error('mint returned no translation')
  return data.translation
}

async function translateGtx(text, target) {
  const form = new URLSearchParams({ q: text })
  const upstream = await fetch(
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${encodeURIComponent(target)}&dt=t`,
    {
      method: 'POST',
      signal: AbortSignal.timeout(12000),
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
      },
      body: form.toString(),
    },
  )
  if (!upstream.ok) throw new Error(`gtx responded ${upstream.status}`)
  const data = await upstream.json()
  const segments = Array.isArray(data?.[0]) ? data[0] : []
  const translated = segments
    .map((seg) => (Array.isArray(seg) ? seg[0] || '' : ''))
    .join('')
  if (!translated) throw new Error('gtx returned no translation')
  return translated
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'POST only' })
    return
  }
  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      body = null
    }
  }
  const text = (body?.text || '').toString()
  const target = (body?.target || '').toString()
  if (!text || text.length > MAX_TEXT) {
    res.status(400).json({ ok: false, error: 'text required (max 5000 chars)' })
    return
  }
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(target)) {
    res.status(400).json({ ok: false, error: 'valid target language required' })
    return
  }
  // Source is English; translating "to English" is the text itself.
  if (target === 'en') {
    res.status(200).json({ ok: true, text })
    return
  }
  try {
    const translated = await translateMint(text, target)
    res.status(200).json({ ok: true, text: translated })
    return
  } catch {
    // fall through to the Google endpoint
  }
  try {
    const translated = await translateGtx(text, target)
    res.status(200).json({ ok: true, text: translated })
  } catch {
    res.status(200).json({ ok: false, error: 'translation unavailable' })
  }
}
