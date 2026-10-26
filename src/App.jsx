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

const STARTER_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'ZENA']
const TABS = ['Overview', 'Insider Trades', 'Institutional Ownership', 'Short Interest']

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

export default function App() {
  const [tickers, setTickers] = useState([])
  const [tickersError, setTickersError] = useState('')
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [company, setCompany] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [facts, setFacts] = useState(null)
  const [factsState, setFactsState] = useState('idle') // idle|loading|ok|error
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

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> TickPin
          <span className="brand-sub">market data from primary sources</span>
        </div>
        <div className="topbar-note">Name chosen 2026-10-21</div>
      </header>

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
                  return (
                    <>
                      <p>
                        {fmtNum(real.length)} institutional holders reported this stock in their
                        latest Form 13F filings.
                      </p>
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
        </main>
      )}

      <footer className="footer">
        Data: SEC EDGAR &amp; FINRA public files. Not investment advice. Short interest figures are
        snapshots as of their settlement dates, never live values.
      </footer>
    </div>
  )
}
