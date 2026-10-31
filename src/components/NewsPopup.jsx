import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase, authConfigured } from '../lib/supabase'
import { fetchNews, timeAgo } from '../lib/news'
import { useLang } from '../lib/i18n'

// Watchlist news pop-up bar (Boss, 2026-10-30): while a member is on
// the site, poll for stories about their watchlist stocks and pop a
// small bar at the bottom when a NEW story lands. Nothing is emailed
// or pushed — it only appears while they are here. "New" is measured
// against a per-user baseline kept on this device: the first check
// silently records the newest story time, and only stories published
// after that moment pop up.

const POLL_MS = 5 * 60 * 1000

export default function NewsPopup({ onOpenStory }) {
  const { user } = useAuth()
  const { t } = useLang()
  const [queue, setQueue] = useState([]) // unseen stories, oldest first
  const tickersRef = useRef([])
  const baselineRef = useRef(0)
  const offRef = useRef(false)

  useEffect(() => {
    if (!user || !authConfigured) {
      tickersRef.current = []
      setQueue([])
      return
    }
    let live = true
    offRef.current = localStorage.getItem(`tickpin-news-off:${user.id}`) === '1'
    baselineRef.current = Number(
      localStorage.getItem(`tickpin-news-baseline:${user.id}`) || 0,
    )

    supabase
      .from('watchlist')
      .select('ticker, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!live) return
        tickersRef.current = (data || []).map((r) => r.ticker)
      })

    async function check(first) {
      const tickers = tickersRef.current.slice(0, 6)
      if (tickers.length === 0 || offRef.current) return
      const perTicker = await Promise.all(
        tickers.map((tk) =>
          fetchNews(tk)
            .then((rows) => rows.map((s) => ({ ...s, ticker: tk })))
            .catch(() => []),
        ),
      )
      if (!live) return
      const seen = new Set()
      const stories = []
      for (const s of perTicker.flat()) {
        if (!s.url || seen.has(s.url)) continue
        seen.add(s.url)
        stories.push(s)
      }
      stories.sort((a, b) => a.publishedAt - b.publishedAt)
      if (stories.length === 0) return
      const newest = stories[stories.length - 1].publishedAt
      if (first || baselineRef.current === 0) {
        // First ever check: record the baseline, pop nothing.
        baselineRef.current = Math.max(baselineRef.current, newest)
        localStorage.setItem(
          `tickpin-news-baseline:${user.id}`,
          String(baselineRef.current),
        )
        return
      }
      const fresh = stories.filter((s) => s.publishedAt > baselineRef.current)
      if (fresh.length > 0) {
        setQueue((q) => {
          const urls = new Set(q.map((x) => x.url))
          return [...q, ...fresh.filter((s) => !urls.has(s.url))]
        })
      }
    }

    // Give the watchlist fetch a moment to land before the first check.
    const firstTimer = setTimeout(() => check(true), 2500)
    const interval = setInterval(() => check(false), POLL_MS)
    function onVisible() {
      if (document.visibilityState === 'visible') check(false)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      live = false
      clearTimeout(firstTimer)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [user])

  if (!user || queue.length === 0) return null
  const story = queue[queue.length - 1]
  const more = queue.length - 1

  function markSeen(upto) {
    if (!user) return
    baselineRef.current = Math.max(baselineRef.current, upto)
    localStorage.setItem(
      `tickpin-news-baseline:${user.id}`,
      String(baselineRef.current),
    )
  }

  function dismiss() {
    markSeen(story.publishedAt)
    setQueue((q) => q.filter((s) => s.url !== story.url))
  }

  function open() {
    markSeen(story.publishedAt)
    setQueue((q) => q.filter((s) => s.url !== story.url))
    if (onOpenStory) onOpenStory(story)
  }

  function turnOff() {
    if (user) localStorage.setItem(`tickpin-news-off:${user.id}`, '1')
    offRef.current = true
    setQueue([])
  }

  return (
    <div className="news-popup" role="status">
      <button className="news-popup-main" onClick={open}>
        <span className="news-popup-tag">
          📰 {t('popup.newNews')} · {story.ticker}
        </span>
        <span className="news-popup-title">{story.title}</span>
        <span className="news-popup-meta">
          {story.publisher}
          {story.publishedAt > 0 ? ` · ${timeAgo(story.publishedAt)}` : ''}
          {more > 0 ? ` · ${t('popup.more', { n: more })}` : ''}
        </span>
      </button>
      <span className="news-popup-actions">
        <button className="news-popup-off" onClick={turnOff}>
          {t('popup.turnOff')}
        </button>
        <button
          className="news-popup-close"
          onClick={dismiss}
          aria-label={t('popup.dismiss')}
        >
          ✕
        </button>
      </span>
    </div>
  )
}
