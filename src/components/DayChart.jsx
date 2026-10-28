import { useEffect, useRef, useState } from 'react'
import { fetchSessions } from '../lib/prices'
import { useLang } from '../lib/i18n.jsx'

// The locked session chart (Boss's spec, modelled on Yahoo Finance's
// 1D view): whole trading sessions in one fixed frame — pre-market
// from 04:00 ET, regular hours 09:30–16:00, after-hours to 20:00 ET —
// as a single live price line, green above the previous close and red
// below it, with the dashed previous-close line and a volume strip.
// A day-count filter (1D / 5D / 10D presets or a typed number of days,
// up to 365) widens the frame to that many sessions — and that is the
// ONLY way the frame changes: there is deliberately NO pan and NO
// zoom, so nothing outside the chosen sessions can mix in. Refreshes
// about once a minute while open.

const UP = '#3ecf6f'
const DOWN = '#ff6b6b'
const GRID = 'rgba(147, 165, 191, 0.14)'
const TEXT = '#93a5bf'
const BRIGHT = '#e8eef7'
const PREV_LINE = 'rgba(232, 238, 247, 0.45)'
const FONT = '-apple-system, "Segoe UI", Roboto, sans-serif'

const PARTS_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour12: false,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})
const HOUR_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const TIME_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  weekday: 'short',
  month: 'short',
  day: 'numeric',
})
const DAY_FMT = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
})

function etParts(t) {
  const p = {}
  for (const x of PARTS_FMT.formatToParts(new Date(t * 1000))) p[x.type] = x.value
  return p
}

function etDateKey(t) {
  const p = etParts(t)
  return `${p.year}-${p.month}-${p.day}`
}

function fmtPrice(v) {
  if (v == null || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 10) return v.toFixed(2)
  if (abs >= 1) return v.toFixed(3)
  return v.toFixed(4)
}

const PRESET_DAYS = [1, 5, 10]

