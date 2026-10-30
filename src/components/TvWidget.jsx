import { useEffect, useRef } from 'react'
import { useLang } from '../lib/i18n.jsx'

// TradingView embed widgets (free, legally displayed under TradingView's
// own license — the widget carries their branding/attribution, which is
// required and must stay). They show REAL-TIME prices from the Cboe
// exchanges in the visitor's browser; the data never touches TickPin's
// servers and cannot feed our own charts/indicators (sealed widget).
//
// type 'info' → Symbol Info card (live price + live stats) for stock pages
// type 'mini' → Mini Symbol Overview (live price + small live chart) for
// dashboard watchlist cards; any number can render on one page.
const SCRIPTS = {
  info: 'embed-widget-symbol-info.js',
  mini: 'embed-widget-mini-symbol-overview.js',
}

export default function TvWidget({ type = 'info', symbol }) {
  const { lang, t } = useLang()
  const hostRef = useRef(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !symbol) return
    const locale = lang === 'th' ? 'th' : 'en'
    const config =
      type === 'mini'
        ? {
            symbol,
            width: '100%',
            height: 220,
            locale,
            dateRange: '3M',
            colorTheme: 'dark',
            isTransparent: true,
            autosize: false,
            chartOnly: false,
          }
        : {
            symbol,
            width: '100%',
            locale,
            colorTheme: 'dark',
            isTransparent: true,
          }
    host.innerHTML = ''
    const container = document.createElement('div')
    container.className = 'tradingview-widget-container'
    const widget = document.createElement('div')
    widget.className = 'tradingview-widget-container__widget'
    const script = document.createElement('script')
    script.type = 'text/javascript'
    script.async = true
    script.src = `https://s3.tradingview.com/external-embedding/${SCRIPTS[type] || SCRIPTS.info}`
    script.innerHTML = JSON.stringify(config)
    container.append(widget, script)
    host.append(container)
    return () => {
      host.innerHTML = ''
    }
  }, [type, symbol, lang])

  if (type === 'mini') {
    return <div className="tv-host tv-host-mini" ref={hostRef} />
  }

  // Info widget: the widget's own TradingView badge (top-right) links to
  // TradingView's home page, not to this stock. A transparent link shield
  // sits exactly over the badge and opens THIS symbol's TradingView page
  // instead — the one deliberate door out to TradingView (the dashboard
  // cards stay internal). The bare-ticker /symbols/<TICKER>/ URL is
  // verified to redirect to the correct exchange page (NASDAQ, NYSE…).
  return (
    <div className="tv-info-wrap">
      <div className="tv-host" ref={hostRef} />
      <a
        className="tv-badge-link"
        href={`https://www.tradingview.com/symbols/${symbol}/`}
        target="_blank"
        rel="noreferrer"
        title={t('live.openTv', { ticker: symbol })}
        aria-label={t('live.openTv', { ticker: symbol })}
      />
    </div>
  )
}
