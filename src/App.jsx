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
import ProChart from './components/ProChart'
import NewsTab from './components/NewsTab'
import CommentsTab from './components/CommentsTab'
import InfoTab from './components/InfoTab'
import Dashboard from './components/Dashboard'
import SmcSettings from './components/SmcSettings'
import NewsPopup from './components/NewsPopup'
import ArticleReader from './components/ArticleReader'
import {
  loadEffectiveSettings,
  saveWorkingSettings,
  savePerStockSettings,
} from './lib/smcSettings'
import TvWidget from './components/TvWidget'
import DayChart from './components/DayChart'
import { useLang, LangProvider } from './lib/i18n'

const STARTER_WATCHLIST = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'ZENA']
const TABS = [
  'Overview',
  'Info',
  'Insider Trades',
  'Institutional Ownership',
  'Short Interest',
  'Chart',
  'SMC Analysis',
  'News',
  'Comments',
]
const TAB_KEYS = {
  Overview: 'tabs.overview',
  Info: 'tabs.info',
  'Insider Trades': 'tabs.insider',
  'Institutional Ownership': 'tabs.ownership',
  'Short Interest': 'tabs.short',
  Chart: 'tabs.chart',
  'SMC Analysis': 'tabs.smc',
  News: 'tabs.news',
  Comments: 'tabs.comments',
}
const DISPLAY_BARS = 250

function fmtTpRate(tpRate) {
  if (tpRate == null) return '—'
  const pct = tpRate <= 1 ? tpRate * 100 : tpRate
  return `${pct.toFixed(1)}%`
}

function fmtPrice(v) {
  if (v == null || isNaN(v)) return '—'
  return `$${v.toFixed(2)}`
}