export default function DayChart({ ticker }) {
  const { t } = useLang()
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)
  const [width, setWidth] = useState(0)
  const [days, setDays] = useState(1)
  const [daysInput, setDaysInput] = useState('')
  const [state, setState] = useState({ status: 'loading', bars: [], prevClose: null })
  const [hover, setHover] = useState(null) // bar index or null
  const barsRef = useRef([])
  const geomRef = useRef(null)

  // Load + refresh the sessions about once a minute.
  useEffect(() => {
    let alive = true
    setState((prev) => ({ status: 'loading', bars: prev.bars, prevClose: prev.prevClose }))
    setHover(null)
    const load = () =>
      fetchSessions(ticker, days)
        .then((data) => {
          if (!alive) return
          barsRef.current = data.intraday || []
          setState({ status: 'ok', bars: barsRef.current, prevClose: data.prevClose ?? null })
        })
        .catch(() => {
          if (alive) setState((prev) => ({ status: 'error', bars: prev.bars, prevClose: prev.prevClose }))
        })
    load()
    const id = setInterval(load, 60_000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [ticker, days])

  // Measure the stage (DPR-aware, like the other charts).
  useEffect(() => {
    const wrap = wrapRef.current
    if (!wrap) return undefined
    const update = () => {
      const w = wrap.clientWidth
      if (w > 0) setWidth((prev) => (Math.abs(prev - w) > 0.5 ? w : prev))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [])

  const bars = state.bars
  const prevClose = state.prevClose
  const multi = days > 1
  const small = width > 0 && width < 560
  const priceH = small ? 200 : 250
  const volH = 38
  const axisH = 18
  const topPad = 18
  const totalH = topPad + priceH + volH + axisH

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0 || bars.length === 0) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(width * dpr)
    canvas.height = Math.round(totalH * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${totalH}px`
    const ctx = canvas.getContext('2d')
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, totalH)
    ctx.font = `11px ${FONT}`

    const padR = 56
    const padL = 6
    const plotW = width - padL - padR
    const plotL = padL
    const plotR = width - padR
    const priceTop = topPad
    const priceBot = topPad + priceH
    const volTop = priceBot + 4
    const volBot = volTop + volH
    const axisY = volBot + 4

    // Bar x positions. One day: true clock time inside the fixed
    // 04:00–20:00 ET frame. Multiple days: one equal step per bar,
    // with a dashed separator wherever a new session starts.
    const n = bars.length
    let positions
    let t0 = null
    let t1 = null
    const separators = [] // bar indexes that start a new session
    if (!multi) {
      const first = bars[0]
      const fp = etParts(first.t)
      const mins = (parseInt(fp.hour, 10) % 24) * 60 + parseInt(fp.minute, 10)
      t0 = first.t - mins * 60 + 4 * 3600
      t1 = t0 + 16 * 3600
      positions = bars.map((b) => plotL + ((b.t - t0) / (t1 - t0)) * plotW)
    } else {
      positions = bars.map((_, i) => plotL + ((i + 0.5) / n) * plotW)
      let prevKey = etDateKey(bars[0].t)
      for (let i = 1; i < n; i++) {
        const k = etDateKey(bars[i].t)
        if (k !== prevKey) {
          separators.push(i)
          prevKey = k
        }
      }
    }
    geomRef.current = { positions }

    let lo = Infinity
    let hi = -Infinity
    for (const b of bars) {
      if (b.c < lo) lo = b.c
      if (b.c > hi) hi = b.c
    }
    if (prevClose != null) {
      lo = Math.min(lo, prevClose)
      hi = Math.max(hi, prevClose)
    }
    const pad = Math.max((hi - lo) * 0.1, hi * 0.002)
    lo -= pad
    hi += pad
    const y = (v) => priceTop + (1 - (v - lo) / (hi - lo)) * priceH

    // Gridlines + price labels (4 rows).
    ctx.strokeStyle = GRID
    ctx.fillStyle = TEXT
    ctx.textAlign = 'left'
    ctx.lineWidth = 1
    for (let i = 0; i <= 4; i++) {
      const v = lo + ((hi - lo) * i) / 4
      const yy = Math.round(y(v)) + 0.5
      ctx.beginPath()
      ctx.moveTo(plotL, yy)
      ctx.lineTo(plotR, yy)
      ctx.stroke()
      ctx.fillText(fmtPrice(v), plotR + 6, yy + 3.5)
    }

    if (!multi) {
      // Session separators (open 09:30, close 16:00 ET) + region labels.
      ctx.strokeStyle = 'rgba(147, 165, 191, 0.35)'
      ctx.setLineDash([3, 4])
      for (const offH of [9.5, 16]) {
        const xx = Math.round(plotL + (((offH - 4) * 3600) / (t1 - t0)) * plotW) + 0.5
        ctx.beginPath()
        ctx.moveTo(xx, priceTop)
        ctx.lineTo(xx, volBot)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.fillStyle = TEXT
      ctx.font = `600 9.5px ${FONT}`
      ctx.textAlign = 'left'
      ctx.fillText(t('day.pre').toUpperCase(), plotL + 2, 12)
      ctx.textAlign = 'right'
      ctx.fillText(t('day.after').toUpperCase(), plotR - 2, 12)
      ctx.font = `11px ${FONT}`
    } else {
      // Session separators with the date under each new session.
      ctx.strokeStyle = 'rgba(147, 165, 191, 0.3)'
      ctx.setLineDash([3, 4])
      for (const i of separators) {
        const xx = Math.round(positions[i] - plotW / n / 2) + 0.5
        ctx.beginPath()
        ctx.moveTo(xx, priceTop)
        ctx.lineTo(xx, volBot)
        ctx.stroke()
      }
      ctx.setLineDash([])
      ctx.fillStyle = TEXT
      ctx.textAlign = 'left'
      const labelAt = [0, ...separators]
      let lastLabelX = -Infinity
      for (const i of labelAt) {
        const x = positions[i] - plotW / n / 2 + 3
        if (x - lastLabelX < 52) continue
        lastLabelX = x
        ctx.fillText(DAY_FMT.format(new Date(bars[i].t * 1000)), x, axisY + 11)
      }
    }

    // Volume strip.
    let vMax = 0
    for (const b of bars) if ((b.v || 0) > vMax) vMax = b.v || 0
    if (vMax > 0) {
      const bw = multi ? Math.max(1, (plotW / n) * 0.8) : Math.max(1, (plotW / ((t1 - t0) / 60)) * 0.8)
      bars.forEach((b, i) => {
        const hgt = ((b.v || 0) / vMax) * (volH - 4)
        ctx.fillStyle = b.c >= b.o ? 'rgba(62, 207, 111, 0.55)' : 'rgba(255, 107, 107, 0.55)'
        ctx.fillRect(positions[i] - bw / 2, volBot - hgt, bw, hgt)
      })
    }

    // The price line + area, two-tone against the previous close.
    const tracePath = () => {
      ctx.beginPath()
      bars.forEach((b, i) => {
        const yy = y(b.c)
        if (i === 0) ctx.moveTo(positions[i], yy)
        else ctx.lineTo(positions[i], yy)
      })
    }
    const areaPath = () => {
      tracePath()
      ctx.lineTo(positions[n - 1], priceBot)
      ctx.lineTo(positions[0], priceBot)
      ctx.closePath()
    }
    const drawTone = (color, fill, clipTop, clipBot) => {
      ctx.save()
      ctx.beginPath()
      ctx.rect(0, clipTop, width, clipBot - clipTop)
      ctx.clip()
      ctx.beginPath()
      areaPath()
      ctx.fillStyle = fill
      ctx.fill()
      ctx.beginPath()
      tracePath()
      ctx.strokeStyle = color
      ctx.lineWidth = 1.6
      ctx.stroke()
      ctx.restore()
    }
    if (prevClose != null) {
      const py = y(prevClose)
      drawTone(UP, 'rgba(62, 207, 111, 0.16)', priceTop, py)
      drawTone(DOWN, 'rgba(255, 107, 107, 0.16)', py, priceBot)
      // Dashed previous-close line + tag.
      ctx.strokeStyle = PREV_LINE
      ctx.setLineDash([5, 4])
      ctx.beginPath()
      ctx.moveTo(plotL, Math.round(py) + 0.5)
      ctx.lineTo(plotR, Math.round(py) + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = 'rgba(20, 30, 48, 0.9)'
      const label = fmtPrice(prevClose)
      ctx.font = `10px ${FONT}`
      const tw = ctx.measureText(label).width + 8
      ctx.fillRect(plotR + 2, py - 8, tw, 16)
      ctx.fillStyle = BRIGHT
      ctx.textAlign = 'center'
      ctx.fillText(label, plotR + 2 + tw / 2, py + 3.5)
      ctx.font = `11px ${FONT}`
    } else {
      const up = bars[n - 1].c >= bars[0].o
      drawTone(up ? UP : DOWN, up ? 'rgba(62, 207, 111, 0.16)' : 'rgba(255, 107, 107, 0.16)', priceTop, priceBot)
    }

    // Last price dot + tag.
    const last = bars[n - 1]
    const lx = positions[n - 1]
    const ly = y(last.c)
    const lastColor = prevClose == null ? BRIGHT : last.c >= prevClose ? UP : DOWN
    ctx.fillStyle = lastColor
    ctx.beginPath()
    ctx.arc(lx, ly, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(20, 30, 48, 0.9)'
    ctx.font = `10px ${FONT}`
    const ll = fmtPrice(last.c)
    const ltw = ctx.measureText(ll).width + 8
    ctx.fillRect(plotR + 2, ly - 8, ltw, 16)
    ctx.fillStyle = lastColor
    ctx.textAlign = 'center'
    ctx.fillText(ll, plotR + 2 + ltw / 2, ly + 3.5)
    ctx.font = `11px ${FONT}`

    // Time axis for the single-day frame: every 2 hours.
    if (!multi) {
      ctx.fillStyle = TEXT
      ctx.textAlign = 'center'
      for (let h = 4; h <= 20; h += 2) {
        const tt = t0 + (h - 4) * 3600
        ctx.fillText(HOUR_FMT.format(new Date(tt * 1000)), plotL + ((tt - t0) / (t1 - t0)) * plotW, axisY + 11)
      }
    }

    // Hover crosshair.
    if (hover != null && bars[hover]) {
      const b = bars[hover]
      const hx = positions[hover]
      const hy = y(b.c)
      ctx.strokeStyle = 'rgba(232, 238, 247, 0.35)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(Math.round(hx) + 0.5, priceTop)
      ctx.lineTo(Math.round(hx) + 0.5, volBot)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.fillStyle = BRIGHT
      ctx.beginPath()
      ctx.arc(hx, hy, 3.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }, [bars, prevClose, width, hover, multi, priceH, volH, totalH, t])

  // Hover = nearest bar. No pan, no zoom — by design.
  const onPointer = (e) => {
    const geom = geomRef.current
    const canvas = canvasRef.current
    if (!geom || !canvas || barsRef.current.length === 0) return
    const rect = canvas.getBoundingClientRect()
    const px = e.clientX - rect.left
    const list = barsRef.current
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < list.length; i++) {
      const d = Math.abs(geom.positions[i] - px)
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    setHover(best)
  }

  const applyInput = (e) => {
    e.preventDefault()
    const v = parseInt(daysInput, 10)
    if (Number.isFinite(v)) setDays(Math.min(365, Math.max(1, v)))
  }

  const last = bars[bars.length - 1]
  const first = bars[0]
  const change = last && prevClose ? last.c - prevClose : null
  const changePct = change != null && prevClose ? (change / prevClose) * 100 : null
  const dayColor = change == null ? BRIGHT : change >= 0 ? UP : DOWN
  const hoverBar = hover != null ? bars[hover] : null
  const shown = hoverBar || last
  const lp = last ? etParts(last.t) : null
  const lastHour = lp ? (parseInt(lp.hour, 10) % 24) + parseInt(lp.minute, 10) / 60 : null
  const phase =
    multi || lastHour == null
      ? null
      : lastHour < 9.5
        ? t('day.pre')
        : lastHour >= 16
          ? t('day.after')
          : t('day.regular')

  return (
    <div className="day-chart">
      <div className="day-filter">
        {PRESET_DAYS.map((d) => (
          <button
            key={d}
            className={`pro-chip${days === d ? ' active' : ''}`}
            onClick={() => setDays(d)}
          >
            {d}D
          </button>
        ))}
        <form className="day-filter-form" onSubmit={applyInput}>
          <input
            type="number"
            min="1"
            max="365"
            value={daysInput}
            onChange={(e) => setDaysInput(e.target.value)}
            placeholder={t('day.days')}
            aria-label={t('day.days')}
          />
          <button type="submit" className="pro-chip">
            {t('day.apply')}
          </button>
        </form>
      </div>
      {state.status === 'loading' && bars.length === 0 && <p>{t('chart.todayLoading')}</p>}
      {state.status === 'error' && bars.length === 0 && <p className="error">{t('chart.todayError')}</p>}
      {last && (
        <div className="day-head">
          <span className="day-price" style={{ color: dayColor }}>
            {fmtPrice(last.c)}
          </span>
          {change != null && (
            <span className="day-change" style={{ color: dayColor }}>
              {change >= 0 ? '+' : ''}
              {change.toFixed(2)} ({changePct >= 0 ? '+' : ''}
              {changePct.toFixed(2)}%)
            </span>
          )}
          <span className="day-meta">
            {multi
              ? `${DATE_FMT.format(new Date(first.t * 1000))} – ${DATE_FMT.format(new Date(last.t * 1000))}`
              : DATE_FMT.format(new Date(first.t * 1000))}
            {phase ? ` · ${phase}` : ''}
            {prevClose != null ? ` · ${t('day.prevClose')} ${fmtPrice(prevClose)}` : ''}
          </span>
        </div>
      )}
      <div className="day-stage" ref={wrapRef} style={{ height: `${totalH}px` }}>
        <canvas
          ref={canvasRef}
          className="day-canvas"
          onPointerMove={onPointer}
          onPointerDown={onPointer}
          onPointerLeave={() => setHover(null)}
        />
        {shown && bars.length > 0 && (
          <div className="day-legend">
            {multi ? `${DAY_FMT.format(new Date(shown.t * 1000))} · ` : ''}
            {TIME_FMT.format(new Date(shown.t * 1000))} ET · {fmtPrice(shown.c)}
          </div>
        )}
      </div>
      <p className="source-note pro-caption">{multi ? t('day.multiNote', { n: days }) : t('chart.todayNote')}</p>
    </div>
  )
}
