import { useEffect, useMemo, useRef, useState } from 'react'
import { sma, ema, bollinger, rsi, macd, aggregate } from '../lib/indicators'
import { useLang } from '../lib/i18n'

// TradingView-feel interactive chart: pan / zoom / pinch, range
// presets, daily-weekly-monthly intervals, candle-line-area types,
// SMA / EMA / Bollinger overlays, volume pane, RSI and MACD
// sub-panels, crosshair with a live OHLC legend, and a last-price
// tag. Hand-rolled canvas — no chart library, no new dependencies.
// Props: candles — daily candles [{ t, o, h, l, c, v }], t = unix
// seconds, ascending (weekly/monthly are aggregated client-side).

const PAD_LEFT = 6
const PAD_RIGHT = 64 // price axis on the right
const AXIS_H = 24 // time axis strip at the bottom
const GRID = '#24344f'
const TEXT = '#93a5bf'
const TEXT_BRIGHT = '#e8eef7'
const UP = '#3ecf6f'
const DOWN = '#ff6b6b'
const ACCENT = '#4da3ff'
const TAG_BG = '#2a3b5c'
const C_SMA20 = '#ffb84d'
const C_SMA50 = '#4da3ff'
const C_EMA20 = '#2dd4bf'
const C_BB = '#8b9dc3'
const C_RSI = '#bb9af7'
const C_SIGNAL = '#ffb84d'
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif'

const RANGES = [
  { id: '3M', months: 3, key: 'chart.range3M' },
  { id: '6M', months: 6, key: 'chart.range6M' },
  { id: '1Y', months: 12, key: 'chart.range1Y' },
  { id: '2Y', months: 24, key: 'chart.range2Y' },
  { id: '5Y', months: 60, key: 'chart.range5Y' },
  { id: 'All', months: Infinity, key: 'chart.rangeAll' },
]
const INTERVALS = [
  { id: 'D', key: 'chart.intervalDaily' },
  { id: 'W', key: 'chart.intervalWeekly' },
  { id: 'M', key: 'chart.intervalMonthly' },
]
const TYPES = [
  { id: 'candles', key: 'chart.typeCandles' },
  { id: 'line', key: 'chart.typeLine' },
  { id: 'area', key: 'chart.typeArea' },
]

function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function formatPrice(value) {
  const abs = Math.abs(value)
  if (abs >= 10) return value.toFixed(2)
  if (abs >= 1) return value.toFixed(3)
  return value.toFixed(4)
}

