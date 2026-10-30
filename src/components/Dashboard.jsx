import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase, authConfigured } from '../lib/supabase'
import { fetchPrices, fetchIntraday } from '../lib/prices'
import { fetchNews, timeAgo } from '../lib/news'
import { useLang } from '../lib/i18n'
import TvWidget from './TvWidget'
import ArticleReader from './ArticleReader'

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

// Apple-Stocks-style row sparkline: today's intraday line with a
// dashed previous-close reference and a soft area fill, colored by
// the day's direction (last price vs prevClose).
function RowSpark({ points, prevClose }) {
  if (!Array.isArray(points) || points.length < 2 || prevClose == null) return null
  const w = 92
  const h = 38
  const all = [...points, prevClose]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const span = max - min || 1
  const stepX = w / (points.length - 1)
  const y = (v) => h - 3 - ((v - min) / span) * (h - 6)
  const line = points
    .map((c, i) => `${(i * stepX).toFixed(1)},${y(c).toFixed(1)}`)
    .join(' ')
  const area = `0,${h} ${line} ${w},${h}`
  const last = points[points.length - 1]
  const color = last >= prevClose ? 'var(--green)' : 'var(--red)'
  const py = y(prevClose).toFixed(1)
  return (
    <svg
      className="dash-row-spark"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      aria-hidden="true"
    >
      <polygon points={area} fill={color} opacity="0.16" />
      <line
        x1="0"
        y1={py}
        x2={w}
        y2={py}
        stroke="var(--muted)"
        strokeWidth="1"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" />
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
  const [view, setView] = useState(() => {
    try {
      return localStorage.getItem('tickpin-dash-view') === 'list' ? 'list' : 'cards'
    } catch {
      return 'cards'
    }
  }) // watchlist layout: 'cards' | 'list' (per-device choice)
  const [rowData, setRowData] = useState({}) // ticker -> { points, prevClose, last, changePct } | { failed: true }
  const [news, setNews] = useState(null) // merged stories | null while loading
  const [openStory, setOpenStory] = useState(null) // story open in the reader
  const [organizing, setOrganizing] = useState(false) // watchlist organize mode
  const [dragIdx, setDragIdx] = useState(null) // card index being dragged
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
      .select('ticker, position')
      .eq('user_id', user.id)
      .order('position', { ascending: true, nullsFirst: false })
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

  // List-view row data: today's intraday closes (downsampled for the
  // sparkline), the previous close, and the day change vs it. Fetched
  // lazily — only while the list view is showing.
  useEffect(() => {
    if (view !== 'list' || myTickers.length === 0) return
    let live = true
    for (const tk of myTickers) {
      if (rowData[tk]) continue
      fetchIntraday(tk)
        .then((data) => {
          if (!live) return
          const bars = Array.isArray(data?.intraday) ? data.intraday : []
          let closes = bars.map((b) => b.c).filter((v) => Number.isFinite(v))
          if (closes.length > 120) {
            const step = Math.ceil(closes.length / 120)
            closes = closes.filter((_, i) => i % step === 0)
          }
          const prevClose = Number.isFinite(data?.prevClose) ? data.prevClose : null
          const last = closes.length > 0 ? closes[closes.length - 1] : null
          setRowData((m) => ({
            ...m,
            [tk]: {
              points: closes,
              prevClose,
              last,
              changePct:
                last != null && prevClose
                  ? ((last - prevClose) / prevClose) * 100
                  : null,
            },
          }))
        })
        .catch(() => {
          if (!live) return
          setRowData((m) => ({ ...m, [tk]: { failed: true } }))
        })
    }
    return () => {
      live = false
    }
    // rowData is read as a fetch guard only; refetching is driven by
    // the view and the watchlist contents, not by rowData itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, myTickers])

  function chooseView(v) {
    setView(v)
    try {
      localStorage.setItem('tickpin-dash-view', v)
    } catch {
      /* private mode — the choice just won't persist */
    }
  }

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
    await supabase
      .from('watchlist')
      .insert({ user_id: user.id, ticker: tk, position: myTickers.length })
  }

  async function removeTicker(tk) {
    if (!user) return
    setMyTickers(myTickers.filter((x) => x !== tk))
    await supabase.from('watchlist').delete().eq('user_id', user.id).eq('ticker', tk)
  }

  // Persist a full ordering: position = index in the list.
  async function persistOrder(list) {
    if (!user) return
    await Promise.all(
      list.map((tk, i) =>
        supabase
          .from('watchlist')
          .update({ position: i })
          .eq('user_id', user.id)
          .eq('ticker', tk),
      ),
    )
  }

  function applyOrder(list) {
    setMyTickers(list)
    persistOrder(list)
  }

  function moveTicker(idx, delta) {
    const j = idx + delta
    if (j < 0 || j >= myTickers.length) return
    const list = [...myTickers]
    const [item] = list.splice(idx, 1)
    list.splice(j, 0, item)
    applyOrder(list)
  }

  function sortAZ() {
    applyOrder([...myTickers].sort((a, b) => a.localeCompare(b)))
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
      {listState === 'ok' && myTickers.length > 0 && (
        <div className="dash-tools">
          {myTickers.length > 1 &&
            (organizing ? (
              <div className="dash-org-bar">
                <button className="dash-org-btn" onClick={sortAZ}>
                  {t('dash.sortAZ')}
                </button>
                <button
                  className="dash-org-btn primary"
                  onClick={() => setOrganizing(false)}
                >
                  {t('dash.organizeDone')}
                </button>
                <span className="dash-org-hint">
                  {t(view === 'list' ? 'dash.organizeHintList' : 'dash.organizeHint')}
                </span>
              </div>
            ) : (
              <div className="dash-org-bar">
                <button className="dash-org-btn" onClick={() => setOrganizing(true)}>
                  {t('dash.organize')}
                </button>
              </div>
            ))}
          <div className="dash-view-toggle" role="group" aria-label={t('dash.viewLabel')}>
            <button
              className={view === 'cards' ? 'active' : ''}
              aria-pressed={view === 'cards'}
              onClick={() => chooseView('cards')}
            >
              ▦ {t('dash.viewCards')}
            </button>
            <button
              className={view === 'list' ? 'active' : ''}
              aria-pressed={view === 'list'}
              onClick={() => chooseView('list')}
            >
              ☰ {t('dash.viewList')}
            </button>
          </div>
        </div>
      )}
      {listState === 'loading' && <p>{t('dash.loadingWatchlist')}</p>}
      {listState === 'ok' && myTickers.length === 0 && (
        <p className="dash-empty">{t('dash.emptyWatchlist')}</p>
      )}
      {view === 'cards' && myTickers.length > 0 && (
        <div className="dash-grid">
          {myTickers.map((tk, idx) => {
            const entry = (tickers || []).find((x) => x.ticker === tk)
            const d = cardData[tk]
            const change = d && !d.failed ? d.changePct : null
            return (
              <div
                key={tk}
                className={`dash-card${organizing ? ' organizing' : ''}${dragIdx === idx ? ' dragging' : ''}`}
                draggable={organizing}
                onDragStart={organizing ? () => setDragIdx(idx) : undefined}
                onDragOver={
                  organizing
                    ? (e) => {
                        e.preventDefault()
                        if (dragIdx == null || dragIdx === idx) return
                        const list = [...myTickers]
                        const [item] = list.splice(dragIdx, 1)
                        list.splice(idx, 0, item)
                        setMyTickers(list)
                        setDragIdx(idx)
                      }
                    : undefined
                }
                onDragEnd={
                  organizing
                    ? () => {
                        setDragIdx(null)
                        persistOrder(myTickers)
                      }
                    : undefined
                }
                onClick={organizing ? undefined : () => entry && onSelect && onSelect(entry)}
                role={!organizing && entry && onSelect ? 'button' : undefined}
                title={organizing ? undefined : entry ? t('dash.openTitle', { ticker: tk }) : tk}
              >
                <div className="dash-card-top">
                  <span className="dash-card-ticker">{tk}</span>
                  {organizing && (
                    <span className="dash-move-btns">
                      <button
                        className="dash-move"
                        disabled={idx === 0}
                        onClick={(e) => {
                          e.stopPropagation()
                          moveTicker(idx, -1)
                        }}
                        aria-label={t('dash.moveEarlier', { ticker: tk })}
                      >
                        ◀
                      </button>
                      <button
                        className="dash-move"
                        disabled={idx === myTickers.length - 1}
                        onClick={(e) => {
                          e.stopPropagation()
                          moveTicker(idx, 1)
                        }}
                        aria-label={t('dash.moveLater', { ticker: tk })}
                      >
                        ▶
                      </button>
                    </span>
                  )}
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
                <div className="dash-tv-wrap">
                  <TvWidget type="mini" symbol={tk} />
                  {/* Transparent shield over the TradingView iframe: the
                      widget itself is one big link to tradingview.com and
                      would swallow the card's click. The shield takes the
                      click instead and lets it bubble to the card, which
                      opens the stock's own TickPin page. */}
                  <span className="dash-tv-overlay" aria-hidden="true" />
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

      {view === 'list' && myTickers.length > 0 && (
        <div className="dash-list">
          {myTickers.map((tk, idx) => {
            const entry = (tickers || []).find((x) => x.ticker === tk)
            const r = rowData[tk]
            const d = cardData[tk]
            const last =
              r && !r.failed && r.last != null
                ? r.last
                : d && !d.failed
                  ? d.lastClose
                  : null
            const change =
              r && !r.failed && r.changePct != null
                ? r.changePct
                : d && !d.failed
                  ? d.changePct
                  : null
            return (
              <div
                key={tk}
                className={`dash-row${organizing ? ' organizing' : ''}${dragIdx === idx ? ' dragging' : ''}`}
                draggable={organizing}
                onDragStart={organizing ? () => setDragIdx(idx) : undefined}
                onDragOver={
                  organizing
                    ? (e) => {
                        e.preventDefault()
                        if (dragIdx == null || dragIdx === idx) return
                        const list = [...myTickers]
                        const [item] = list.splice(dragIdx, 1)
                        list.splice(idx, 0, item)
                        setMyTickers(list)
                        setDragIdx(idx)
                      }
                    : undefined
                }
                onDragEnd={
                  organizing
                    ? () => {
                        setDragIdx(null)
                        persistOrder(myTickers)
                      }
                    : undefined
                }
                onClick={organizing ? undefined : () => entry && onSelect && onSelect(entry)}
                role={!organizing && entry && onSelect ? 'button' : undefined}
                title={organizing ? undefined : entry ? t('dash.openTitle', { ticker: tk }) : tk}
              >
                <div className="dash-row-id">
                  <span className="dash-row-ticker">{tk}</span>
                  <span className="dash-row-name">{entry ? entry.name : ''}</span>
                </div>
                <div className="dash-row-mid">
                  {r && !r.failed ? (
                    <RowSpark points={r.points} prevClose={r.prevClose} />
                  ) : (
                    <span className="dash-row-loading">…</span>
                  )}
                </div>
                <div className="dash-row-quote">
                  <span className="dash-row-price">
                    {last == null ? '…' : fmtPrice(last)}
                  </span>
                  {change != null ? (
                    <span className={`dash-pill ${change >= 0 ? 'up' : 'down'}`}>
                      {change >= 0 ? '+' : ''}
                      {change.toFixed(2)}%
                    </span>
                  ) : (
                    <span className="dash-pill flat">—</span>
                  )}
                </div>
                {organizing && (
                  <span className="dash-move-btns">
                    <button
                      className="dash-move"
                      disabled={idx === 0}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveTicker(idx, -1)
                      }}
                      aria-label={t('dash.moveEarlier', { ticker: tk })}
                    >
                      ◀
                    </button>
                    <button
                      className="dash-move"
                      disabled={idx === myTickers.length - 1}
                      onClick={(e) => {
                        e.stopPropagation()
                        moveTicker(idx, 1)
                      }}
                      aria-label={t('dash.moveLater', { ticker: tk })}
                    >
                      ▶
                    </button>
                  </span>
                )}
                {organizing && (
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
                )}
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
              <div
                key={`${s.url}-${i}`}
                className="dash-news-row"
                role="button"
                tabIndex={0}
                onClick={() => setOpenStory(s)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpenStory(s)
                  }
                }}
              >
                <span className="dash-news-meta">
                  <strong>{s.ticker}</strong> · {s.publisher}
                  {s.publishedAt > 0 ? ` · ${timeAgo(s.publishedAt)}` : ''}
                </span>
                <span className="dash-news-title">{s.title}</span>
              </div>
            ))}
          </div>
          <p className="source-note">{t('dash.newsVia')}</p>
          {openStory && (
            <ArticleReader story={openStory} onClose={() => setOpenStory(null)} />
          )}
        </>
      )}
    </section>
  )
}
