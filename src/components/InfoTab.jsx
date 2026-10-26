import { useEffect, useState } from 'react'
import { fetchCompanyInfo } from '../lib/company'
import { fmtUSD, fmtNum } from '../lib/edgar'
import { useLang } from '../lib/i18n'

// Per-stock Info tab: a quote strip from the app's daily prices, the
// company's own EDGAR submissions facts (industry, HQ, fiscal year
// end, incorporation), links out to the sources, and the most recent
// filings. EDGAR fields a filer does not report render as "—" —
// foreign issuers like ZENA leave several empty by design.

const ANNUAL_FORMS = ['10-K', '20-F', '40-F']

function fmtPrice(v) {
  if (v == null || isNaN(v)) return '—'
  return `$${v.toFixed(2)}`
}

function fmtFiscalYearEnd(v, months) {
  if (!v) return '—'
  const s = v.toString()
  if (!/^\d{4}$/.test(s)) return s
  const m = parseInt(s.slice(0, 2), 10)
  const d = parseInt(s.slice(2, 4), 10)
  if (m < 1 || m > 12) return s
  return `${months[m - 1]} ${d}`
}

function cikNumber(cik) {
  return (cik || '').toString().replace(/\D/g, '').replace(/^0+/, '') || '0'
}

function archivesIndexUrl(cikNum, accessionNumber) {
  if (!accessionNumber) return null
  const bare = accessionNumber.replace(/-/g, '')
  return `https://www.sec.gov/Archives/edgar/data/${cikNum}/${bare}/${accessionNumber}-index.html`
}

function externalUrl(u) {
  if (!u) return null
  return /^https?:\/\//i.test(u) ? u : `https://${u}`
}

function googleFinanceUrl(ticker, exchange) {
  const ex = (exchange || '').toString().trim().toUpperCase()
  if (ex === 'NASDAQ') return `https://www.google.com/finance/quote/${ticker}:NASDAQ`
  if (ex === 'NYSE') return `https://www.google.com/finance/quote/${ticker}:NYSE`
  return `https://www.google.com/finance/quote/${ticker}`
}

function InfoCard({ label, value, meta, valueClassName }) {
  return (
    <div className="fact-card">
      <div className="fact-label">{label}</div>
      <div className={`fact-value${valueClassName ? ` ${valueClassName}` : ''}`}>{value}</div>
      <div className="fact-meta">{meta}</div>
    </div>
  )
}

