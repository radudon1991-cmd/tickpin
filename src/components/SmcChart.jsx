import { useEffect, useRef } from 'react'

// Hand-rolled canvas candlestick chart for SMC analysis output.
// No chart library, no new dependencies.
// Props:
//   candles:    visible slice of daily candles, [{ t, o, h, l, c, v }],
//               t = unix seconds, ascending. Visible candle j is
//               full-history index (startIndex + j).
//   analysis:   output of analyzeSMC(fullDailyCandles):
//               { events, zones, fvgs, liquidity, signals }
//   startIndex: full-history index of candles[0].

const HEIGHT = 420
const PAD_LEFT = 8
const PAD_RIGHT = 76 // price axis on the right
const PAD_TOP = 12
const PAD_BOTTOM = 26 // time axis
const GRID = '#24344f'
const TEXT = '#93a5bf'
const UP = '#3ecf6f'
const DOWN = '#ff6b6b'
const BLUE = '#4da3ff'
const DEMAND_FILL = 'rgba(45,212,191,0.13)'
const DEMAND_STRONG = 'rgba(45,212,191,0.85)'
const SUPPLY_FILL = 'rgba(255,107,107,0.13)'
const SUPPLY_STRONG = 'rgba(255,107,107,0.85)'

function num(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function formatPrice(value) {
  const abs = Math.abs(value)
  if (abs >= 100) return value.toFixed(2)
  if (abs >= 10) return value.toFixed(2)
  if (abs >= 1) return value.toFixed(3)
  return value.toFixed(4)
}

function formatDate(unixSeconds) {
  const d = new Date(unixSeconds * 1000)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function drawSmcChart(canvas, cssWidth, candles, analysis, startIndex) {
  const dpr = window.devicePixelRatio || 1
  const cssHeight = HEIGHT
  canvas.width = Math.max(1, Math.round(cssWidth * dpr))
  canvas.height = Math.round(cssHeight * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  ctx.font = '11px "Segoe UI", system-ui, -apple-system, sans-serif'
  ctx.textBaseline = 'middle'

  // Narrow screens (phones): show fewer bars so candles and labels have
  // room to breathe — 250 daily bars across ~360px made the event labels
  // pile up unreadably (Boss's screenshot, 2026-10-26).
  const SMALL = cssWidth < 560
  if (SMALL && Array.isArray(candles) && candles.length > 130) {
    const skip = candles.length - 130
    candles = candles.slice(skip)
    startIndex = (Number.isFinite(startIndex) ? startIndex : 0) + skip
  }

  if (!Array.isArray(candles) || candles.length === 0) {
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    ctx.fillText('No price data', cssWidth / 2, cssHeight / 2)
    return
  }

  const a = analysis && typeof analysis === 'object' ? analysis : {}
  const events = Array.isArray(a.events) ? a.events : []
  const zones = Array.isArray(a.zones) ? a.zones : []
  const fvgs = Array.isArray(a.fvgs) ? a.fvgs : []
  const liquidity = Array.isArray(a.liquidity) ? a.liquidity : []
  const signals = Array.isArray(a.signals) ? a.signals : []

  const base = Number.isFinite(startIndex) ? startIndex : 0
  const n = candles.length
  const lastFull = base + n - 1

  const plotLeft = PAD_LEFT
  const plotRight = cssWidth - PAD_RIGHT
  const plotTop = PAD_TOP
  const plotBottom = cssHeight - PAD_BOTTOM
  const plotWidth = Math.max(1, plotRight - plotLeft)
  const plotHeight = Math.max(1, plotBottom - plotTop)

  // Visible price range from visible candles only, plus padding.
  let lo = Infinity
  let hi = -Infinity
  for (const c of candles) {
    const l = num(c.l)
    const h = num(c.h)
    if (l !== null) lo = Math.min(lo, l)
    if (h !== null) hi = Math.max(hi, h)
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    ctx.fillStyle = TEXT
    ctx.textAlign = 'center'
    ctx.fillText('No price data', cssWidth / 2, cssHeight / 2)
    return
  }
  if (hi === lo) {
    hi = lo + Math.abs(lo) * 0.01 + 0.01
    lo = lo - Math.abs(lo) * 0.01 - 0.01
  }
  const pad = (hi - lo) * 0.06
  const visMin = lo - pad
  const visMax = hi + pad

  const step = plotWidth / n
  const barStart = (fullIndex) => plotLeft + step * (fullIndex - base)
  const barEnd = (fullIndex) => plotLeft + step * (fullIndex - base + 1)
  const barCenter = (fullIndex) => plotLeft + step * (fullIndex - base + 0.5)
  const yFor = (price) =>
    plotTop + ((visMax - price) / (visMax - visMin)) * plotHeight
  const clampY = (y) => Math.min(plotBottom, Math.max(plotTop, y))
  const inRange = (price) => price >= visMin && price <= visMax
  const overlapsRange = (top, bottom) => top >= visMin && bottom <= visMax

  // --- Label decluttering (the Pine original had this; V1 of this chart
  // did not, and labels stacked on top of each other). Every text label
  // registers its rect here; later labels shift vertically until they
  // find free space, or are skipped (their tick line still draws). ---
  const placed = []
  const rectHits = (cx, cy, w, h) =>
    placed.some(
      (r) => Math.abs(r.cx - cx) < (r.w + w) / 2 + 3 && Math.abs(r.cy - cy) < (r.h + h) / 2 + 2,
    )
  function placeLabel(cx, cy, w, h, preferUp) {
    // Canvas y grows downward: negative offset = label moves UP.
    const ordered = preferUp ? [0, -15, 15, -30, 30, -45, 45] : [0, 15, -15, 30, -30, 45, -45]
    for (const dy of ordered) {
      const y = Math.min(plotBottom - h / 2 - 1, Math.max(plotTop + h / 2 + 1, cy + dy))
      if (!rectHits(cx, y, w, h)) {
        placed.push({ cx, cy: y, w, h })
        return y
      }
    }
    return null
  }
  function pillPath(x, y, w, h, r) {
    // roundRect is Safari 16+; fall back to a plain rect on older engines
    // so a missing API can never blank the whole chart.
    ctx.beginPath()
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
    else ctx.rect(x, y, w, h)
  }
  function drawPillLabel(text, cx, cy, color, fontPx) {
    ctx.font = `600 ${fontPx}px "Segoe UI", system-ui, -apple-system, sans-serif`
    const w = ctx.measureText(text).width + 10
    const h = fontPx + 7
    ctx.fillStyle = 'rgba(9, 14, 26, 0.88)'
    pillPath(cx - w / 2, cy - h / 2, w, h, 4)
    ctx.fill()
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText(text, cx, cy + 0.5)
    return { w, h }
  }

  // --- Grid + price axis (~5 labels) ---
  ctx.strokeStyle = GRID
  ctx.fillStyle = TEXT
  ctx.lineWidth = 1
  const priceTicks = 5
  for (let i = 0; i < priceTicks; i += 1) {
    const price = visMin + ((visMax - visMin) * i) / (priceTicks - 1)
    const y = yFor(price)
    ctx.beginPath()
    ctx.moveTo(plotLeft, y)
    ctx.lineTo(plotRight, y)
    ctx.stroke()
    ctx.textAlign = 'left'
    ctx.fillText(formatPrice(price), plotRight + 8, y)
  }
  // Axis lines.
  ctx.beginPath()
  ctx.moveTo(plotRight, plotTop)
  ctx.lineTo(plotRight, plotBottom)
  ctx.moveTo(plotLeft, plotBottom)
  ctx.lineTo(plotRight, plotBottom)
  ctx.stroke()

  // --- Zone shading + order-block outlines ---
  for (const z of zones) {
    const created = num(z.createdIndex)
    if (created === null || created > lastFull) continue
    const mitigated = z.mitigated === true || z.mitigatedIndex != null
    const mitigatedIndex = num(z.mitigatedIndex)
    // Skip zones already mitigated before the visible window.
    if (mitigated && mitigatedIndex !== null && mitigatedIndex < base) continue
    const endIndex =
      mitigated && mitigatedIndex !== null ? mitigatedIndex : lastFull
    if (endIndex < base) continue
    const top = num(z.top)
    const bottom = num(z.bottom)
    if (top === null || bottom === null || !overlapsRange(top, bottom)) continue
    const x1 = Math.max(plotLeft, barStart(created))
    const x2 = Math.min(plotRight, barEnd(endIndex))
    if (x2 <= x1) continue
    const y1 = clampY(yFor(top))
    const y2 = clampY(yFor(bottom))
    const isDemand = z.side === 'demand'
    ctx.fillStyle = isDemand ? DEMAND_FILL : SUPPLY_FILL
    ctx.fillRect(x1, y1, x2 - x1, y2 - y1)
    // Order-block outline over the same x-range.
    const obTop = num(z.obTop)
    const obBottom = num(z.obBottom)
    if (obTop !== null && obBottom !== null && overlapsRange(obTop, obBottom)) {
      ctx.strokeStyle = isDemand ? DEMAND_STRONG : SUPPLY_STRONG
      ctx.lineWidth = 1.5
      ctx.strokeRect(x1, clampY(yFor(obTop)), x2 - x1, clampY(yFor(obBottom)) - clampY(yFor(obTop)))
      ctx.lineWidth = 1
    }
  }

  // --- Fair value gaps (active: not filled before the window) ---
  for (const f of fvgs) {
    const index = num(f.index)
    if (index === null || index > lastFull) continue
    const filledIndex = num(f.filledIndex)
    if (f.filled === true && filledIndex !== null && filledIndex < base) continue
    const endIndex = filledIndex !== null ? filledIndex : lastFull
    if (endIndex < base) continue
    const top = num(f.top)
    const bottom = num(f.bottom)
    if (top === null || bottom === null || !overlapsRange(top, bottom)) continue
    const x1 = Math.max(plotLeft, barStart(index))
    const x2 = Math.min(plotRight, barEnd(endIndex))
    if (x2 <= x1) continue
    ctx.fillStyle =
      f.direction === 'bull' ? 'rgba(163,230,53,0.10)' : 'rgba(255,107,107,0.10)'
    ctx.fillRect(x1, clampY(yFor(top)), x2 - x1, clampY(yFor(bottom)) - clampY(yFor(top)))
  }

  // --- Liquidity pools (level inside the visible price range) ---
  ctx.font = '11px "Segoe UI", system-ui, -apple-system, sans-serif'
  for (const pool of liquidity) {
    const level = num(pool.level)
    if (level === null || !inRange(level)) continue
    const confirm = num(pool.confirmIndex)
    if (confirm === null || confirm > lastFull) continue
    const sweepIndex = num(pool.sweepIndex)
    if (pool.swept === true && sweepIndex !== null && sweepIndex < base) continue
    const endIndex =
      pool.swept === true && sweepIndex !== null ? sweepIndex : lastFull
    if (endIndex < base) continue
    const x1 = Math.max(plotLeft, barStart(confirm))
    const x2 = Math.min(plotRight, barEnd(endIndex))
    if (x2 <= x1) continue
    const color = pool.side === 'bsl' ? '#ffd700' : '#00ced1'
    const y = yFor(level)
    ctx.strokeStyle = color
    ctx.lineWidth = 1
    ctx.setLineDash([5, 4])
    ctx.beginPath()
    ctx.moveTo(x1, y)
    ctx.lineTo(x2, y)
    ctx.stroke()
    ctx.setLineDash([])
    const lx = Math.min(x2, plotRight) - 14
    const ly = y - 10
    ctx.font = '600 10px "Segoe UI", system-ui, -apple-system, sans-serif'
    const lw = ctx.measureText('$$$').width + 8
    placed.push({ cx: lx, cy: ly, w: lw, h: 15 })
    ctx.fillStyle = 'rgba(9, 14, 26, 0.88)'
    pillPath(lx - lw / 2, ly - 7.5, lw, 15, 4)
    ctx.fill()
    ctx.fillStyle = color
    ctx.textAlign = 'center'
    ctx.fillText('$$$', lx, ly + 0.5)
  }

  // --- Candles with wicks ---
  const bodyWidth = Math.max(1, Math.min(step * 0.7, step - 1))
  for (let j = 0; j < n; j += 1) {
    const c = candles[j]
    const o = num(c.o)
    const h = num(c.h)
    const l = num(c.l)
    const cl = num(c.c)
    if (o === null || h === null || l === null || cl === null) continue
    const color = cl >= o ? UP : DOWN
    const x = barCenter(base + j)
    ctx.strokeStyle = color
    ctx.fillStyle = color
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x, yFor(h))
    ctx.lineTo(x, yFor(l))
    ctx.stroke()
    const yOpen = yFor(o)
    const yClose = yFor(cl)
    const bodyTop = Math.min(yOpen, yClose)
    const bodyHeight = Math.max(1, Math.abs(yClose - yOpen))
    ctx.fillRect(x - bodyWidth / 2, bodyTop, bodyWidth, bodyHeight)
  }

  // --- BOS / CHoCH / MSS markers, drawn in priority order (CHoCH first,
  // MSS last) with pill labels placed by the declutter system. A label
  // that cannot find free space is skipped — its tick line still draws.
  // On narrow screens MSS keeps its tick but drops the text entirely. ---
  const priority = { CHoCH: 0, BOS: 1, MSS: 2 }
  const sortedEvents = [...events].sort(
    (p, q) => (priority[p.type] ?? 3) - (priority[q.type] ?? 3),
  )
  for (const ev of sortedEvents) {
    const index = num(ev.index)
    if (index === null || index < base || index > lastFull) continue
    const level = num(ev.level)
    if (level === null || !inRange(level)) continue
    const isMss = ev.type === 'MSS'
    const label = isMss ? 'MSS' : ev.type
    const color = ev.direction === 'up' ? BLUE : DOWN
    const x = barCenter(index)
    const y = yFor(level)
    ctx.strokeStyle = color
    ctx.lineWidth = isMss ? 1 : 1.5
    ctx.beginPath()
    ctx.moveTo(x - Math.max(6, step * 0.8), y)
    ctx.lineTo(x + Math.max(6, step * 0.8), y)
    ctx.stroke()
    ctx.lineWidth = 1
    if (isMss && SMALL) continue
    const fontPx = isMss ? 9 : 10.5
    ctx.font = `600 ${fontPx}px "Segoe UI", system-ui, -apple-system, sans-serif`
    const w = ctx.measureText(label).width + 10
    const h = fontPx + 7
    const wantY = ev.direction === 'up' ? y - 13 : y + 15
    const clampedX = Math.min(plotRight - w / 2 - 1, Math.max(plotLeft + w / 2 + 1, x))
    const placedY = placeLabel(clampedX, wantY, w, h, ev.direction === 'up')
    if (placedY !== null) drawPillLabel(label, clampedX, placedY, color, fontPx)
  }
  ctx.font = '11px "Segoe UI", system-ui, -apple-system, sans-serif'

  // --- Latest signal: entry / SL / TP lines to the right edge ---
  const latest = signals.length > 0 ? signals[signals.length - 1] : null
  if (latest) {
    const sigIndex = num(latest.index)
    if (sigIndex !== null && sigIndex <= lastFull) {
      const x1 = Math.max(plotLeft, barStart(sigIndex))
      const lines = [
        { label: 'Entry', value: num(latest.entry), color: BLUE },
        { label: 'SL', value: num(latest.sl), color: DOWN },
        { label: 'TP', value: num(latest.tp), color: UP },
      ]
      for (const line of lines) {
        if (line.value === null || !inRange(line.value)) continue
        const y = yFor(line.value)
        ctx.strokeStyle = line.color
        ctx.lineWidth = 1
        ctx.setLineDash([6, 3])
        ctx.beginPath()
        ctx.moveTo(x1, y)
        ctx.lineTo(plotRight, y)
        ctx.stroke()
        ctx.setLineDash([])
        const text = `${line.label} ${formatPrice(line.value)}`
        const textWidth = ctx.measureText(text).width
        const labelX = plotRight - 4
        const labelY = Math.min(plotBottom - 6, Math.max(plotTop + 8, y - 11))
        ctx.fillStyle = 'rgba(11,18,32,0.85)'
        ctx.fillRect(labelX - textWidth - 6, labelY - 8, textWidth + 8, 16)
        ctx.fillStyle = line.color
        ctx.textAlign = 'right'
        ctx.fillText(text, labelX, labelY)
      }
    }
  }

  // --- Time axis: a few date labels from t ---
  ctx.fillStyle = TEXT
  ctx.textAlign = 'center'
  const timeTicks = Math.max(2, Math.min(6, Math.floor(plotWidth / 110)))
  for (let i = 0; i < timeTicks; i += 1) {
    const j =
      timeTicks === 1 ? 0 : Math.round(((n - 1) * i) / (timeTicks - 1))
    const t = num(candles[j] && candles[j].t)
    if (t === null) continue
    const label = formatDate(t)
    if (!label) continue
    const x = barCenter(base + j)
    const textWidth = ctx.measureText(label).width
    const clampedX = Math.min(plotRight - textWidth / 2, Math.max(plotLeft + textWidth / 2, x))
    ctx.fillText(label, clampedX, plotBottom + 16)
  }
}

export default function SmcChart({ candles, analysis, startIndex }) {
  const wrapRef = useRef(null)
  const canvasRef = useRef(null)

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return undefined

    const render = () => {
      const width = wrap.clientWidth
      if (width > 0) {
        drawSmcChart(canvas, width, candles, analysis, startIndex)
      }
    }
    render()

    const observer = new ResizeObserver(render)
    observer.observe(wrap)
    return () => observer.disconnect()
  }, [candles, analysis, startIndex])

  return (
    <div ref={wrapRef} style={{ width: '100%', height: `${HEIGHT}px` }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block' }}
      />
    </div>
  )
}
