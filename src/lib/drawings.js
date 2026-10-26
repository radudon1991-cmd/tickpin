// Drawing-layer helpers for the ProChart canvas (trend lines,
// horizontal lines, Fibonacci retracements). Pure geometry + a
// localStorage persistence wrapper. No imports; safe to load in a
// non-browser environment (storage calls are guarded).
//
// A drawing is { id, type, a, b } where type is 'trend' | 'hline' |
// 'fib', anchors are { i, p } (i = fractional bar index in the daily
// series the drawing was made on, p = price), and b is null for
// 'hline' (single-anchor drawing).

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]

const DRAWING_TYPES = ['trend', 'hline', 'fib']

// Shortest distance from point (px, py) to the segment
// (x1, y1)-(x2, y2). Handles the degenerate zero-length segment.
export function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const lenSq = dx * dx + dy * dy
  let t = 0
  if (lenSq > 0) {
    t = ((px - x1) * dx + (py - y1) * dy) / lenSq
    t = Math.min(1, Math.max(0, t))
  }
  const cx = x1 + t * dx
  const cy = y1 + t * dy
  return Math.hypot(px - cx, py - cy)
}

// Fibonacci retracement levels between two anchor prices: ratio 0
// sits at priceA and ratio 1 at priceB.
export function fibLevels(priceA, priceB) {
  return FIB_RATIOS.map((ratio) => ({
    ratio,
    price: priceA + (priceB - priceA) * ratio,
  }))
}

export function drawingStorageKey(ticker) {
  return `tickpin-drawings:${(ticker || '').toString().toUpperCase()}`
}

function isValidAnchor(a) {
  return (
    a !== null &&
    typeof a === 'object' &&
    Number.isFinite(a.i) &&
    Number.isFinite(a.p)
  )
}

function isValidDrawing(d) {
  if (d === null || typeof d !== 'object') return false
  if (typeof d.id !== 'string' || d.id.length === 0) return false
  if (!DRAWING_TYPES.includes(d.type)) return false
  if (!isValidAnchor(d.a)) return false
  if (d.type === 'hline') return d.b === null || d.b === undefined || isValidAnchor(d.b)
  return isValidAnchor(d.b)
}

// Load the drawings stored for a ticker. Returns [] for missing,
// corrupt, or non-array data — never throws.
export function loadDrawings(ticker) {
  try {
    if (typeof localStorage === 'undefined') return []
    const raw = localStorage.getItem(drawingStorageKey(ticker))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidDrawing).map((d) => ({
      id: d.id,
      type: d.type,
      a: { i: d.a.i, p: d.a.p },
      b: d.type === 'hline' || !d.b ? null : { i: d.b.i, p: d.b.p },
    }))
  } catch {
    return []
  }
}

// Persist a ticker's drawings. Invalid entries are dropped rather
// than stored. Never throws (quota / privacy-mode safe).
export function saveDrawings(ticker, list) {
  try {
    if (typeof localStorage === 'undefined') return
    const clean = Array.isArray(list) ? list.filter(isValidDrawing) : []
    localStorage.setItem(drawingStorageKey(ticker), JSON.stringify(clean))
  } catch {
    // Storage unavailable — drawings simply won't persist.
  }
}
