// Vercel serverless relay for reading a news article ON TickPin.
// When a reader clicks a story, the client asks this relay for the
// article text; the relay fetches the page live, extracts a readable
// excerpt, and returns it as JSON. NOTHING is stored: the fetch is
// per-click and the edge cache only carries repeat views briefly.
// Returns { ok: true, title, excerpt, host } or { ok: false } when
// the page cannot be fetched or yields too little readable text —
// the client then offers the original link (behind a leave warning).

const MAX_HTML = 1_500_000
const MIN_EXCERPT = 220
const TARGET_EXCERPT = 1600
const MAX_EXCERPT = 2200

function isBlockedHost(hostname) {
  const h = (hostname || '').toLowerCase()
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal')) return true
  // IPv4 literals in private / loopback / link-local ranges.
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])]
    if (a === 10 || a === 127 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }
  if (h === '::1' || h.startsWith('fc') || h.startsWith('fd')) return true
  return false
}

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n)
      return code > 0 && code < 0x110000 ? String.fromCodePoint(code) : ''
    })
}

function cleanText(html) {
  return decodeEntities(
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function pickTitle(html) {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  )
  if (og?.[1]) return decodeEntities(og[1]).trim()
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (t?.[1]) return cleanText(t[1])
  return ''
}

function extractExcerpt(html) {
  let scope = html
  // Prefer the largest <article> block when the page has one.
  const articles = [...html.matchAll(/<article[^>]*>([\s\S]*?)<\/article>/gi)]
  if (articles.length > 0) {
    articles.sort((a, b) => b[1].length - a[1].length)
    scope = articles[0][1]
  }
  scope = scope
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header[\s\S]*?<\/header>/gi, ' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi, ' ')
    .replace(/<form[\s\S]*?<\/form>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
  const seen = new Set()
  const paras = []
  let total = 0
  for (const match of scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const text = cleanText(match[1])
    if (text.length < 60) continue
    if (/^(sign up|subscribe|advertisement|by signing up)/i.test(text)) continue
    if (seen.has(text)) continue
    seen.add(text)
    paras.push(text)
    total += text.length
    if (total >= TARGET_EXCERPT || paras.length >= 8) break
  }
  let excerpt = paras.join('\n\n')
  if (excerpt.length > MAX_EXCERPT) {
    const cut = excerpt.lastIndexOf(' ', MAX_EXCERPT)
    excerpt = `${excerpt.slice(0, cut > 0 ? cut : MAX_EXCERPT)}…`
  }
  return excerpt
}

export default async function handler(req, res) {
  const raw = (req.query?.url || '').toString()
  let target
  try {
    target = new URL(raw)
  } catch {
    res.status(400).json({ ok: false, error: 'url query parameter required' })
    return
  }
  if (
    (target.protocol !== 'https:' && target.protocol !== 'http:') ||
    target.username ||
    target.password ||
    isBlockedHost(target.hostname)
  ) {
    res.status(400).json({ ok: false, error: 'url not allowed' })
    return
  }
  try {
    const upstream = await fetch(target.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(9000),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 TickPin/1.0 (contact: radudon1991@gmail.com)',
        Accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!upstream.ok) {
      res.status(200).json({ ok: false, error: `source responded ${upstream.status}` })
      return
    }
    const html = (await upstream.text()).slice(0, MAX_HTML)
    const excerpt = extractExcerpt(html)
    if (excerpt.length < MIN_EXCERPT) {
      res.status(200).json({ ok: false, error: 'no readable excerpt' })
      return
    }
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    res.status(200).json({
      ok: true,
      title: pickTitle(html),
      excerpt,
      host: target.hostname.replace(/^www\./, ''),
    })
  } catch {
    res.status(200).json({ ok: false, error: 'article fetch failed' })
  }
}
