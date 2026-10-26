import { useEffect, useState } from 'react'
import { fetchNews, timeAgo } from '../lib/news'
import { useLang } from '../lib/i18n'

// Per-ticker News tab, styled after the Apple Stocks app: a stack of
// story cards with a thumbnail, publisher + relative time, and the
// headline. Stories come from our /api/news relay (Yahoo Finance).

export default function NewsTab({ ticker }) {
  const { t } = useLang()
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

  if (state === 'loading') return <p>{t('news.loading', { ticker })}</p>
  if (state === 'error') {
    return <p className="error">{t('news.error', { ticker })}</p>
  }
  if (!stories || stories.length === 0) {
    return (
      <>
        <p>{t('news.none', { ticker })}</p>
        <p className="source-note">{t('news.via')}</p>
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
      <p className="source-note">{t('news.via')}</p>
    </>
  )
}
