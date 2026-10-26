// Pure technical-indicator math over candle arrays.
// Candles use the shared shape { t, o, h, l, c, v } (t = unix seconds,
// ascending). Every function returns an array aligned to the input —
// same length, with null wherever there is not enough history yet.
// No side effects, no fetches, no DOM.

function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v)
}

function closesOf(candles) {
  const out = new Array(candles.length)
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i] ? candles[i].c : null
    out[i] = isNum(c) ? c : null
  }
  return out
}

// Simple moving average of closes. Null until the first full window.
export function sma(candles, period) {
  const n = candles.length
  const out = new Array(n).fill(null)
  if (!period || period < 1) return out
  const closes = closesOf(candles)
  // Prefix sums of values and of valid counts, so a window containing a
  // non-numeric close yields null instead of a silently wrong mean.
  const sum = new Float64Array(n + 1)
  const cnt = new Float64Array(n + 1)
  for (let i = 0; i < n; i += 1) {
    sum[i + 1] = sum[i] + (closes[i] === null ? 0 : closes[i])
    cnt[i + 1] = cnt[i] + (closes[i] === null ? 0 : 1)
  }
  for (let i = period - 1; i < n; i += 1) {
    if (cnt[i + 1] - cnt[i + 1 - period] === period) {
      out[i] = (sum[i + 1] - sum[i + 1 - period]) / period
    }
  }
  return out
}

// Exponential moving average of closes, seeded with the SMA of the
// first `period` closes at index period-1 (nulls before that).
export function ema(candles, period) {
  const n = candles.length
  const out = new Array(n).fill(null)
  if (!period || period < 1 || n < period) return out
  const closes = closesOf(candles)
  let seed = 0
  for (let i = 0; i < period; i += 1) {
    if (closes[i] === null) return out
    seed += closes[i]
  }
  let prev = seed / period
  out[period - 1] = prev
  const k = 2 / (period + 1)
  for (let i = period; i < n; i += 1) {
    if (closes[i] === null) {
      out[i] = prev
      continue
    }
    prev = closes[i] * k + prev * (1 - k)
    out[i] = prev
  }
  return out
}

// Bollinger Bands over closes: mid = SMA(period), upper/lower =
// mid ± mult × population standard deviation of the window.
export function bollinger(candles, period = 20, mult = 2) {
  const n = candles.length
  const mid = new Array(n).fill(null)
  const upper = new Array(n).fill(null)
  const lower = new Array(n).fill(null)
  if (!period || period < 1) return { mid, upper, lower }
  const closes = closesOf(candles)
  const sum = new Float64Array(n + 1)
  const sq = new Float64Array(n + 1)
  const cnt = new Float64Array(n + 1)
  for (let i = 0; i < n; i += 1) {
    const v = closes[i] === null ? 0 : closes[i]
    sum[i + 1] = sum[i] + v
    sq[i + 1] = sq[i] + v * v
    cnt[i + 1] = cnt[i] + (closes[i] === null ? 0 : 1)
  }
  for (let i = period - 1; i < n; i += 1) {
    if (cnt[i + 1] - cnt[i + 1 - period] !== period) continue
    const s = sum[i + 1] - sum[i + 1 - period]
    const mean = s / period
    const variance = Math.max(0, (sq[i + 1] - sq[i + 1 - period]) / period - mean * mean)
    const sd = Math.sqrt(variance)
    mid[i] = mean
    upper[i] = mean + mult * sd
    lower[i] = mean - mult * sd
  }
  return { mid, upper, lower }
}

// RSI with Wilder smoothing. First value lands at index `period`
// (it needs `period` close-to-close changes); nulls before that.
export function rsi(candles, period = 14) {
  const n = candles.length
  const out = new Array(n).fill(null)
  if (!period || period < 1 || n <= period) return out
  const closes = closesOf(candles)
  for (let i = 0; i < n; i += 1) {
    if (closes[i] === null) return out
  }
  let avgGain = 0
  let avgLoss = 0
  for (let i = 1; i <= period; i += 1) {
    const d = closes[i] - closes[i - 1]
    if (d > 0) avgGain += d
    else avgLoss -= d
  }
  avgGain /= period
  avgLoss /= period
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  for (let i = period + 1; i < n; i += 1) {
    const d = closes[i] - closes[i - 1]
    const gain = d > 0 ? d : 0
    const loss = d < 0 ? -d : 0
    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }
  return out
}

// MACD: macd = EMA(fast) − EMA(slow); signal = EMA(signal) of the macd
// line over its non-null run (seeded with that run's SMA); histogram =
// macd − signal. All three arrays aligned to the input.
export function macd(candles, fast = 12, slow = 26, signal = 9) {
  const n = candles.length
  const macdLine = new Array(n).fill(null)
  const signalLine = new Array(n).fill(null)
  const histogram = new Array(n).fill(null)
  const fastE = ema(candles, fast)
  const slowE = ema(candles, slow)
  const macdIdx = []
  for (let i = 0; i < n; i += 1) {
    if (fastE[i] !== null && slowE[i] !== null) {
      macdLine[i] = fastE[i] - slowE[i]
      macdIdx.push(i)
    }
  }
  if (macdIdx.length >= signal && signal >= 1) {
    let seed = 0
    for (let j = 0; j < signal; j += 1) seed += macdLine[macdIdx[j]]
    let prev = seed / signal
    signalLine[macdIdx[signal - 1]] = prev
    const k = 2 / (signal + 1)
    for (let j = signal; j < macdIdx.length; j += 1) {
      prev = macdLine[macdIdx[j]] * k + prev * (1 - k)
      signalLine[macdIdx[j]] = prev
    }
  }
  for (let i = 0; i < n; i += 1) {
    if (macdLine[i] !== null && signalLine[i] !== null) {
      histogram[i] = macdLine[i] - signalLine[i]
    }
  }
  return { macd: macdLine, signal: signalLine, histogram }
}

// --- Aggregation ------------------------------------------------------
// Group consecutive candles into calendar weeks (ISO, Monday start,
// UTC) or calendar months (UTC). Each group becomes one candle:
// o = first open, h = max high, l = min low, c = last close,
// v = summed volume, t = first bar's timestamp.

function groupKey(t, unit) {
  const d = new Date(t * 1000)
  if (unit === 'month') {
    return d.getUTCFullYear() * 12 + d.getUTCMonth()
  }
  // Days since the Monday of this bar's week (getUTCDay: Sun=0..Sat=6).
  const dow = (d.getUTCDay() + 6) % 7
  const mondayMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dow)
  return Math.floor(mondayMs / 604800000)
}

export function aggregate(candles, unit) {
  if (unit !== 'week' && unit !== 'month') return candles.slice()
  const out = []
  let cur = null
  let curKey = null
  for (const c of candles) {
    if (!c || !isNum(c.t)) continue
    const key = groupKey(c.t, unit)
    if (cur === null || key !== curKey) {
      cur = { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: isNum(c.v) ? c.v : 0 }
      curKey = key
      out.push(cur)
    } else {
      if (isNum(c.h)) cur.h = Math.max(cur.h, c.h)
      if (isNum(c.l)) cur.l = Math.min(cur.l, c.l)
      if (isNum(c.c)) cur.c = c.c
      if (isNum(c.v)) cur.v += c.v
    }
  }
  return out
}

export function aggregateWeekly(dailyCandles) {
  return aggregate(dailyCandles, 'week')
}

export function aggregateMonthly(dailyCandles) {
  return aggregate(dailyCandles, 'month')
}
