import { useEffect, useMemo, useRef, useState } from 'react'
import {
  loadTickers,
  loadOwnership,
  fetchCompanyFacts,
  extractSnapshot,
  fmtUSD,
  fmtNum,
} from './lib/edgar'
import {
  sampleInsiderTrades,
  sampleOwnership,
  sampleShortInterest,
  dataSources,
} from './lib/sampleData'
import insiderData from './data/insider.json'
import shortInterestData from './data/shortInterest.json'
import { useAuth, AuthProvider } from './lib/AuthContext'
import { supabase, authConfigured } from './lib/supabase'
import AuthModal from './components/AuthModal'
import AdminPanel from './components/AdminPanel'
import { fetchPrices } from './lib/prices'
import { analyzeSMC } from './lib/smc'
import SmcChart from './components/SmcChart'

const STARTER_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'ZENA']
const TABS = [
  'Overview',
  'Insider Trades',
  'Institutional Ownership',
  'Short Interest',
  'SMC Analysis',
]
const DISPLAY_BARS = 250

function trendLabel(trend) {
  if (trend === 'up') return 'Uptrend'
  if (trend === 'down') return 'Downtrend'
  return 'No clear trend'
}

function fmtTpRate(tpRate) {
  if (tpRate == null) return '—'
  const pct = tpRate <= 1 ? tpRate * 100 : tpRate
  return `${pct.toFixed(1)}%`
}

function FactCard({ label, fact, money }) {
  return (
    <div className="fact-card">
      <div className="fact-label">{label}</div>
      <div className="fact-value">
        {fact ? (money ? fmtUSD(fact.val) : fmtNum(fact.val)) : '—'}
      </div>
      <div className="fact-meta">
        {fact ? `period ending ${fact.end} · filed ${fact.filed?.slice(0, 10)}` : 'not reported'}
      </div>
    </div>
  )
}

function StatCard({ label, value, meta }) {
  return (
    <div className="fact-card">
      <div className="fact-label">{label}</div>
      <div className="fact-value">{value}</div>
      <div className="fact-meta">{meta}</div>
    </div>
  )
}

function SampleBadge() {
  return <span className="sample-badge">SAMPLE — ingest pending</span>
}

function SourceNote({ entry }) {
  return (
    <p className="source-note">
      <strong>Source:</strong> {entry.source}
      <br />
      <strong>Cadence:</strong> {entry.cadence}
    </p>
  )
}