function formatVol(v) {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(2)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(1)}K`
  return `${Math.round(v)}`
}

function formatDateShort(t, withYear) {
  const d = new Date(t * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return withYear
    ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateFull(t) {
  const d = new Date(t * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// View = { first, count }: fractional index of the first visible bar
// and how many bars are visible. Pure helper so the initial state and
// the range presets share one implementation.
function rangeView(rangeId, s) {
  const n = s.length
  if (n === 0) return { first: 0, count: 0 }
  const r = RANGES.find((x) => x.id === rangeId) || RANGES[2]
  if (!Number.isFinite(r.months)) return { first: 0, count: n }
  const lastT = s[n - 1].t
  const d = new Date(lastT * 1000)
  d.setUTCMonth(d.getUTCMonth() - r.months)
  const cutoff = d.getTime() / 1000
  let first = s.findIndex((b) => b.t >= cutoff)
  if (first < 0) first = 0
  return { first, count: n - first }
}

function clampView(v, n) {
  if (n === 0) return { first: 0, count: 0 }
  const count = Math.min(Math.max(v.count, Math.min(5, n)), n)
  const first = Math.min(Math.max(v.first, 0), Math.max(0, n - count))
  return { first, count }
}

function paneHeights(width, showVolume, showRSI, showMACD) {
  const small = width > 0 && width < 560
  const priceH = small ? 260 : 340
  const volH = Math.round(priceH * 0.18)
  const subH = small ? 74 : 88
  const total =
    priceH + (showVolume ? volH : 0) + (showRSI ? subH : 0) + (showMACD ? subH : 0) + AXIS_H
  return { priceH, volH, subH, total }
}

function pillPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
}

// Draws the whole chart. Returns the layout (plot geometry + pane
// scales) so pointer handlers can invert coordinates between draws.
function drawProChart(canvas, cssWidth, cssHeight, heights, model) {
  const dpr = window.devicePixelRatio || 1
  canvas.width = Math.max(1, Math.round(cssWidth * dpr))
  canvas.height = Math.max(1, Math.round(cssHeight * dpr))
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.font = `11px ${FONT}`
  ctx.textBaseline = 'middle'

  const { series, view, inds, overlays, showVolume, showRSI, showMACD, chartType, hover, labels } =
    model
  const n = series.length

  const plotLeft = PAD_LEFT
  const plotRight = cssWidth - PAD_RIGHT
  const plotWidth = Math.max(1, plotRight - plotLeft)

  // Pane stack.
  const panes = []
  let py = 0
  panes.push({ kind: 'price', y0: py, y1: py + heights.priceH })
  py += heights.priceH
  if (showVolume) {
    panes.push({ kind: 'volume', y0: py, y1: py + heights.volH })
    py += heights.volH
  }
  if (showRSI) {
    panes.push({ kind: 'rsi', y0: py, y1: py + heights.subH })
    py += heights.subH
  }
  if (showMACD) {
    panes.push({ kind: 'macd', y0: py, y1: py + heights.subH })
    py += heights.subH
  }
  const axisY = py

  const layout = { plotLeft, plotRight, plotWidth, panes, axisY, barWidth: 0, viewFirst: view.first }
  if (n === 0 || view.count <= 0) {
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    ctx.font = `13px ${FONT}`
    ctx.fillText(labels.noData, cssWidth / 2, cssHeight / 2)
    return layout
  }

  const barWidth = plotWidth / view.count
  layout.barWidth = barWidth
  const xCenter = (i) => plotLeft + (i - view.first + 0.5) * barWidth
  const i0 = Math.max(0, Math.floor(view.first))
  const i1 = Math.min(n - 1, Math.ceil(view.first + view.count - 1))

  // --- Price scale: visible bars + visible overlay values ---
  let lo = Infinity
  let hi = -Infinity
  const grow = (v) => {
    if (v !== null && v !== undefined && Number.isFinite(v)) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
  }
  for (let i = i0; i <= i1; i += 1) {
    const c = series[i]
    if (chartType === 'candles') {
      grow(c.h)
      grow(c.l)
    } else {
      grow(c.c)
    }
    if (overlays.sma20) grow(inds.sma20[i])
    if (overlays.sma50) grow(inds.sma50[i])
    if (overlays.ema20) grow(inds.ema20[i])
    if (overlays.bb) {
      grow(inds.bb.upper[i])
      grow(inds.bb.lower[i])
    }
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    ctx.fillText(labels.noData, cssWidth / 2, cssHeight / 2)
    return layout
  }
  if (hi === lo) {
    hi = lo + Math.abs(lo) * 0.01 + 0.01
    lo = lo - Math.abs(lo) * 0.01 - 0.01
  }
  const padP = (hi - lo) * 0.06
  const priceMin = lo - padP
  const priceMax = hi + padP

  const pricePane = panes[0]
  pricePane.min = priceMin
  pricePane.max = priceMax
  const yPrice = (p) =>
    pricePane.y0 + ((priceMax - p) / (priceMax - priceMin)) * (pricePane.y1 - pricePane.y0)

  // Volume scale.
  let volMax = 0
  for (let i = i0; i <= i1; i += 1) {
    const v = num(series[i].v)
    if (v !== null && v > volMax) volMax = v
  }

  // MACD scale.
  let macdMin = 0
  let macdMax = 0
  if (showMACD) {
    for (let i = i0; i <= i1; i += 1) {
      for (const arr of [inds.macdO.macd, inds.macdO.signal, inds.macdO.histogram]) {
        const v = arr[i]
        if (v !== null && v !== undefined && Number.isFinite(v)) {
          if (v < macdMin) macdMin = v
          if (v > macdMax) macdMax = v
        }
      }
    }
    if (macdMax === macdMin) macdMax = macdMin + 1
    const mp = (macdMax - macdMin) * 0.1
    macdMin -= mp
    macdMax += mp
  }
  for (const p of panes) {
    if (p.kind === 'volume') {
      p.min = 0
      p.max = volMax || 1
    } else if (p.kind === 'rsi') {
      p.min = 0
      p.max = 100
    } else if (p.kind === 'macd') {
      p.min = macdMin
      p.max = macdMax
    }
  }
  const yIn = (pane, v) =>
    pane.y0 + ((pane.max - v) / (pane.max - pane.min)) * (pane.y1 - pane.y0)

  // --- Generic line over visible indices, breaking on nulls ---
  function drawLine(values, color, widthPx) {
    ctx.strokeStyle = color
    ctx.lineWidth = widthPx
    ctx.beginPath()
    let started = false
    for (let i = i0; i <= i1; i += 1) {
      const v = values[i]
      if (v === null || v === undefined || !Number.isFinite(v)) {
        started = false
        continue
      }
      const x = xCenter(i)
      const y = yPrice(v)
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else {
        ctx.lineTo(x, y)
      }
    }
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // --- Grid + axes per pane ---
  for (const pane of panes) {
    ctx.strokeStyle = GRID
    ctx.fillStyle = TEXT
    ctx.lineWidth = 1
    let ticks = []
    if (pane.kind === 'price') {
      for (let k = 0; k < 5; k += 1) ticks.push(priceMin + ((priceMax - priceMin) * k) / 4)
    } else if (pane.kind === 'rsi') {
      ticks = [30, 50, 70]
    } else if (pane.kind === 'macd') {
      ticks = [pane.min + (pane.max - pane.min) / 2, 0, pane.max - (pane.max - pane.min) / 2]
      ticks = [...new Set(ticks.map((v) => Math.round(v * 1e6) / 1e6))]
    } else if (pane.kind === 'volume') {
      ticks = [pane.max]
    }
    for (const tv of ticks) {
      const y = yIn(pane, tv)
      ctx.setLineDash(pane.kind === 'rsi' ? [4, 4] : [])
      ctx.beginPath()
      ctx.moveTo(plotLeft, y)
      ctx.lineTo(plotRight, y)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.textAlign = 'left'
      const label =
        pane.kind === 'volume'
          ? formatVol(tv)
          : pane.kind === 'rsi'
            ? `${Math.round(tv)}`
            : formatPrice(tv)
      ctx.fillText(label, plotRight + 6, y)
    }
    // Pane bottom separator.
    ctx.strokeStyle = GRID
    ctx.beginPath()
    ctx.moveTo(plotLeft, pane.y1)
    ctx.lineTo(plotRight, pane.y1)
    ctx.stroke()
    // Pane label (sub-panels + volume), top-left inside the pane.
    if (pane.kind !== 'price') {
      ctx.fillStyle = TEXT
      ctx.textAlign = 'left'
      ctx.font = `600 10px ${FONT}`
      const lbl =
        pane.kind === 'volume' ? labels.vol : pane.kind === 'rsi' ? labels.rsi : labels.macd
      ctx.fillText(lbl, plotLeft + 6, pane.y0 + 9)
      ctx.font = `11px ${FONT}`
    }
  }
  // RSI 30–70 band shading.
  const rsiPane = panes.find((p) => p.kind === 'rsi')
  if (rsiPane) {
    ctx.fillStyle = 'rgba(147, 165, 191, 0.06)'
    ctx.fillRect(plotLeft, yIn(rsiPane, 70), plotWidth, yIn(rsiPane, 30) - yIn(rsiPane, 70))
  }

  // --- Price series ---
  const bodyWidth = Math.max(1, Math.min(barWidth * 0.7, barWidth - 1))
  if (chartType === 'candles') {
    for (let i = i0; i <= i1; i += 1) {
      const c = series[i]
      const o = num(c.o)
      const h = num(c.h)
      const l = num(c.l)
      const cl = num(c.c)
      if (o === null || h === null || l === null || cl === null) continue
      const color = cl >= o ? UP : DOWN
      const x = xCenter(i)
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.moveTo(x, yPrice(h))
      ctx.lineTo(x, yPrice(l))
      ctx.stroke()
      const yO = yPrice(o)
      const yC = yPrice(cl)
      ctx.fillRect(x - bodyWidth / 2, Math.min(yO, yC), bodyWidth, Math.max(1, Math.abs(yC - yO)))
    }
  } else {
    // Line / area through closes.
    ctx.strokeStyle = ACCENT
    ctx.lineWidth = 1.6
    ctx.beginPath()
    let started = false
    let firstX = 0
    let lastX = 0
    for (let i = i0; i <= i1; i += 1) {
      const cl = num(series[i].c)
      if (cl === null) {
        started = false
        continue
      }
      const x = xCenter(i)
      const y = yPrice(cl)
      if (!started) {
        ctx.moveTo(x, y)
        firstX = x
        started = true
      } else {
        ctx.lineTo(x, y)
      }
      lastX = x
    }
    if (chartType === 'area' && started) {
      ctx.save()
      ctx.lineTo(lastX, pricePane.y1)
      ctx.lineTo(firstX, pricePane.y1)
      ctx.closePath()
      ctx.fillStyle = 'rgba(77, 163, 255, 0.16)'
      ctx.fill()
      ctx.restore()
      // Re-stroke the top line (the fill path consumed it).
      ctx.beginPath()
      let s2 = false
      for (let i = i0; i <= i1; i += 1) {
        const cl = num(series[i].c)
        if (cl === null) {
          s2 = false
          continue
        }
        const x = xCenter(i)
        const y = yPrice(cl)
        if (!s2) {
          ctx.moveTo(x, y)
          s2 = true
        } else ctx.lineTo(x, y)
      }
      ctx.stroke()
    } else {
      ctx.stroke()
    }
    ctx.lineWidth = 1
  }

  // --- Overlays ---
  if (overlays.bb) {
    // Band fill between upper and lower over continuous runs.
    ctx.fillStyle = 'rgba(139, 157, 195, 0.10)'
    let run = []
    const flush = () => {
      if (run.length > 1) {
        ctx.beginPath()
        run.forEach((i, k) => {
          const x = xCenter(i)
          const y = yPrice(inds.bb.upper[i])
          if (k === 0) ctx.moveTo(x, y)
          else ctx.lineTo(x, y)
        })
        for (let k = run.length - 1; k >= 0; k -= 1) {
          ctx.lineTo(xCenter(run[k]), yPrice(inds.bb.lower[run[k]]))
        }
        ctx.closePath()
        ctx.fill()
      }
      run = []
    }
    for (let i = i0; i <= i1; i += 1) {
      if (inds.bb.upper[i] !== null && inds.bb.lower[i] !== null) run.push(i)
      else flush()
    }
    flush()
    drawLine(inds.bb.upper, C_BB, 1)
    drawLine(inds.bb.lower, C_BB, 1)
  }
  if (overlays.sma20) drawLine(inds.sma20, C_SMA20, 1.2)
  if (overlays.sma50) drawLine(inds.sma50, C_SMA50, 1.2)
  if (overlays.ema20) drawLine(inds.ema20, C_EMA20, 1.2)

  // --- Volume pane ---
  const volPane = panes.find((p) => p.kind === 'volume')
  if (volPane && volMax > 0) {
    for (let i = i0; i <= i1; i += 1) {
      const c = series[i]
      const v = num(c.v)
      if (v === null) continue
      const up = c.c >= c.o
      ctx.fillStyle = up ? 'rgba(62, 207, 111, 0.65)' : 'rgba(255, 107, 107, 0.65)'
      const y = yIn(volPane, v)
      ctx.fillRect(xCenter(i) - bodyWidth / 2, y, bodyWidth, volPane.y1 - y)
    }
  }

  // --- RSI line ---
  if (rsiPane) {
    ctx.strokeStyle = C_RSI
    ctx.lineWidth = 1.4
    ctx.beginPath()
    let started = false
    for (let i = i0; i <= i1; i += 1) {
      const v = inds.rsiA[i]
      if (v === null || v === undefined) {
        started = false
        continue
      }
      const x = xCenter(i)
      const y = yIn(rsiPane, v)
      if (!started) {
        ctx.moveTo(x, y)
        started = true
      } else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.lineWidth = 1
  }

  // --- MACD pane ---
  const macdPane = panes.find((p) => p.kind === 'macd')
  if (macdPane) {
    const zeroY = yIn(macdPane, 0)
    ctx.strokeStyle = TEXT
    ctx.beginPath()
    ctx.moveTo(plotLeft, zeroY)
    ctx.lineTo(plotRight, zeroY)
    ctx.stroke()
    for (let i = i0; i <= i1; i += 1) {
      const h = inds.macdO.histogram[i]
      if (h === null || h === undefined) continue
      const y = yIn(macdPane, h)
      ctx.fillStyle = h >= 0 ? 'rgba(62, 207, 111, 0.55)' : 'rgba(255, 107, 107, 0.55)'
      ctx.fillRect(
        xCenter(i) - bodyWidth / 2,
        Math.min(y, zeroY),
        bodyWidth,
        Math.max(1, Math.abs(zeroY - y)),
      )
    }
    const drawPaneLine = (values, color) => {
      ctx.strokeStyle = color
      ctx.lineWidth = 1.3
      ctx.beginPath()
      let started = false
      for (let i = i0; i <= i1; i += 1) {
        const v = values[i]
        if (v === null || v === undefined) {
          started = false
          continue
        }
        const x = xCenter(i)
        const y = yIn(macdPane, v)
        if (!started) {
          ctx.moveTo(x, y)
          started = true
        } else ctx.lineTo(x, y)
      }
      ctx.stroke()
      ctx.lineWidth = 1
    }
    drawPaneLine(inds.macdO.macd, ACCENT)
    drawPaneLine(inds.macdO.signal, C_SIGNAL)
  }

  // --- Last price line + axis tag (price pane) ---
  const lastBar = series[n - 1]
  const lastClose = num(lastBar.c)
  const prevClose = n > 1 ? num(series[n - 2].c) : num(lastBar.o)
  if (lastClose !== null && lastClose >= priceMin && lastClose <= priceMax) {
    const y = yPrice(lastClose)
    const color = prevClose !== null && lastClose < prevClose ? DOWN : UP
    ctx.strokeStyle = color
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(plotLeft, y)
    ctx.lineTo(plotRight, y)
    ctx.stroke()
    ctx.setLineDash([])
    const label = formatPrice(lastClose)
    ctx.font = `700 10.5px ${FONT}`
    const tw = ctx.measureText(label).width
    ctx.fillStyle = color
    pillPath(ctx, plotRight + 2, y - 8, PAD_RIGHT - 4, 16, 3)
    ctx.fill()
    ctx.fillStyle = '#0b1220'
    ctx.textAlign = 'center'
    ctx.fillText(label, plotRight + 2 + (PAD_RIGHT - 4) / 2, y + 0.5)
    void tw
    ctx.font = `11px ${FONT}`
  }

  // --- Crosshair ---
  if (hover && hover.idx >= 0 && hover.idx < n) {
    const hx = xCenter(hover.idx)
    if (hx >= plotLeft - barWidth && hx <= plotRight + barWidth) {
      ctx.strokeStyle = 'rgba(147, 165, 191, 0.55)'
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(hx, 0)
      ctx.lineTo(hx, axisY)
      ctx.stroke()
      // Horizontal line + value tag in the hovered pane.
      const pane = panes.find((p) => hover.y >= p.y0 && hover.y < p.y1)
      if (pane) {
        const hy = Math.min(Math.max(hover.y, pane.y0), pane.y1)
        ctx.beginPath()
        ctx.moveTo(plotLeft, hy)
        ctx.lineTo(plotRight, hy)
        ctx.stroke()
        const val = pane.max - ((hy - pane.y0) / (pane.y1 - pane.y0)) * (pane.max - pane.min)
        const label =
          pane.kind === 'volume'
            ? formatVol(val)
            : pane.kind === 'rsi'
              ? val.toFixed(1)
              : formatPrice(val)
        ctx.font = `10.5px ${FONT}`
        ctx.fillStyle = TAG_BG
        pillPath(ctx, plotRight + 2, hy - 8, PAD_RIGHT - 4, 16, 3)
        ctx.fill()
        ctx.fillStyle = TEXT_BRIGHT
        ctx.textAlign = 'center'
        ctx.fillText(label, plotRight + 2 + (PAD_RIGHT - 4) / 2, hy + 0.5)
        ctx.font = `11px ${FONT}`
      }
      ctx.setLineDash([])
      // Date tag on the time axis.
      const tVal = num(series[hover.idx].t)
      if (tVal !== null) {
        const spanDays = (series[i1].t - series[i0].t) / 86400
        const label = formatDateShort(tVal, spanDays > 400)
        ctx.font = `10.5px ${FONT}`
        const tw = ctx.measureText(label).width + 12
        const cx = Math.min(plotRight - tw / 2, Math.max(plotLeft + tw / 2, hx))
        ctx.fillStyle = TAG_BG
        pillPath(ctx, cx - tw / 2, axisY + 3, tw, 16, 3)
        ctx.fill()
        ctx.fillStyle = TEXT_BRIGHT
        ctx.textAlign = 'center'
        ctx.fillText(label, cx, axisY + 11)
        ctx.font = `11px ${FONT}`
      }
    }
  }

  // --- Time axis labels ---
  ctx.fillStyle = TEXT
  ctx.textAlign = 'center'
  const spanDays = i1 > i0 ? (series[i1].t - series[i0].t) / 86400 : 0
  const tickCount = Math.max(2, Math.min(6, Math.floor(plotWidth / 110)))
  for (let k = 0; k < tickCount; k += 1) {
    const fi = view.first + (view.count - 1) * (tickCount === 1 ? 0 : k / (tickCount - 1))
    const idx = Math.min(n - 1, Math.max(0, Math.round(fi)))
    const tVal = num(series[idx].t)
    if (tVal === null) continue
    const label = formatDateShort(tVal, spanDays > 400)
    const x = xCenter(idx)
    const tw = ctx.measureText(label).width
    const cx = Math.min(plotRight - tw / 2, Math.max(plotLeft + tw / 2, x))
    ctx.fillText(label, cx, axisY + 13)
  }

  return layout
}

export default function ProChart({ candles }) {
  const { t } = useLang()
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  const [width, setWidth] = useState(0)
  const [interval, setIntervalSel] = useState('D')
  const [chartType, setChartType] = useState('candles')
  const [activeRange, setActiveRange] = useState('1Y')
  const [overlays, setOverlays] = useState({ sma20: false, sma50: false, ema20: false, bb: false })
  const [showVolume, setShowVolume] = useState(true)
  const [showRSI, setShowRSI] = useState(false)
  const [showMACD, setShowMACD] = useState(false)
  const [hover, setHoverState] = useState(null)
  const [view, setViewState] = useState(() =>
    rangeView('1Y', Array.isArray(candles) ? candles : []),
  )

  const viewRef = useRef(view)
  const rangeRef = useRef('1Y')
  const layoutRef = useRef(null)
  const seriesRef = useRef([])
  const hoverRef = useRef(null)

  const setView = (v) => {
    viewRef.current = v
    setViewState(v)
  }
  const setHover = (h) => {
    hoverRef.current = h
    setHoverState(h)
  }

  const series = useMemo(() => {
    if (!Array.isArray(candles)) return []
    if (interval === 'W') return aggregate(candles, 'week')
    if (interval === 'M') return aggregate(candles, 'month')
    return candles
  }, [candles, interval])

  const inds = useMemo(
    () => ({
      sma20: sma(series, 20),
      sma50: sma(series, 50),
      ema20: ema(series, 20),
      bb: bollinger(series, 20, 2),
      rsiA: rsi(series, 14),
      macdO: macd(series, 12, 26, 9),
    }),
    [series],
  )

  const heights = paneHeights(width, showVolume, showRSI, showMACD)

  const applyRange = (rangeId, s) => {
    rangeRef.current = rangeId
    setActiveRange(rangeId)
    setView(rangeView(rangeId, s))
    setHover(null)
  }

  // Reset = back to the standard view: Daily interval + 1Y range.
  // (Before, Reset re-applied the CURRENT range, so after picking "All"
  // there was no one-tap way back to the plain daily view.)
  const resetView = () => {
    setIntervalSel('D')
    applyRange('1Y', Array.isArray(candles) ? candles : [])
  }

  // Reset the window whenever the series changes (new ticker or new
  // interval), using the currently selected range preset.
  const lastSeriesRef = useRef(null)
  useEffect(() => {
    if (series !== lastSeriesRef.current) {
      lastSeriesRef.current = series
      setView(rangeView(rangeRef.current, series))
      setHover(null)
    }
  }, [series])

  // Measure the stage width (DPR + ResizeObserver, like SmcChart).
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

  // Keep refs fresh for the pointer handlers.
  useEffect(() => {
    seriesRef.current = series
  })

  // Draw after every render (state-driven redraw: view, hover, toggles).
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width <= 0) return
    const layout = drawProChart(canvas, width, heights.total, heights, {
      series,
      view,
      inds,
      overlays,
      showVolume,
      showRSI,
      showMACD,
      chartType,
      hover,
      labels: {
        noData: t('chart.noData'),
        vol: t('chart.vol'),
        rsi: t('chart.rsi'),
        macd: t('chart.macd'),
      },
    })
    if (layout) layoutRef.current = layout
  })

  // Pointer interactions: pan, wheel zoom, pinch zoom, hover.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return undefined
    const pointers = new Map()
    let mode = null // 'pan' | 'pinch'
    let startX = 0
    let startView = null
    let pinchDist = 0
    let pinchAnchor = 0 // fractional bar index under the pinch midpoint

    const pos = (e) => {
      const r = canvas.getBoundingClientRect()
      return { x: e.clientX - r.left, y: e.clientY - r.top }
    }
    const idxAt = (x) => {
      const L = layoutRef.current
      const s = seriesRef.current
      if (!L || !L.barWidth || s.length === 0) return null
      const idx = Math.floor(viewRef.current.first + (x - L.plotLeft) / L.barWidth)
      return Math.min(s.length - 1, Math.max(0, idx))
    }

    const onDown = (e) => {
      canvas.setPointerCapture(e.pointerId)
      const p = pos(e)
      pointers.set(e.pointerId, p)
      if (pointers.size === 2) {
        mode = 'pinch'
        const [a, b] = [...pointers.values()]
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y)
        const L = layoutRef.current
        if (L && L.barWidth) {
          pinchAnchor = viewRef.current.first + ((a.x + b.x) / 2 - L.plotLeft) / L.barWidth
        }
        startView = viewRef.current
      } else {
        mode = 'pan'
        startX = p.x
        startView = viewRef.current
        const idx = idxAt(p.x)
        if (idx !== null) setHover({ idx, y: p.y })
      }
    }

    const onMove = (e) => {
      const p = pos(e)
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, p)
      const L = layoutRef.current
      const s = seriesRef.current
      if (mode === 'pinch' && pointers.size === 2 && L && L.barWidth && startView) {
        const [a, b] = [...pointers.values()]
        const dist = Math.hypot(a.x - b.x, a.y - b.y)
        if (dist > 0 && pinchDist > 0) {
          const count = clampView(
            { first: startView.first, count: startView.count * (pinchDist / dist) },
            s.length,
          ).count
          const midX = (a.x + b.x) / 2
          const first = pinchAnchor - ((midX - L.plotLeft) / L.plotWidth) * count
          setView(clampView({ first, count }, s.length))
          setActiveRange(null)
        }
        return
      }
      if (mode === 'pan' && startView && L && L.barWidth) {
        const dx = p.x - startX
        const first = startView.first - dx / (L.plotWidth / startView.count)
        setView(clampView({ first, count: startView.count }, s.length))
        if (Math.abs(dx) > 2) setActiveRange(null)
        const idx = idxAt(p.x)
        if (idx !== null) setHover({ idx, y: p.y })
        return
      }
      // Hover (no buttons down).
      const idx = idxAt(p.x)
      if (idx !== null) {
        const cur = hoverRef.current
        if (!cur || cur.idx !== idx || Math.abs(cur.y - p.y) > 1) {
          setHover({ idx, y: p.y })
        }
      }
    }

    const onUp = (e) => {
      pointers.delete(e.pointerId)
      if (pointers.size < 2 && mode === 'pinch') mode = null
      if (pointers.size === 0) mode = null
    }

    const onLeave = () => {
      if (pointers.size === 0) setHover(null)
    }

    const onWheel = (e) => {
      e.preventDefault()
      const L = layoutRef.current
      const s = seriesRef.current
      if (!L || !L.barWidth || s.length === 0) return
      const p = pos(e)
      const v = viewRef.current
      const anchor = v.first + ((p.x - L.plotLeft) / L.plotWidth) * v.count
      const factor = Math.exp(e.deltaY * 0.0015)
      const count = clampView({ first: v.first, count: v.count * factor }, s.length).count
      const first = anchor - ((p.x - L.plotLeft) / L.plotWidth) * count
      setView(clampView({ first, count }, s.length))
      setActiveRange(null)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('pointerleave', onLeave)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.removeEventListener('pointercancel', onUp)
      canvas.removeEventListener('pointerleave', onLeave)
      canvas.removeEventListener('wheel', onWheel)
    }
  }, [])

  // --- Legend data (hovered bar, else the last bar) ---
  const legendIdx =
    hover && hover.idx >= 0 && hover.idx < series.length ? hover.idx : series.length - 1
  const legendBar = legendIdx >= 0 ? series[legendIdx] : null
  const legendPrev = legendIdx > 0 ? series[legendIdx - 1] : null
  const legendChg =
    legendBar && legendPrev ? legendBar.c - legendPrev.c : legendBar ? legendBar.c - legendBar.o : 0
  const legendBase = legendPrev ? legendPrev.c : legendBar ? legendBar.o : 0
  const legendPct = legendBase ? (legendChg / legendBase) * 100 : 0
  const legendColor = legendBar && legendBar.c >= legendBar.o ? UP : DOWN
  const chgColor = legendChg >= 0 ? UP : DOWN

  const toggleOverlay = (key) => setOverlays((o) => ({ ...o, [key]: !o[key] }))

  const chip = (active) => `pro-chip${active ? ' active' : ''}`

  return (
    <div className="pro-chart">
      <div className="pro-toolbar">
        <div className="pro-group">
          {RANGES.map((r) => (
            <button
              key={r.id}
              className={chip(activeRange === r.id)}
              onClick={() => applyRange(r.id, series)}
            >
              {t(r.key)}
            </button>
          ))}
        </div>
        <div className="pro-group">
          {INTERVALS.map((iv) => (
            <button
              key={iv.id}
              className={chip(interval === iv.id)}
              onClick={() => setIntervalSel(iv.id)}
            >
              {t(iv.key)}
            </button>
          ))}
        </div>
        <div className="pro-group">
          {TYPES.map((tp) => (
            <button
              key={tp.id}
              className={chip(chartType === tp.id)}
              onClick={() => setChartType(tp.id)}
            >
              {t(tp.key)}
            </button>
          ))}
        </div>
        <button className="pro-chip" onClick={resetView}>
          {t('chart.reset')}
        </button>
      </div>

      <div className="pro-toolbar">
        <div className="pro-group">
          <button className={chip(overlays.sma20)} onClick={() => toggleOverlay('sma20')}>
            <span className="pro-dot" style={{ background: C_SMA20 }} />
            {t('chart.sma20')}
          </button>
          <button className={chip(overlays.sma50)} onClick={() => toggleOverlay('sma50')}>
            <span className="pro-dot" style={{ background: C_SMA50 }} />
            {t('chart.sma50')}
          </button>
          <button className={chip(overlays.ema20)} onClick={() => toggleOverlay('ema20')}>
            <span className="pro-dot" style={{ background: C_EMA20 }} />
            {t('chart.ema20')}
          </button>
          <button className={chip(overlays.bb)} onClick={() => toggleOverlay('bb')}>
            <span className="pro-dot" style={{ background: C_BB }} />
            {t('chart.bollinger')}
          </button>
        </div>
        <div className="pro-group">
          <button className={chip(showVolume)} onClick={() => setShowVolume(!showVolume)}>
            {t('info.volume')}
          </button>
          <button className={chip(showRSI)} onClick={() => setShowRSI(!showRSI)}>
            {t('chart.rsi')}
          </button>
          <button className={chip(showMACD)} onClick={() => setShowMACD(!showMACD)}>
            {t('chart.macd')}
          </button>
        </div>
      </div>

      <div className="pro-stage" ref={wrapRef} style={{ height: `${heights.total}px` }}>
        <canvas ref={canvasRef} className="pro-canvas" />
        {legendBar && (
          <div className="pro-legend">
            <span className="pro-legend-date">{formatDateFull(legendBar.t)}</span>
            <span>
              {t('chart.open')} <b style={{ color: legendColor }}>{formatPrice(legendBar.o)}</b>
            </span>
            <span>
              {t('chart.high')} <b style={{ color: legendColor }}>{formatPrice(legendBar.h)}</b>
            </span>
            <span>
              {t('chart.low')} <b style={{ color: legendColor }}>{formatPrice(legendBar.l)}</b>
            </span>
            <span>
              {t('chart.close')} <b style={{ color: legendColor }}>{formatPrice(legendBar.c)}</b>
            </span>
            <span style={{ color: chgColor }}>
              {legendChg >= 0 ? '+' : '−'}
              {formatPrice(Math.abs(legendChg))} ({legendChg >= 0 ? '+' : '−'}
              {Math.abs(legendPct).toFixed(2)}%)
            </span>
            <span>
              {t('chart.vol')} <b>{formatVol(legendBar.v)}</b>
            </span>
            {(overlays.sma20 || overlays.sma50 || overlays.ema20 || overlays.bb) && (
              <span className="pro-legend-ind">
                {overlays.sma20 && inds.sma20[legendIdx] !== null && (
                  <span style={{ color: C_SMA20 }}>
                    {t('chart.sma20')} {formatPrice(inds.sma20[legendIdx])}
                  </span>
                )}
                {overlays.sma50 && inds.sma50[legendIdx] !== null && (
                  <span style={{ color: C_SMA50 }}>
                    {t('chart.sma50')} {formatPrice(inds.sma50[legendIdx])}
                  </span>
                )}
                {overlays.ema20 && inds.ema20[legendIdx] !== null && (
                  <span style={{ color: C_EMA20 }}>
                    {t('chart.ema20')} {formatPrice(inds.ema20[legendIdx])}
                  </span>
                )}
                {overlays.bb && inds.bb.upper[legendIdx] !== null && (
                  <span style={{ color: C_BB }}>
                    {t('chart.bollinger')} {formatPrice(inds.bb.upper[legendIdx])} ·{' '}
                    {formatPrice(inds.bb.lower[legendIdx])}
                  </span>
                )}
              </span>
            )}
          </div>
        )}
      </div>
      <p className="source-note pro-caption">{t('info.barNoteNoDate')}</p>
    </div>
  )
}