function FactCard({ label, fact, money }) {
  const { t } = useLang()
  return (
    <div className="fact-card">
      <div className="fact-label">{label}</div>
      <div className="fact-value">
        {fact ? (money ? fmtUSD(fact.val) : fmtNum(fact.val)) : '—'}
      </div>
      <div className="fact-meta">
        {fact ? t('overview.periodEnding', { end: fact.end, filed: fact.filed?.slice(0, 10) }) : t('overview.notReported')}
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
  const { t } = useLang()
  return <span className="sample-badge">{t('common.sampleBadge')}</span>
}

function SourceNote({ skey }) {
  const { t } = useLang()
  return (
    <p className="source-note">
      <strong>{t('common.source')}</strong> {t(`source.${skey}Text`)}
      <br />
      <strong>{t('common.cadence')}</strong> {t(`source.${skey}Cadence`)}
    </p>
  )
}

function AppInner() {
  const { user, profile, isAdmin, hasSmc, signOut, recovery } = useAuth()
  const { lang, setLang, t } = useLang()
  const trendText = (tr) => t(tr === 'up' ? 'smc.trendUp' : tr === 'down' ? 'smc.trendDown' : 'smc.trendNone')
  const [authOpen, setAuthOpen] = useState(false)
  const [showAdmin, setShowAdmin] = useState(false)
  const [showDashboard, setShowDashboard] = useState(false)
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

  // SMC user settings (per device; optional per-stock override).
  const [smcSettingsState, setSmcSettingsState] = useState(() =>
    loadEffectiveSettings(company?.ticker),
  )
  useEffect(() => {
    setSmcSettingsState(loadEffectiveSettings(company?.ticker))
  }, [company?.ticker])
  const smcSettings = smcSettingsState.settings
  const smcPerStock = smcSettingsState.perStock
  function updateSmcSettings(next) {
    setSmcSettingsState({ settings: next, perStock: smcPerStock })
    if (smcPerStock && company) savePerStockSettings(company.ticker, next)
    else saveWorkingSettings(next)
  }
  function toggleSmcPerStock(on) {
    if (!company) return
    if (on) savePerStockSettings(company.ticker, smcSettings)
    else {
      savePerStockSettings(company.ticker, null)
      saveWorkingSettings(smcSettings)
    }
    setSmcSettingsState({ settings: smcSettings, perStock: on })
  }

  const smcSeries =
    smcSettings.timeframe === 'weekly' ? prices?.weekly : prices?.daily
  const smcDaily = useMemo(
    () => (prices && smcSeries ? analyzeSMC(smcSeries, smcSettings.params) : null),
    [prices, smcSeries, smcSettings.params],
  )
  const weeklyTrend = useMemo(
    () => (prices ? analyzeSMC(prices.weekly).trend : null),
    [prices],
  )
  const dailyTrend = useMemo(
    () => (prices ? analyzeSMC(prices.daily, smcSettings.params).trend : null),
    [prices, smcSettings.params],
  )
  const visibleCandles = useMemo(
    () => (smcSeries ? smcSeries.slice(-DISPLAY_BARS) : []),
    [smcSeries],
  )
  const startIndex = smcSeries ? smcSeries.length - visibleCandles.length : 0

  // Signals after the user's quality/expired filters, and the stats
  // recomputed over the chosen stats window.
  const smcView = useMemo(() => {
    if (!smcDaily) return null
    const filtered = smcDaily.signals.filter(
      (s) =>
        (s.score ?? 6) >= smcSettings.minScore &&
        (smcSettings.display.expired || s.outcome !== 'expired'),
    )
    const windowed =
      smcSettings.statsWindow === 'all'
        ? filtered
        : filtered.slice(-smcSettings.statsWindow)
    const stats = {
      total: windowed.length,
      tpHit: windowed.filter((s) => s.outcome === 'tp_hit').length,
      slHit: windowed.filter((s) => s.outcome === 'sl_hit').length,
      open: windowed.filter((s) => s.outcome === 'open').length,
      expired: windowed.filter((s) => s.outcome === 'expired').length,
      tpRate: null,
    }
    if (stats.tpHit + stats.slHit > 0)
      stats.tpRate = stats.tpHit / (stats.tpHit + stats.slHit)
    return { filtered, stats }
  }, [smcDaily, smcSettings.minScore, smcSettings.display.expired, smcSettings.statsWindow])

  const [popupStory, setPopupStory] = useState(null)

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">◆</span> TickPin
          <span className="brand-sub">{t('nav.tagline')}</span>
        </div>
        <div className="lang-toggle" role="group" aria-label="Language">
          <button className={lang === 'th' ? 'active' : ''} onClick={() => setLang('th')}>ไทย</button>
          <button className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>EN</button>
        </div>
        <div className="topbar-auth">
          {user ? (
            <>
              <span className="topbar-user">{profile?.display_name || user.email}</span>
              <button
                onClick={() => {
                  setShowDashboard(!showDashboard)
                  if (!showDashboard) setShowAdmin(false)
                }}
              >
                {showDashboard ? t('nav.backToSite') : t('nav.dashboard')}
              </button>
              {isAdmin && (
                <button
                  onClick={() => {
                    setShowAdmin(!showAdmin)
                    if (!showAdmin) setShowDashboard(false)
                  }}
                >
                  {showAdmin ? t('nav.backToSite') : t('nav.admin')}
                </button>
              )}
              <button
                onClick={async () => {
                  await signOut()
                  setShowAdmin(false)
                  setShowDashboard(false)
                }}
              >
                {t('nav.logout')}
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setAuthOpen(true)}>{t('nav.login')}</button>
              <button className="primary-btn small" onClick={() => setAuthOpen(true)}>
                {t('nav.signup')}
              </button>
            </>
          )}
        </div>
      </header>
      {(authOpen || recovery) && (
        <AuthModal
          initialMode={recovery ? 'newpassword' : 'login'}
          onClose={() => setAuthOpen(false)}
        />
      )}

      {showAdmin && isAdmin ? (
        <AdminPanel />
      ) : showDashboard ? (
        <Dashboard
          tickers={tickers}
          onSelect={(entry) => {
            setShowDashboard(false)
            selectCompany(entry)
          }}
          onLogin={() => setAuthOpen(true)}
        />
      ) : (
        <>
      <section className="search-zone">
        <h1>{t('nav.heroTitle')}</h1>
        <p className="lede">
          {t('nav.lede')}
        </p>
        <div className="search-box">
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={
              tickers.length ? t('nav.searchPlaceholder') : t('nav.searchLoading')
            }
            aria-label={t('nav.searchAria')}
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
        {tickersError && <p className="error">{t('nav.tickersError', { error: tickersError })}</p>}
        {user && myWatchlist.length > 0 && (
          <div className="watchlist">
            <span>{t('nav.yourWatchlist')}</span>
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
          <span>{t('nav.starterWatchlist')}</span>
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
              {myWatchlist.includes(company.ticker) ? t('nav.watching') : t('nav.watch')}
            </button>
          </div>

          <div className="tv-wrap">
            <h3 className="tv-h3">{t('live.title')}</h3>
            <TvWidget key={company.ticker} type="info" symbol={company.ticker} />
            <p className="tv-cap">{t('live.note')}</p>
          </div>

          <div className="tv-wrap">
            <h3 className="tv-h3">{t('chart.today')}</h3>
            <DayChart key={`day-${company.ticker}`} ticker={company.ticker} />
          </div>

          <nav className="tabs">
            {TABS.map((name) => (
              <button key={name} className={tab === name ? 'active' : ''} onClick={() => setTab(name)}>
                {t(TAB_KEYS[name])}
              </button>
            ))}
          </nav>

          {tab === 'Overview' && (
            <section>
              {factsState === 'loading' && <p>{t('overview.loading')}</p>}
              {factsState === 'error' && (
                <p className="error">
                  {t('overview.error')}
                </p>
              )}
              {factsState === 'ok' && snapshot && (
                <>
                  <div className="fact-grid">
                    <FactCard label={t('overview.revenue')} fact={snapshot.revenue} money />
                    <FactCard label={t('overview.netIncome')} fact={snapshot.netIncome} money />
                    <FactCard label={t('overview.totalAssets')} fact={snapshot.totalAssets} money />
                    <FactCard label={t('overview.cash')} fact={snapshot.cash} money />
                    <FactCard label={t('overview.sharesOutstanding')} fact={snapshot.sharesOutstanding} />
                  </div>
                  <p className="source-note"><strong>{t('common.source')}</strong> {t('overview.sourceNote', { name: company.name })}</p>
                </>
              )}
            </section>
          )}

          {tab === 'Info' && (
            <section>
              <InfoTab
                company={company}
                prices={prices}
                sharesOutstanding={snapshot?.sharesOutstanding?.val ?? null}
              />
            </section>
          )}

          {tab === 'Insider Trades' && (
            <section>
              {(() => {
                const real = insiderData[company.ticker]
                if (real && real.length > 0) {
                  const marketBuys = real.filter((r) => r.code === 'P')
                  const buyShares = marketBuys.reduce((s, r) => s + r.shares, 0)
                  const buyAvg =
                    buyShares > 0
                      ? marketBuys.reduce((s, r) => s + r.shares * r.price, 0) / buyShares
                      : null
                  const buyDates = marketBuys.map((r) => r.date).sort()
                  const byInsider = [
                    ...marketBuys
                      .reduce((m, r) => {
                        const cur = m.get(r.insider) || {
                          insider: r.insider,
                          role: r.role,
                          shares: 0,
                          weighted: 0,
                          buys: 0,
                          latest: r.date,
                        }
                        cur.shares += r.shares
                        cur.weighted += r.shares * r.price
                        cur.buys += 1
                        if (r.date > cur.latest) cur.latest = r.date
                        m.set(r.insider, cur)
                        return m
                      }, new Map())
                      .values(),
                  ].sort((a, b) => b.shares - a.shares)
                  return (
                    <>
                      <h3>{t('insider.heading')}</h3>
                      {marketBuys.length > 0 ? (
                        <>
                          <p>
                            {t('insider.summary', { count: fmtNum(marketBuys.length), shares: fmtNum(buyShares), avg: fmtPrice(buyAvg), from: buyDates[0], to: buyDates[buyDates.length - 1] })}
                          </p>
                          <table>
                            <thead>
                              <tr><th>{t('insider.colInsider')}</th><th>{t('insider.colRole')}</th><th>{t('insider.colSharesBought')}</th><th>{t('insider.colAvgBuyPrice')}</th><th>{t('insider.colBuys')}</th><th>{t('insider.colMostRecentBuy')}</th></tr>
                            </thead>
                            <tbody>
                              {byInsider.map((b) => (
                                <tr key={b.insider}>
                                  <td>{b.insider}</td><td>{b.role}</td>
                                  <td>{fmtNum(b.shares)}</td>
                                  <td>{fmtPrice(b.shares > 0 ? b.weighted / b.shares : null)}</td>
                                  <td>{fmtNum(b.buys)}</td><td>{b.latest}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </>
                      ) : (
                        <p>
                          {t('insider.noBuys')}
                        </p>
                      )}
                      <table>
                        <thead>
                          <tr><th>{t('insider.colDate')}</th><th>{t('insider.colInsider')}</th><th>{t('insider.colRole')}</th><th>{t('insider.colType')}</th><th>{t('insider.colShares')}</th><th>{t('insider.colPrice')}</th><th>{t('insider.colValue')}</th></tr>
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
                        {t('insider.realNote')}
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      {t('insider.noneFound', { ticker: company.ticker })}
                    </p>
                  )
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>{t('insider.colDate')}</th><th>{t('insider.colInsider')}</th><th>{t('insider.colRole')}</th><th>{t('insider.colType')}</th><th>{t('insider.colShares')}</th><th>{t('insider.colPrice')}</th><th>{t('insider.colValue')}</th></tr>
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
              <SourceNote skey="insider" />
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
                  const commonRows = real.filter((r) => r.type === 'Shares')
                  const markShares = commonRows.reduce((s, r) => s + r.shares, 0)
                  const markValue = commonRows.reduce((s, r) => s + r.value, 0)
                  const holderMark = markShares > 0 ? markValue / markShares : null
                  const lastClose =
                    prices && prices.daily && prices.daily.length > 0
                      ? prices.daily[prices.daily.length - 1].c
                      : null
                  const markDiffPct =
                    holderMark != null && lastClose != null
                      ? ((lastClose - holderMark) / holderMark) * 100
                      : null
                  return (
                    <>
                      <p>
                        {t('owners.intro', { count: fmtNum(real.length) })}
                      </p>
                      <div className="fact-grid" style={{ marginBottom: 16 }}>
                        <StatCard
                          label={t('owners.holders')}
                          value={fmtNum(real.length)}
                          meta={t('owners.holdersMeta')}
                        />
                        <StatCard
                          label={t('owners.sharesReported')}
                          value={fmtNum(totalShares)}
                          meta={t('owners.sharesReportedMeta')}
                        />
                        <StatCard
                          label={t('owners.reportedValue')}
                          value={fmtUSD(totalValue)}
                          meta={t('owners.reportedValueMeta')}
                        />
                        <StatCard
                          label={t('owners.pctOutstanding')}
                          value={`${pctOutSum.toFixed(2)}%`}
                          meta={t('owners.pctOutstandingMeta')}
                        />
                        <StatCard
                          label={t('owners.increased')}
                          value={fmtNum(increased)}
                          meta={t('owners.increasedMeta', { count: fmtNum(newPositions) })}
                        />
                        <StatCard
                          label={t('owners.decreased')}
                          value={fmtNum(decreased)}
                          meta={t('owners.decreasedMeta')}
                        />
                        <StatCard
                          label={t('owners.top5')}
                          value={topShare(5)}
                          meta={t('owners.top5Meta')}
                        />
                        <StatCard
                          label={t('owners.top10')}
                          value={topShare(10)}
                          meta={t('owners.top10Meta')}
                        />
                        <StatCard
                          label={t('owners.avgMark')}
                          value={fmtPrice(holderMark)}
                          meta={
                            markDiffPct != null ? (
                              <span>
                                {t('owners.nowPrice', { price: fmtPrice(lastClose) })} ·{' '}
                                <span className={markDiffPct >= 0 ? 'buy' : 'sell'}>
                                  {markDiffPct >= 0 ? '+' : '−'}
                                  {Math.abs(markDiffPct).toFixed(1)}% {t('owners.vsMark')}
                                </span>
                              </span>
                            ) : (
                              t('owners.avgMarkMetaPlain')
                            )
                          }
                        />
                      </div>
                      <p className="source-note">
                        {t('owners.markNote')}
                      </p>
                      <table>
                        <thead>
                          <tr><th>{t('owners.colHolder')}</th><th>{t('owners.colType')}</th><th>{t('owners.colShares')}</th><th>{t('owners.colChange')}</th><th>{t('owners.colReportedValue')}</th><th>{t('owners.colPctOutstanding')}</th><th>{t('owners.colPeriod')}</th><th>{t('owners.colFiled')}</th></tr>
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
                          {t('owners.showingNote', { shown: shown.length, total: fmtNum(real.length), ticker: company.ticker })}
                        </p>
                      )}
                      <p className="source-note">
                        {t('owners.realNote')}
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      {t('owners.noneFound', { ticker: company.ticker })}
                    </p>
                  )
                }
                if (ownership === null) {
                  return <p>{t('owners.loading')}</p>
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>{t('owners.colHolder')}</th><th>{t('owners.colShares')}</th><th>{t('owners.colChange')}</th><th>{t('owners.colPctOutstanding')}</th><th>{t('owners.colPeriod')}</th></tr>
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
              <SourceNote skey="ownership" />
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
                          <tr><th>{t('short.colSettlement')}</th><th>{t('short.colShortInterest')}</th><th>{t('short.colAvgDailyVolume')}</th><th>{t('short.colDaysToCover')}</th></tr>
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
                        {t('short.realNote')}
                      </p>
                    </>
                  )
                }
                if (real) {
                  return (
                    <p>
                      {t('short.noneFound', { ticker: company.ticker })}
                    </p>
                  )
                }
                return (
                  <>
                    <SampleBadge />
                    <table>
                      <thead>
                        <tr><th>{t('short.colSettlement')}</th><th>{t('short.colShortInterest')}</th><th>{t('short.colAvgDailyVolume')}</th><th>{t('short.colDaysToCover')}</th></tr>
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
              <SourceNote skey="short" />
            </section>
          )}

          {tab === 'Chart' && (
            <section>
              {pricesState === 'loading' && <p>{t('smc.loading')}</p>}
              {pricesState === 'error' && (
                <p className="error">
                  {t('smc.error', { ticker: company.ticker })}
                </p>
              )}
              {pricesState === 'ok' && prices && <ProChart candles={prices.daily} ticker={company.ticker} />}
            </section>
          )}

          {tab === 'SMC Analysis' && (
            <section>
              {!hasSmc ? (
                <div className="fact-card smc-locked">
                  <h3>🔒 {t('smc.lockedTitle')}</h3>
                  <p>{t('smc.lockedBody')}</p>
                  {!user && <p>{t('smc.lockedSignin')}</p>}
                  {user && <p>{t('smc.lockedMember')}</p>}
                </div>
              ) : (
                <>
              {pricesState === 'loading' && <p>{t('smc.loading')}</p>}
              {pricesState === 'error' && (
                <p className="error">
                  {t('smc.error', { ticker: company.ticker })}
                </p>
              )}
              {pricesState === 'ok' && prices && smcDaily && smcView && (
                <>
                  <SmcSettings
                    settings={smcSettings}
                    onChange={updateSmcSettings}
                    ticker={company.ticker}
                    perStock={smcPerStock}
                    onTogglePerStock={toggleSmcPerStock}
                  />
                  <div className="smc-chart-wrap">
                    <SmcChart
                      candles={visibleCandles}
                      analysis={smcDaily}
                      startIndex={startIndex}
                      display={smcSettings.display}
                    />
                  </div>

                  <div className="fact-grid smc-panel">
                    <StatCard
                      label={
                        smcSettings.timeframe === 'weekly'
                          ? t('smc.weeklyBias')
                          : t('smc.dailyTrend')
                      }
                      value={trendText(smcDaily.trend)}
                      meta={
                        smcSettings.timeframe === 'weekly'
                          ? t('smc.weeklyBiasMeta')
                          : t('smc.dailyTrendMeta')
                      }
                    />
                    <StatCard
                      label={
                        smcSettings.timeframe === 'weekly'
                          ? t('smc.dailyTrend')
                          : t('smc.weeklyBias')
                      }
                      value={trendText(
                        smcSettings.timeframe === 'weekly' ? dailyTrend : weeklyTrend,
                      )}
                      meta={
                        smcSettings.timeframe === 'weekly'
                          ? t('smc.dailyTrendMeta')
                          : t('smc.weeklyBiasMeta')
                      }
                    />
                    <StatCard
                      label={t('smc.signals5y')}
                      value={fmtNum(smcView.stats.total)}
                      meta={t('smc.signalsMeta')}
                    />
                    <StatCard
                      label={t('smc.tpRate')}
                      value={fmtTpRate(smcView.stats.tpRate)}
                      meta={t('smc.tpRateMeta')}
                    />
                  </div>

                  <div className="smc-panel">
                    <h3>{t('smc.checklistTitle')}</h3>
                    <ul className="smc-check">
                      {smcDaily.checklist.map((item) => (
                        <li key={item.key}>
                          <span className={item.ok ? 'smc-status ok' : 'smc-status wait'}>
                            {item.ok ? '✓' : '—'}
                          </span>
                          <span className="smc-check-label">{t('smc.check.' + item.key)}</span>
                          <span className="smc-check-detail">{item.detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="smc-cols">
                    <div className="smc-panel">
                      <h3>{t('smc.activeZones')}</h3>
                      {(() => {
                        const activeZones = smcDaily.zones
                          .filter((z) => !z.mitigated)
                          .slice()
                          .sort((a, b) => b.createdIndex - a.createdIndex)
                          .slice(0, 8)
                        if (activeZones.length === 0) return <p>{t('smc.noActiveZones')}</p>
                        return (
                          <table>
                            <thead>
                              <tr><th>{t('smc.colSide')}</th><th>{t('smc.colRange')}</th><th>{t('smc.colTested')}</th></tr>
                            </thead>
                            <tbody>
                              {activeZones.map((z, i) => (
                                <tr key={i}>
                                  <td className={z.side === 'demand' ? 'buy' : 'sell'}>
                                    {z.side === 'demand' ? t('smc.demand') : t('smc.supply')}
                                  </td>
                                  <td>
                                    {fmtUSD(z.bottom)} – {fmtUSD(z.top)}
                                  </td>
                                  <td>{t('smc.testedTimes', { n: z.touches })}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>

                    <div className="smc-panel">
                      <h3>{t('smc.nearestLiquidity')}</h3>
                      {(() => {
                        const lastClose = smcSeries?.[smcSeries.length - 1]?.c
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
                                <td>{t('smc.bslAbove')}</td>
                                <td>{bslAbove ? fmtUSD(bslAbove.level) : '—'}</td>
                              </tr>
                              <tr>
                                <td>{t('smc.lastClose')}</td>
                                <td>{lastClose != null ? fmtUSD(lastClose) : '—'}</td>
                              </tr>
                              <tr>
                                <td>{t('smc.sslBelow')}</td>
                                <td>{sslBelow ? fmtUSD(sslBelow.level) : '—'}</td>
                              </tr>
                            </tbody>
                          </table>
                        )
                      })()}
                    </div>
                  </div>

                  <div className="smc-panel">
                    <h3>{t('smc.signalHistory')}</h3>
                    <p>
                      {t('smc.signalSummary', { total: fmtNum(smcView.stats.total), tp: fmtNum(smcView.stats.tpHit), sl: fmtNum(smcView.stats.slHit), open: fmtNum(smcView.stats.open), expired: fmtNum(smcView.stats.expired) })}
                    </p>
                    {(() => {
                      const sizerOn =
                        smcSettings.sizer.account > 0 && smcSettings.sizer.riskPct > 0
                      const riskUsd = sizerOn
                        ? (smcSettings.sizer.account * smcSettings.sizer.riskPct) / 100
                        : 0
                      const sharesFor = (s) => {
                        const per = Math.abs(s.entry - s.sl)
                        return per > 0 ? Math.floor(riskUsd / per) : 0
                      }
                      const latestSig = smcView.filtered[smcView.filtered.length - 1]
                      return (
                        <>
                          {sizerOn && latestSig && (
                            <p className="smc-sizer-line">
                              {t('smcset.sizerLine', {
                                risk: fmtUSD(riskUsd),
                                shares: fmtNum(sharesFor(latestSig)),
                              })}
                            </p>
                          )}
                          {smcView.filtered.length > 0 ? (
                            <table>
                              <thead>
                                <tr><th>{t('smc.colDate')}</th><th>{t('smc.colSide')}</th><th>{t('smc.colEntry')}</th><th>SL</th><th>TP</th><th>{t('smcset.scoreCol')}</th><th>{t('smc.colOutcome')}</th>{sizerOn && <th>{t('smcset.sharesCol')}</th>}</tr>
                              </thead>
                              <tbody>
                                {smcView.filtered
                                  .slice()
                                  .sort((a, b) => b.index - a.index)
                                  .slice(0, 20)
                                  .map((s, i) => (
                                    <tr key={i}>
                                      <td>{new Date(s.t * 1000).toISOString().slice(0, 10)}</td>
                                      <td className={s.side === 'buy' ? 'buy' : 'sell'}>
                                        {s.side === 'buy' ? t('smc.buy') : t('smc.sell')}
                                      </td>
                                      <td>{fmtUSD(s.entry)}</td>
                                      <td>{fmtUSD(s.sl)}</td>
                                      <td>{fmtUSD(s.tp)}</td>
                                      <td>{s.score != null ? `${s.score}/6` : '—'}</td>
                                      <td>
                                        {s.outcome === 'tp_hit'
                                          ? t('smc.outcomeTp')
                                          : s.outcome === 'sl_hit'
                                            ? t('smc.outcomeSl')
                                            : s.outcome === 'open'
                                              ? t('smc.outcomeOpen')
                                              : t('smc.outcomeExpired')}
                                      </td>
                                      {sizerOn && <td>{fmtNum(sharesFor(s))}</td>}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          ) : (
                            <p>{t('smc.noSignals')}</p>
                          )}
                        </>
                      )
                    })()}
                  </div>

                  <p className="source-note">
                    <strong>{t('common.source')}</strong> {t('smc.sourceNote')}
                  </p>
                </>
              )}
                </>
              )}
            </section>
          )}

          {tab === 'News' && (
            <section>
              <NewsTab ticker={company.ticker} />
            </section>
          )}

          {tab === 'Comments' && (
            <section>
              <CommentsTab
                ticker={company.ticker}
                onLogin={() => setAuthOpen(true)}
              />
            </section>
          )}
        </main>
      )}
        </>
      )}

      <NewsPopup onOpenStory={setPopupStory} />
      {popupStory && (
        <ArticleReader story={popupStory} onClose={() => setPopupStory(null)} />
      )}

      <footer className="footer">
        {t('nav.footer')}
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <LangProvider>
      <AuthProvider>
        <AppInner />
      </AuthProvider>
    </LangProvider>
  )
}
