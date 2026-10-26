import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase, authConfigured } from '../lib/supabase'
import { fetchPrices } from '../lib/prices'
import { fetchNews, timeAgo } from '../lib/news'
import { useLang } from '../lib/i18n'
import TvWidget from './TvWidget'

// Member dashboard: the user's own customizable watchlist as price
// cards with sparklines, plus a merged news feed for those stocks.
// Watchlist rows live in the Supabase `watchlist` table (user_id,
// ticker, created_at) and are guarded by RLS — a user only ever sees
// and edits their own list.

function Sparkline({ closes }) {
  if (!Array.isArray(closes) || closes.length < 2) return null
  const w = 96
  const h = 28
  const min = Math.min(...closes)
  const max = Math.max(...closes)
  const span = max - min || 1
  const stepX = w / (closes.length - 1)
  const points = closes
    .map((c, i) => `${(i * stepX).toFixed(1)},${(h - 2 - ((c - min) / span) * (h - 4)).toFixed(1)}`)
    .join(' ')
  const up = closes[closes.length - 1] >= closes[0]
  return (
    <svg
      className="dash-spark"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <polyline
        points={points}
        fill="none"
        stroke={up ? 'var(--green)' : 'var(--red)'}
        strokeWidth="1.5"
      />
    </svg>
  )
}