function AppInner() {
  const { user, profile, isAdmin, signOut } = useAuth()
  const [authOpen, setAuthOpen] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [myWatchlist, setMyWatchlist] = useState([])
  const [tickers, setTickers] = useState([])
  const [tickersError, setTickersError] = useState('')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [company, setCompany] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [facts, setFacts] = useState(null)
  const [factsState, setFactsState] = useState('idle') // idle|loading|ok|error
  const [prices, setPrices] = useState(null)
  const [pricesState, setPricesState] = useState('idle') // idle|loading|ok|error
  const [ownership, setOwnership] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => {
    loadTickers()
      .then(setTickers)
      .catch((e) => setTickersError(e.message))
  }, [])

  useEffect(() => {
    if (!company) return
    let live = true
    loadOwnership(company.ticker)
      .then((rows) => {
        if (live) setOwnership((o) => ({ ...(o || {}), [company.ticker]: rows }))
      })
      .catch(() => {
        if (live) setOwnership((o) => ({ ...(o || {}), [company.ticker]: null }))
      })
    return () => {
      live = false
    }
  }, [company])

  useEffect(() => {
    if (!company) return
    let live = true
    setPrices(null)
    setPricesState('loading')
    fetchPrices(company.ticker)
      .then((data) => {
        if (live) {
          setPrices(data)
          setPricesState('ok')
        }
      })
      .catch(() => {
        if (live) setPricesState('error')
      })
    return () => {
      live = false
    }
  }, [company])

  useEffect(() => {
    if (!user || !authConfigured) {
      setMyWatchlist([])
      return
    }
    supabase
      .from('watchlist')
      .select('ticker')
      .order('created_at', { ascending: true })
      .then(({ data }) => setMyWatchlist((data || []).map((r) => r.ticker)))
  }, [user])

  async function toggleWatch(ticker) {
    if (!user) {
      setAuthOpen(true)
      return
    }
    if (myWatchlist.includes(ticker)) {
      setMyWatchlist(myWatchlist.filter((t) => t !== ticker))
      await supabase.from('watchlist').delete().eq('user_id', user.id).eq('ticker', ticker)
    } else {
      setMyWatchlist([...myWatchlist, ticker])
      await supabase.from('watchlist').insert({ user_id: user.id, ticker })
    }
  }

  const suggestions = useMemo(() => {
    const q = query.trim().toUpperCase()
    if (!q || tickers.length === 0) return []
    const starts = []
    const contains = []
    for (const t of tickers) {
      if (t.ticker.startsWith(q)) starts.push(t)
      else if (t.name.toUpperCase().includes(q)) contains.push(t)
      if (starts.length >= 8) break
    }
    return [...starts, ...contains].slice(0, 8)
  }, [query, tickers])

  function selectCompany(entry) {
    setCompany(entry)
    setQuery(entry.ticker)
    setTab('Overview')
    setFacts(null)
    setFactsState('loading')
    fetchCompanyFacts(entry.cik)
      .then((f) => {
        setFacts(f)
        setFactsState('ok')
      })
      .catch(() => setFactsState('error'))
    searchRef.current?.blur()
  }

  const snapshot = useMemo(() => extractSnapshot(facts), [facts])

  const smcDaily = useMemo(() => (prices ? analyzeSMC(prices.daily) : null), [prices])
  const weeklyTrend = useMemo(
    () => (prices ? analyzeSMC(prices.weekly).trend : null),
    [prices],
  )
  const visibleCandles = useMemo(
    () => (prices ? prices.daily.slice(-DISPLAY_BARS) : []),
    [prices],
  )
  const startIndex = prices ? prices.daily.length - visibleCandles.length : 0

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> TickPin
          <span className="brand-sub">market data from primary sources</span>
        </div>
        <div className="topbar-auth">
          {user ? (
            <>
              <span className="topbar-user">{profile?.display_name || user.email}</span>
              {isAdmin && (
                <button onClick={() => setShowAdmin(!showAdmin)}>
                  {showAdmin ? 'Back to site' : 'Admin'}
                </button>
              )}
              <button
                onClick={async () => {
                  await signOut()
                  setShowAdmin(false)
                }}
              >
                Log out
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setAuthOpen(true)}>Log in</button>
              <button className="primary-btn small" onClick={() => setAuthOpen(true)}>
                Sign up
              </button>
            </>
          )}
        </div>
      </header>
      {authOpen && <AuthModal onClose={() => setAuthOpen(false)} />}

      {showAdmin && isAdmin ? (
        <AdminPanel />
      ) : (
        <>
      <section className="search-zone">
        <h1>Every number, straight from the filing.</h1>
        <p className="lede">
          Institutional ownership, insider trades, short interest and financials — rebuilt from SEC
          EDGAR and FINRA primary data. No scraping, no copied scores.
        </p>
        <div className="search-box">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              tickers.length ? 'Search by ticker or company name… (e.g. AAPL)' : 'Loading SEC ticker list…'
            }
            aria-label="Search tickers"
          />
          {focused && suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((s) => (
                <li key={s.ticker} onMouseDown={() => selectCompany(s)}>
                  <strong>{s.ticker}</strong> <span>{s.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {tickersError && <p className="error">Ticker list failed to load: {tickersError}</p>}
        {user && myWatchlist.length > 0 && (
          <div className="watchlist">
            <span>Your watchlist:</span>
            {myWatchlist.map((t) => {
              const entry = tickers.find((x) => x.ticker === t)
              return (
                <button key={t} disabled={!entry} onClick={() => entry && selectCompany(entry)}>
                  {t}
                </button>
              )
            })}
          </div>
        )}
        <div className="watchlist">
          <span>Starter watchlist:</span>
          {STARTER_WATCHLIST.map((t) => {
            const entry = tickers.find((x) => x.ticker === t)
            return (
              <button key={t} disabled={!entry} onClick={() => entry && selectCompany(entry)}>
                {t}
              </button>
            )
          })}
        </div>
      </section>

      {company && (
        <main className="company">
          <div className="company-head">
            <h2>
              {company.name} <span className="ticker-chip">{company.ticker}</span>
            </h2>
            <span className="cik">CIK {String(company.cik).padStart(10, '0')} · SEC EDGAR</span>
            <button className="watch-btn" onClick={() => toggleWatch(company.ticker)}>
              {myWatchlist.includes(company.ticker) ? '★ Watching' : '☆ Watch'}
            </button>
          </div>

          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
                {t}
              </button>
            ))}
          </nav>

          {tab === 'Overview' && (
            <section>
              {factsState === 'loading' && <p>Loading live financials from SEC EDGAR…</p>}
              {factsState === 'error' && (
                <p className="error">
                  Live financials could not be loaded from EDGAR just now. The nightly ingest job
                  will cache these in our database so this page never depends on a live call.
                </p>
              )}
              {factsState === 'ok' && snapshot && (
                <>
                  <div className="fact-grid">
                    <FactCard label="Revenue (latest period)" fact={snapshot.revenue} money />
                    <FactCard label="Net income (latest period)" fact={snapshot.netIncome} money />
                    <FactCard label="Total assets" fact={snapshot.totalAssets} money />
                    <FactCard label="Cash & equivalents" fact={snapshot.cash} money />
                    <FactCard label="Shares outstanding" fact={snapshot.sharesOutstanding} />
                  </div>
                  <p className="source-note">
                    <strong>Source:</strong> SEC EDGAR XBRL companyfacts for {company.name}. Values
                    deduped by period end, keeping the most recently filed figure.
                  </p>
                </>
              )}
            </section>
          )}

          {tab === 'Insider Trades' && (
            <section>
              {(() => {
                const real = insiderData[company.ticker]
                if (real && real.length > 0) {
                  return (
                    <>
                      <table>
                        <thead>
                          <tr><th>Date</th><th>Insider</th><th>Role</th><th>Type</th><th>Shares</th><th>Price</th><th>Value</th></tr>
                        </thead>
                        <tbody>
                          {real.map((r, i) => (
                            <tr key={i}>
                              <td>{r.date}</td><td>{r.insider}</td><td>{r.role}</td>
                              <td className={r.direction === 'A' ? 'buy' : 'sell'}>{r.type}</td>
                              <td>{fmtNum(r.shares)}</td><td>{fmtUSD(r.price)}</td><td>{fmtUSD(r.value)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="source-note">
                        Real trades parsed from this issuer's 12 most recent Form 4 filings on SEC
                        EDGAR (ingest/edgar_form4.py).
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      No Form 4 filings found for {company.ticker} in EDGAR's recent-filing window —
                      foreign private issuers (e.g. 20-F filers) are exempt from Form 4 insider
                      reporting, so there are no insider trades to show.
                    </p>
                  )
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>Date</th><th>Insider</th><th>Role</th><th>Type</th><th>Shares</th><th>Price</th><th>Value</th></tr>
                      </thead>
                      <tbody>
                        {sampleInsiderTrades.map((r, i) => (
                          <tr key={i}>
                            <td>{r.date}</td><td>{r.insider}</td><td>{r.role}</td>
                            <td className={r.type === 'Buy' ? 'buy' : 'sell'}>{r.type}</td>
                            <td>{fmtNum(r.shares)}</td><td>{fmtUSD(r.price)}</td><td>{fmtUSD(r.value)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              })()}
              <SourceNote entry={dataSources.insider} />
            </section>
          )}

          {tab === 'Institutional Ownership' && (
            <section>
              {(() => {
                const real = ownership?.[company.ticker]
                if (real && real.length > 0) {
                  const shown = real.slice(0, 100)
                  const bySize = [...real].sort((a, b) => b.shares - a.shares)
                  const totalShares = real.reduce((s, r) => s + r.shares, 0)
                  const totalValue = real.reduce((s, r) => s + r.value, 0)
                  const pctOutSum = real.reduce((s, r) => s + (r.pctOut || 0), 0)
                  const newPositions = real.filter(
                    (r) => r.shares > 0 && r.change === r.shares,
                  ).length
                  const increased = real.filter((r) => r.change > 0 && r.change < r.shares).length
                  const decreased = real.filter((r) => r.change < 0).length
                  const topShare = (n) =>
                    totalShares > 0
                      ? `${((bySize.slice(0, n).reduce((s, r) => s + r.shares, 0) / totalShares) * 100).toFixed(1)}%`
                      : '—'
                  return (
                    <>
                      <p>
                        {fmtNum(real.length)} institutional holders reported this stock in their
                        latest Form 13F filings.
                      </p>
                      <div className="fact-grid" style={{ marginBottom: 16 }}>
                        <StatCard
                          label="Institutional holders"
                          value={fmtNum(real.length)}
                          meta="filers in the table below"
                        />
                        <StatCard
                          label="Shares reported"
                          value={fmtNum(totalShares)}
                          meta="sum of each filer's latest position"
                        />
                        <StatCard
                          label="Reported value"
                          value={fmtUSD(totalValue)}
                          meta="filers' own as-filed figures"
                        />
                        <StatCard
                          label="% outstanding reported"
                          value={`${pctOutSum.toFixed(2)}%`}
                          meta="sum of per-filer % — periods differ per row"
                        />
                        <StatCard
                          label="Positions increased"
                          value={fmtNum(increased)}
                          meta={`${fmtNum(newPositions)} of them brand-new positions`}
                        />
                        <StatCard
                          label="Positions decreased"
                          value={fmtNum(decreased)}
                          meta="vs the same filer's previous period"
                        />
                        <StatCard
                          label="Top 5 concentration"
                          value={topShare(5)}
                          meta="of reported shares held by the 5 largest holders"
                        />
                        <StatCard
                          label="Top 10 concentration"
                          value={topShare(10)}
                          meta="of reported shares held by the 10 largest holders"
                        />
                      </div>
                      <table>
                        <thead>
                          <tr><th>Holder</th><th>Type</th><th>Shares</th><th>Change</th><th>Reported value</th><th>% outstanding</th><th>Period</th><th>Filed</th></tr>
                        </thead>
                        <tbody>
                          {shown.map((r, i) => (
                            <tr key={i}>
                              <td>{r.holder}</td><td>{r.type}</td><td>{fmtNum(r.shares)}</td>
                              <td className={r.change >= 0 ? 'buy' : 'sell'}>
                                {r.change >= 0 ? '+' : ''}{fmtNum(r.change)}
                              </td>
                              <td>{fmtUSD(r.value)}</td>
                              <td>{r.pctOut == null ? '—' : `${r.pctOut}%`}</td>
                              <td>{r.filed}</td><td>{r.fileDate}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {real.length > shown.length && (
                        <p className="source-note">
                          Showing the {shown.length} largest positions of {fmtNum(real.length)}{' '}
                          reported holders — the complete table is in the data file this page
                          loads (/owners/{company.ticker}.json).
                        </p>
                      )}
                      <p className="source-note">
                        Real holdings parsed from SEC Form 13F filings (SEC bulk Form 13F data
                        sets, plus EDGAR filings for managers on notice status). Each row is that
                        filer's own latest reported period — periods differ per filer and are
                        shown per row. Change is versus the same filer's previous period.
                        Reported value is the filer's own as-filed figure.
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      No Form 13F holders found for {company.ticker} in the latest processed
                      filings.
                    </p>
                  )
                }
                if (ownership === null) {
                  return <p>Loading reported holders…</p>
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>Holder</th><th>Shares</th><th>Change</th><th>% outstanding</th><th>Period</th></tr>
                      </thead>
                      <tbody>
                        {sampleOwnership.map((r, i) => (
                          <tr key={i}>
                            <td>{r.holder}</td><td>{fmtNum(r.shares)}</td>
                            <td className={r.change >= 0 ? 'buy' : 'sell'}>
                              {r.change >= 0 ? '+' : ''}{fmtNum(r.change)}
                            </td>
                            <td>{r.pctOut}%</td><td>{r.filed}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              })()}
              <SourceNote entry={dataSources.ownership} />
            </section>
          )}

          {tab === 'Short Interest' && (
            <section>
              {(() => {
                const real = shortInterestData[company.ticker]
                if (real && real.length > 0) {
                  return (
                    <>
                      <table>
                        <thead>
                          <tr><th>Settlement date</th><th>Short interest</th><th>Avg daily volume</th><th>Days to cover</th></tr>
                        </thead>
                        <tbody>
                          {real.map((r, i) => (
                            <tr key={i}>
                              <td>{r.settlement}</td><td>{fmtNum(r.shortInterest)}</td>
                              <td>{fmtNum(r.avgDailyVolume)}</td><td>{r.daysToCover}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="source-note">
                        Real short interest from FINRA's Consolidated Short Interest file
                        (ingest/finra_short_interest.py), cross-checked against Nasdaq's
                        published short-interest table. Each row is a twice-monthly snapshot
                        as of its settlement date — never a live figure.
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      FINRA reports no short interest rows for {company.ticker} in the latest
                      published settlement periods.
                    </p>
                  )
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>Settlement date</th><th>Short interest</th><th>Avg daily volume</th><th>Days to cover</th></tr>
                      </thead>
                      <tbody>
                        {sampleShortInterest.map((r, i) => (
                          <tr key={i}>
                            <td>{r.settlement}</td><td>{fmtNum(r.shortInterest)}</td>
                            <td>{fmtNum(r.avgDailyVolume)}</td><td>{r.daysToCover}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )
              })()}
              <SourceNote entry={dataSources.short} />
            </section>
          )}

          {tab === 'SMC Analysis' && (
            <section>
              {pricesState === 'loading' && <p>Loading price history…</p>}
              {pricesState === 'error' && (
                <p className="error">
                  Daily price history could not be loaded for {company.ticker} just now, so the
                  SMC analysis cannot be computed. Please try selecting the company again later.
                </p>
              )}
              {pricesState === 'ok' && prices && smcDaily && (
                <>
                  <div className="smc-chart-wrap">
                    <SmcChart
                      candles={visibleCandles}
                      analysis={smcDaily}
                      startIndex={startIndex}
                    />
                  </div>

                  <div className="fact-grid smc-panel">
                    <StatCard
                      label="Daily trend"
                      value={trendLabel(smcDaily.trend)}
                      meta="market structure on daily candles"
                    />
                    <StatCard
                      label="Weekly bias"
                      value={trendLabel(weeklyTrend)}
                      meta="higher-timeframe reference"
                    />
                    <StatCard
                      label="Signals (5y)"
                      value={fmtNum(smcDaily.stats.total)}
                      meta="signals over the full price history"
                    />
                    <StatCard
                      label="TP hit rate"
                      value={fmtTpRate(smcDaily.stats.tpRate)}
                      meta="of closed signals"
                    />
                  </div>

                  <div className="smc-panel">
                    <h3>Entry checklist (latest bar)</h3>
                    <ul className="smc-check">
                      {smcDaily.checklist.map((item) => (
                        <li key={item.key}>
                          <span className={item.ok ? 'smc-status ok' : 'smc-status wait'}>
                            {item.ok ? '✓' : '—'}
                          </span>
                          <span className="smc-check-label">{item.label}</span>
                          <span className="smc-check-detail">{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="smc-cols">
                    <div className="smc-panel">
                      <h3>Active zones</h3>
                      {(() => {
                        const activeZones = smcDaily.zones
                          .filter((z) => !z.mitigated)
                          .slice()
                          .sort((a, b) => b.createdIndex - a.createdIndex)
                          .slice(0, 8)
                        if (activeZones.length === 0) return <p>No active zones.</p>
                        return (
                          <table>
                            <thead>
                              <tr><th>Side</th><th>Range</th><th>Tested</th></tr>
                            </thead>
                            <tbody>
                              {activeZones.map((z, i) => (
                                <tr key={i}>
                                  <td className={z.side === 'demand' ? 'buy' : 'sell'}>
                                    {z.side === 'demand' ? 'Demand' : 'Supply'}
                                  </td>
                                  <td>
                                    {fmtUSD(z.bottom)} – {fmtUSD(z.top)}
                                  </td>
                                  <td>Tested {z.touches}×</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>

                    <div className="smc-panel">
                      <h3>Nearest liquidity</h3>
                      {(() => {
                        const lastClose = prices.daily[prices.daily.length - 1]?.c
                        const bslAbove = smcDaily.liquidity
                          .filter(
                            (l) =>
                              l.side === 'bsl' && !l.swept && lastClose != null && l.level > lastClose,
                          )
                          .sort((a, b) => a.level - b.level)[0]
                        const sslBelow = smcDaily.liquidity
                          .filter(
                            (l) =>
                              l.side === 'ssl' && !l.swept && lastClose != null && l.level < lastClose,
                          )
                          .sort((a, b) => b.level - a.level)[0]
                        return (
                          <table>
                            <tbody>
                              <tr>
                                <td>Buy-side liquidity (above)</td>
                                <td>{bslAbove ? fmtUSD(bslAbove.level) : '—'}</td>
                              </tr>
                              <tr>
                                <td>Last close</td>
                                <td>{lastClose != null ? fmtUSD(lastClose) : '—'}</td>
                              </tr>
                              <tr>
                                <td>Sell-side liquidity (below)</td>
                                <td>{sslBelow ? fmtUSD(sslBelow.level) : '—'}</td>
                              </tr>
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="smc-panel">
                    <h3>Signal history</h3>
                    <p>
                      {fmtNum(smcDaily.stats.total)} signals · {fmtNum(smcDaily.stats.tpHit)} TP ·{' '}
                      {fmtNum(smcDaily.stats.slHit)} SL · {fmtNum(smcDaily.stats.open)} open ·{' '}
                      {fmtNum(smcDaily.stats.expired)} expired
                    </p>
                    {smcDaily.signals.length > 0 ? (
                      <table>
                        <thead>
                          <tr><th>Date</th><th>Side</th><th>Entry</th><th>SL</th><th>TP</th><th>Outcome</th></tr>
                        </thead>
                        <tbody>
                          {smcDaily.signals
                            .slice()
                            .sort((a, b) => b.index - a.index)
                            .slice(0, 20)
                            .map((s, i) => (
                              <tr key={i}>
                                <td>{new Date(s.t * 1000).toISOString().slice(0, 10)}</td>
                                <td className={s.side === 'buy' ? 'buy' : 'sell'}>
                                  {s.side === 'buy' ? 'BUY' : 'SELL'}
                                </td>
                                <td>{fmtUSD(s.entry)}</td>
                                <td>{fmtUSD(s.sl)}</td>
                                <td>{fmtUSD(s.tp)}</td>
                                <td>
                                  {s.outcome === 'tp_hit'
                                    ? 'TP hit'
                                    : s.outcome === 'sl_hit'
                                      ? 'SL hit'
                                      : s.outcome === 'open'
                                        ? 'Open'
                                        : 'Expired'}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    ) : (
                      <p>No signals in the available price history.</p>
                    )}
                  </div>

                  <p className="source-note">
                    <strong>Source:</strong> Prices from Yahoo Finance daily candles via our
                    relay; SMC analysis computed in-browser from those candles; weekly candles
                    provide the higher-timeframe bias. Analysis of public price data — not
                    investment advice.
                  </p>
                </>
              )}
            </section>
          )}
        </main>
      )}
        </>
      )}

      <footer className="footer">
        Data: SEC EDGAR &amp; FINRA public files. Not investment advice. Short interest figures are
        snapshots as of their settlement dates, never live values.
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  )
}
