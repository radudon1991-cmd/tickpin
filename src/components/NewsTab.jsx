import { useEffect, useState } from 'react'
import { fetchNews, timeAgo } from '../lib/news'

// Per-ticker News tab, styled after the Apple Stocks app: a stack of
// story cards with a thumbnail, publisher + relative time, and the
// headline. Stories come from our /api/news relay (Yahoo Finance).

export default function NewsTab({ ticker }) {
  const [stories, setStories] = useState(null)
  const [state, setState] = useState('loading') // loading|ok|error

  useEffect(() => {
    if (!ticker) return
    let live = true
    setStories(null)
    setState('loading')
    fetchNews(ticker)
      .then((rows) => {
        if (live) {
          setStories(rows)
          setState('ok')
        }
      })
      .catch(() => {
        if (live) setState('error')
      })
    return () => {
      live = false
    }
  }, [ticker])

  if (state === 'loading') return <p>Loading news for {ticker}…</p>
  if (state === 'error') {
    return (
      <p className="error">
        News for {ticker} could not be loaded just now. Please try again later.
      </p>
    )
  }
  if (!stories || stories.length === 0) {
    return (
      <>
        <p>No recent news found for {ticker}.</p>
        <p className="source-note">News via Yahoo Finance.</p>
      </>
    )
  }

  return (
    <>
      <div className="news-list">
        {stories.map((s, i) => (
          <a
            key={`${s.url}-${i}`}
            className="news-card"
            href={s.url}
            target="_blank"
            rel="noreferrer"
          >
            <div className="news-card-body">
              <div className="news-meta">
                <span className="news-publisher">{s.publisher}</span>
                {s.publishedAt > 0 && <span className="news-time">{timeAgo(s.publishedAt)}</span>}
              </div>
              <div className="news-title">{s.title}</div>
            </div>
            {s.thumbnail && (
              <img className="news-thumb" src={s.thumbnail} alt="" loading="lazy" />
            )}
          </a>
        ))}
      </div>
      <p className="source-note">News via Yahoo Finance.</p>
    </>
  )
}