function fmtPrice(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Dashboard({ tickers, onSelect, onLogin }) {
  const { user, loading } = useAuth()
  const { t } = useLang()
  const [myTickers, setMyTickers] = useState([])
  const [listState, setListState] = useState('loading') // loading|ok
  const [cardData, setCardData] = useState({}) // ticker -> { lastClose, changePct, closes } | { failed: true }
  const [news, setNews] = useState(null) // merged stories | null while loading
  const [addQuery, setAddQuery] = useState('')
  const [addFocused, setAddFocused] = useState(false)

  // Load the member's saved watchlist.
  useEffect(() => {
    if (!user || !authConfigured) {
      setMyTickers([])
      setListState('ok')
      return
    }
    let live = true
    setListState('loading')
    supabase
      .from('watchlist')
      .select('ticker')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (!live) return
        setMyTickers((data || []).map((r) => r.ticker))
        setListState('ok')
      })
    return () => {
      live = false
    }
  }, [user])

  // Price card data: last close, day change %, last-30 closes.
  // A ticker that fails to load is tolerated — its card shows "—".
  useEffect(() => {
    if (myTickers.length === 0) {
      setCardData({})
      return
    }
    let live = true
    for (const tk of myTickers) {
      fetchPrices(tk)
        .then((data) => {
          if (!live) return
          const daily = Array.isArray(data?.daily) ? data.daily : []
          const closes = daily.map((c) => c.c).filter((v) => Number.isFinite(v))
          const last = closes[closes.length - 1]
          const prev = closes[closes.length - 2]
          setCardData((prevMap) => ({
            ...prevMap,
            [tk]: {
              lastClose: last ?? null,
              changePct:
                last != null && prev != null && prev !== 0
                  ? ((last - prev) / prev) * 100
                  : null,
              closes: closes.slice(-30),
            },
          }))
        })
        .catch(() => {
          if (!live) return
          setCardData((prevMap) => ({ ...prevMap, [tk]: { failed: true } }))
        })
    }
    return () => {
      live = false
    }
  }, [myTickers])

  // Merged news for up to the first 6 watchlist tickers.
  useEffect(() => {
    if (myTickers.length === 0) {
      setNews([])
      return
    }
    let live = true
    setNews(null)
    const first = myTickers.slice(0, 6)
    Promise.all(
      first.map((tk) =>
        fetchNews(tk)
          .then((rows) => rows.map((s) => ({ ...s, ticker: tk })))
          .catch(() => []),
      ),
    ).then((perTicker) => {
      if (!live) return
      const seen = new Set()
      const merged = []
      for (const s of perTicker.flat()) {
        if (seen.has(s.url)) continue
        seen.add(s.url)
        merged.push(s)
      }
      merged.sort((a, b) => b.publishedAt - a.publishedAt)
      setNews(merged.slice(0, 12))
    })
    return () => {
      live = false
    }
  }, [myTickers])

  const addSuggestions = useMemo(() => {
    const q = addQuery.trim().toUpperCase()
    if (!q || !Array.isArray(tickers) || tickers.length === 0) return []
    const starts = []
    const contains = []
    for (const tk of tickers) {
      if (tk.ticker.startsWith(q)) starts.push(tk)
      else if (tk.name.toUpperCase().includes(q)) contains.push(tk)
      if (starts.length >= 8) break
    }
    return [...starts, ...contains].slice(0, 8)
  }, [addQuery, tickers])

  async function addTicker(entry) {
    if (!entry || !user) return
    const tk = entry.ticker
    if (myTickers.includes(tk)) return
    setMyTickers([...myTickers, tk])
    setAddQuery('')
    await supabase.from('watchlist').insert({ user_id: user.id, ticker: tk })
  }

  async function removeTicker(tk) {
    if (!user) return
    setMyTickers(myTickers.filter((x) => x !== tk))
    await supabase.from('watchlist').delete().eq('user_id', user.id).eq('ticker', tk)
  }

  if (loading) return <p>{t('dash.loadingDashboard')}</p>

  if (!user) {
    return (
      <section className="dash">
        <h2>{t('dash.title')}</h2>
        <div className="fact-card dash-login-card">
          <p className="dash-login-title">{t('dash.loginTitle')}</p>
          <p className="dash-login-note">{t('dash.loginNote')}</p>
          {onLogin && (
            <button className="primary-btn" onClick={onLogin}>
              {t('dash.login')}
            </button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="dash">
      <h2>{t('dash.title')}</h2>

      <h3 className="dash-h3">{t('dash.myWatchlist')}</h3>
      {listState === 'loading' && <p>{t('dash.loadingWatchlist')}</p>}
      {listState === 'ok' && myTickers.length === 0 && (
        <p className="dash-empty">{t('dash.emptyWatchlist')}</p>
      )}
      {myTickers.length > 0 && (
        <div className="dash-grid">
          {myTickers.map((tk) => {
            const entry = (tickers || []).find((x) => x.ticker === tk)
            const d = cardData[tk]
            const change = d && !d.failed ? d.changePct : null
            return (
              <div
                key={tk}
                className="dash-card"
                onClick={() => entry && onSelect && onSelect(entry)}
                role={entry && onSelect ? 'button' : undefined}
                title={entry ? t('dash.openTitle', { ticker: tk }) : tk}
              >
                <div className="dash-card-top">
                  <span className="dash-card-ticker">{tk}</span>
                  <button
                    className="dash-remove"
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTicker(tk)
                    }}
                    aria-label={t('dash.removeAria', { ticker: tk })}
                  >
                    {t('dash.remove')}
                  </button>
                </div>
                <div className="dash-card-name">{entry ? entry.name : ''}</div>
                <div
                  className="dash-tv-wrap"
                  onClick={(e) => e.stopPropagation()}
                >
                  <TvWidget type="mini" symbol={tk} />
                </div>
                <div className="dash-card-daily">
                  {t('dash.dailyClose')}: {d == null ? '…' : fmtPrice(d.lastClose)}
                  {change != null && (
                    <span className={change >= 0 ? 'buy' : 'sell'}>
                      {' '}
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}%
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="dash-add">
        <label className="dash-add-label" htmlFor="dash-add-input">
          {t('dash.addStock')}
        </label>
        <div className="search-box dash-add-box">
          <input
            id="dash-add-input"
            value={addQuery}
            onChange={(e) => setAddQuery(e.target.value)}
            onFocus={() => setAddFocused(true)}
            onBlur={() => setAddFocused(false)}
            placeholder={t('dash.addPlaceholder')}
            aria-label={t('dash.addAria')}
          />
          {addFocused && addSuggestions.length > 0 && (
            <ul className="suggestions">
              {addSuggestions.map((s) => {
                const already = myTickers.includes(s.ticker)
                return (
                  <li
                    key={s.ticker}
                    className={already ? 'dash-suggestion-added' : ''}
                    onMouseDown={() => !already && addTicker(s)}
                  >
                    <strong>{s.ticker}</strong> <span>{s.name}</span>
                    {already && <span className="dash-added-note">{t('dash.alreadyAdded')}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </div>

      <h3 className="dash-h3">{t('dash.newsTitle')}</h3>
      {myTickers.length === 0 && <p className="dash-empty">{t('dash.newsEmptyList')}</p>}
      {myTickers.length > 0 && news === null && <p>{t('dash.loadingNews')}</p>}
      {news && news.length === 0 && <p>{t('dash.noNews')}</p>}
      {news && news.length > 0 && (
        <>
          <div className="dash-news">
            {news.map((s, i) => (
              <a
                key={`${s.url}-${i}`}
                className="dash-news-row"
                href={s.url}
                target="_blank"
                rel="noreferrer"
              >
                <span className="dash-news-meta">
                  <strong>{s.ticker}</strong> · {s.publisher}
                  {s.publishedAt > 0 ? ` · ${timeAgo(s.publishedAt)}` : ''}
                </span>
                <span className="dash-news-title">{s.title}</span>
              </a>
            ))}
          </div>
          <p className="source-note">{t('dash.newsVia')}</p>
        </>
      )}
    </section>
  )
}