export default function InfoTab({ company, prices, sharesOutstanding }) {
  const { t } = useLang()
  const months = t('info.monthsShort').split('|')
  const [info, setInfo] = useState(null)
  const [infoState, setInfoState] = useState('loading') // loading|ok|error

  useEffect(() => {
    if (!company?.cik) return
    let live = true
    setInfo(null)
    setInfoState('loading')
    fetchCompanyInfo(company.cik)
      .then((data) => {
        if (live) {
          setInfo(data)
          setInfoState('ok')
        }
      })
      .catch(() => {
        if (live) setInfoState('error')
      })
    return () => {
      live = false
    }
  }, [company?.cik])

  const ticker = company.ticker
  const cikNum = cikNumber(company.cik)

  // --- Quote strip, from the daily bars the app already loaded -----
  const daily = prices?.daily || []
  const last = daily.length > 0 ? daily[daily.length - 1] : null
  const prev = daily.length > 1 ? daily[daily.length - 2] : null
  const change = last && prev ? last.c - prev.c : null
  const changePct = change != null && prev.c ? (change / prev.c) * 100 : null
  const lastYear = daily.slice(-252)
  const high52 = lastYear.length > 0 ? Math.max(...lastYear.map((b) => b.h)) : null
  const low52 = lastYear.length > 0 ? Math.min(...lastYear.map((b) => b.l)) : null
  const barDate = last ? new Date(last.t * 1000).toISOString().slice(0, 10) : null
  const marketCap =
    last && typeof sharesOutstanding === 'number' && sharesOutstanding > 0
      ? last.c * sharesOutstanding
      : null

  // --- Links --------------------------------------------------------
  const annual =
    info?.latestAnnual ||
    info?.recentFilings?.find((f) => ANNUAL_FORMS.includes((f.form || '').trim().toUpperCase()))
  const links = []
  if (info?.website)
    links.push({ label: t('info.companyWebsite'), href: externalUrl(info.website) })
  links.push({
    label: t('info.secFilings'),
    href: `https://www.sec.gov/edgar/browse/?CIK=${cikNum}&owner=exclude`,
  })
  if (annual) {
    links.push({
      label: t('info.latestAnnual', { form: annual.form }),
      href: archivesIndexUrl(cikNum, annual.accessionNumber),
    })
  }
  links.push({ label: t('info.yahooFinance'), href: `https://finance.yahoo.com/quote/${ticker}` })
  links.push({
    label: t('info.googleFinance'),
    href: googleFinanceUrl(ticker, info?.exchanges?.[0]),
  })

  // --- Company facts --------------------------------------------------
  const biz = info?.addresses?.business || null
  const hqRegion = biz?.stateOrCountryDescription || biz?.stateOrCountry || null
  const hq =
    biz && (biz.city || hqRegion) ? [biz.city, hqRegion].filter(Boolean).join(', ') : null
  const hqMeta = biz
    ? [biz.street1, biz.street2, biz.zip].filter(Boolean).join(' · ') ||
      t('info.businessAddressOnFile')
    : t('info.notReported')

  return (
    <>
      {last ? (
        <>
          <div className="fact-grid">
            <InfoCard label={t('info.lastClose')} value={fmtPrice(last.c)} meta={barDate || ''} />
            <InfoCard
              label={t('info.dayChange')}
              value={
                change != null
                  ? `${change >= 0 ? '+' : '−'}$${Math.abs(change).toFixed(2)}${
                      changePct != null ? ` (${changePct >= 0 ? '+' : '−'}${Math.abs(changePct).toFixed(2)}%)` : ''
                    }`
                  : '—'
              }
              meta={t('info.vsPrevClose')}
              valueClassName={change == null ? undefined : change >= 0 ? 'buy' : 'sell'}
            />
            <InfoCard
              label={t('info.dayRange')}
              value={`${fmtPrice(last.l)} – ${fmtPrice(last.h)}`}
              meta={t('info.dayRangeMeta')}
            />
            <InfoCard label={t('info.volume')} value={fmtNum(last.v)} meta={t('info.volumeMeta')} />
            <InfoCard
              label={t('info.high52')}
              value={fmtPrice(high52)}
              meta={t('info.weekMeta')}
            />
            <InfoCard label={t('info.low52')} value={fmtPrice(low52)} meta={t('info.weekMeta')} />
            {marketCap != null && (
              <InfoCard
                label={t('info.marketCap')}
                value={fmtUSD(marketCap)}
                meta={t('info.marketCapMeta')}
              />
            )}
          </div>
          <p className="source-note">
            {barDate ? t('info.barNote', { date: barDate }) : t('info.barNoteNoDate')}
          </p>
        </>
      ) : (
        <p>{t('info.noPrices', { ticker })}</p>
      )}

      <div className="info-links">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noreferrer">
            {l.label} ↗
          </a>
        ))}
      </div>

      {infoState === 'loading' && <p>{t('info.loading')}</p>}
      {infoState === 'error' && <p className="error">{t('info.error')}</p>}
      {infoState === 'ok' && info && (
        <>
          <h3>{t('info.factsTitle')}</h3>
          <div className="fact-grid">
            <InfoCard
              label={t('info.industry')}
              value={info.sicDescription || '—'}
              meta={info.sic ? `SIC ${info.sic}` : t('info.notReported')}
            />
            <InfoCard
              label={t('info.exchange')}
              value={info.exchanges?.[0] || '—'}
              meta={
                info.exchanges && info.exchanges.length > 1
                  ? info.exchanges.join(', ')
                  : t('info.exchangeMeta')
              }
            />
            <InfoCard label={t('info.headquarters')} value={hq || '—'} meta={hqMeta} />
            <InfoCard
              label={t('info.phone')}
              value={info.phone || '—'}
              meta={t('info.phoneMeta')}
            />
            <InfoCard
              label={t('info.fiscalYearEnd')}
              value={fmtFiscalYearEnd(info.fiscalYearEnd, months)}
              meta={t('info.fiscalYearEndMeta')}
            />
            <InfoCard
              label={t('info.incorporated')}
              value={info.stateOfIncorporationDescription || info.stateOfIncorporation || '—'}
              meta={t('info.incorporatedMeta')}
            />
            <InfoCard
              label={t('info.entityCategory')}
              value={info.category || '—'}
              meta={t('info.entityCategoryMeta')}
            />
          </div>

          {info.recentFilings && info.recentFilings.length > 0 && (
            <>
              <h3>{t('info.recentFilings')}</h3>
              <table className="info-filings">
                <thead>
                  <tr>
                    <th>{t('info.colForm')}</th>
                    <th>{t('info.colFiled')}</th>
                    <th>{t('info.colReportDate')}</th>
                  </tr>
                </thead>
                <tbody>
                  {info.recentFilings.map((f, i) => {
                    const url = archivesIndexUrl(cikNum, f.accessionNumber)
                    return (
                      <tr key={`${f.accessionNumber || i}`}>
                        <td>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer">
                              {f.form || '—'}
                            </a>
                          ) : (
                            f.form || '—'
                          )}
                        </td>
                        <td>{f.filingDate || '—'}</td>
                        <td>{f.reportDate || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <p className="source-note">{t('info.filingsNote')}</p>
            </>
          )}
        </>
      )}
    </>
  )
}
