// Vercel serverless relay for Yahoo Finance news.
// Yahoo's v1 search API is fetched server-side so the site gets
// same-origin JSON with a declared User-Agent, mirroring the price
// relay in api/prices.js. Returns the latest stories for a ticker in
// the shape { stories: [{ title, publisher, url, publishedAt,
// thumbnail }] }, newest first, where publishedAt is a unix timestamp
// in SECONDS and thumbnail is the best-resolution image URL or null.

function pickThumbnail(thumbnail) {
  const resolutions = thumbnail?.resolutions
  if (!Array.isArray(resolutions) || resolutions.length === 0) return null
  let best = null
  let bestArea = -1
  for (const r of resolutions) {
    if (!r?.url) continue
    const area = (Number(r.width) || 0) * (Number(r.height) || 0)
    if (area > bestArea) {
      bestArea = area
      best = r.url
    }
  }
  return best
}

function shapeStories(data) {
  const items = Array.isArray(data?.news) ? data.news : []
  const stories = []
  for (const item of items) {
    const title = item?.title
    const url = item?.link
    if (!title || !url) continue
    stories.push({
      title,
      publisher: item.publisher || '',
      url,
      publishedAt: Number(item.providerPublishTime) || 0,
      thumbnail: pickThumbnail(item.thumbnail),
    })
  }
  stories.sort((a, b) => b.publishedAt - a.publishedAt)
  return stories
}

export default async function handler(req, res) {
  const tickerRaw = (req.query?.ticker || '').toString()
  if (!/^[A-Za-z.\-]{1,12}$/.test(tickerRaw)) {
    res.status(400).json({ error: 'ticker query parameter required' })
    return
  }
  const ticker = tickerRaw.toUpperCase()
  try {
    const upstream = await fetch(
      `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(ticker)}&quotesCount=0&newsCount=10`,
      {
        headers: {
          'User-Agent': 'TickPin research contact: radudon1991@gmail.com',
          Accept: 'application/json',
        },
      },
    )
    if (!upstream.ok) {
      res.status(502).json({ error: `Yahoo responded ${upstream.status}` })
      return
    }
    const data = await upstream.json()
    // Headlines move fast but not second-by-second; let the Vercel
    // edge cache carry repeat views for fifteen minutes.
    res.setHeader('Cache-Control', 's-maxage=900, stale-while-revalidate=86400')
    res.status(200).json({ stories: shapeStories(data) })
  } catch (err) {
    res.status(502).json({ error: 'Yahoo news fetch failed' })
  }
}
