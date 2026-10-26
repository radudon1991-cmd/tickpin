// Pure Smart Money Concepts (SMC) analysis engine for TickPin.
//
// Rebuild of the TradingView Pine v6 "SMC Trade Assistant V38" rules for
// daily (and weekly) stock candles. No imports, no side effects, no I/O.
//
// No-repaint rule: a pivot is only emitted once its confirmation bar exists
// (confirmIndex = pivot index + swingLen, inside the history), and structure
// levels arm only at that confirmation bar. Every event, zone, signal and
// outcome is stamped at a bar that already happened and never moves.
//
// Input candles: [{ t, o, h, l, c, v }] with t = unix seconds, ascending.
// The same function works unchanged on weekly candles; callers read .trend
// for the weekly bias.

export const DEFAULT_PARAMS = {
  swingLen: 10,
  minorLen: 3,
  atrLen: 14,
  atrMult: 1.2,
  minSwingPct: 0.15,
  zoneLookback: 15,
  zoneWiden: 3,
  liqTolerancePct: 0.15,
  wickRatioMin: 0.55,
  bodyRatioMax: 0.4,
  requireSweep: true,
  requireRetest: true,
  retestBars: 20,
  retestTolerancePct: 0.15,
  slBufferAtrMult: 0.15,
  targetRR: 3,
  expiryBars: 60,
};

const COUNT_KEYS = [
  'swingLen',
  'minorLen',
  'atrLen',
  'zoneLookback',
  'zoneWiden',
  'retestBars',
  'expiryBars',
];

function mergeParams(input) {
  const p = { ...DEFAULT_PARAMS };
  if (input && typeof input === 'object') {
    for (const key of Object.keys(DEFAULT_PARAMS)) {
      const value = input[key];
      if (value === undefined) continue;
      const def = DEFAULT_PARAMS[key];
      if (typeof def === 'boolean') {
        if (typeof value === 'boolean') p[key] = value;
      } else if (typeof value === 'number' && Number.isFinite(value)) {
        p[key] = value;
      }
    }
  }
  for (const key of COUNT_KEYS) p[key] = Math.max(1, Math.floor(p[key]));
  for (const key of ['minSwingPct', 'liqTolerancePct', 'retestTolerancePct']) {
    if (p[key] < 0) p[key] = DEFAULT_PARAMS[key];
  }
  for (const key of ['atrMult', 'slBufferAtrMult', 'wickRatioMin', 'bodyRatioMax']) {
    if (p[key] < 0) p[key] = DEFAULT_PARAMS[key];
  }
  if (p.targetRR <= 0) p.targetRR = DEFAULT_PARAMS.targetRR;
  return p;
}

// Wilder's ATR. atr[i] is null until the first full atrLen window ends.
function computeAtr(candles, len) {
  const atr = new Array(candles.length).fill(null);
  if (candles.length < len) return atr;
  const tr = new Array(candles.length);
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) tr[i] = candles[i].h - candles[i].l;
    else {
      tr[i] = Math.max(
        candles[i].h - candles[i].l,
        Math.abs(candles[i].h - candles[i - 1].c),
        Math.abs(candles[i].l - candles[i - 1].c),
      );
    }
  }
  let sum = 0;
  for (let i = 0; i < len; i++) sum += tr[i];
  atr[len - 1] = sum / len;
  for (let i = len; i < candles.length; i++) {
    atr[i] = (atr[i - 1] * (len - 1) + tr[i]) / len;
  }
  return atr;
}

// Swing pivots. A bar is only considered once its full right window is
// inside the history, so confirmIndex always points at a real bar. The
// min-swing filter drops a new pivot unless it differs from the last
// accepted opposite pivot by at least minSwingPct% of that pivot's price.
function findPivots(candles, len, minSwingPct) {
  const n = candles.length;
  const raw = [];
  for (let i = 0; i < n; i++) {
    if (i + len >= n) break; // confirmation bar must exist
    let isHigh = true;
    let isLow = true;
    for (let j = Math.max(0, i - len); j <= i + len; j++) {
      if (j === i) continue;
      if (candles[j].h >= candles[i].h) isHigh = false;
      if (candles[j].l <= candles[i].l) isLow = false;
      if (!isHigh && !isLow) break;
    }
    if (isHigh) raw.push({ index: i, confirmIndex: i + len, price: candles[i].h, kind: 'high' });
    if (isLow) raw.push({ index: i, confirmIndex: i + len, price: candles[i].l, kind: 'low' });
  }
  const tol = minSwingPct / 100;
  const out = [];
  let lastHigh = null;
  let lastLow = null;
  for (const p of raw) {
    if (p.kind === 'high') {
      if (lastLow !== null && lastLow !== 0 && (p.price - lastLow) / lastLow < tol) continue;
      lastHigh = p.price;
    } else {
      if (lastHigh !== null && lastHigh !== 0 && (lastHigh - p.price) / lastHigh < tol) continue;
      lastLow = p.price;
    }
    out.push(p);
  }
  return out;
}

function byConfirmIndex(pivots) {
  const map = new Map();
  for (const p of pivots) {
    if (!map.has(p.confirmIndex)) map.set(p.confirmIndex, []);
    map.get(p.confirmIndex).push(p);
  }
  return map;
}

function fmt(value) {
  return String(parseFloat(value.toPrecision(6)));
}

export function analyzeSMC(inputCandles, paramsInput = {}) {
  const params = mergeParams(paramsInput);
  const candles = (Array.isArray(inputCandles) ? inputCandles : [])
    .filter(
      (c) =>
        c &&
        Number.isFinite(c.o) &&
        Number.isFinite(c.h) &&
        Number.isFinite(c.l) &&
        Number.isFinite(c.c),
    )
    .map((c) => ({ t: c.t ?? null, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v ?? null }));
  const n = candles.length;

  const emptyChecklist = () => [
    { key: 'trend', label: 'Trend direction', ok: false, detail: 'No data' },
    { key: 'zone', label: 'Zone on trend side', ok: false, detail: 'No data' },
    { key: 'liquidity', label: 'Liquidity level', ok: false, detail: 'No data' },
    { key: 'sweep', label: 'Liquidity swept', ok: false, detail: 'No data' },
    { key: 'rejection', label: 'Rejection candle', ok: false, detail: 'No data' },
    { key: 'retest', label: 'Retest confirmation', ok: false, detail: 'No data' },
  ];

  if (n === 0) {
    return {
      params,
      atr: null,
      trend: 'none',
      pivots: [],
      events: [],
      zones: [],
      fvgs: [],
      liquidity: [],
      signals: [],
      checklist: emptyChecklist(),
      stats: { total: 0, tpHit: 0, slHit: 0, open: 0, expired: 0, tpRate: null },
    };
  }

  const atrArr = computeAtr(candles, params.atrLen);
  const pivots = findPivots(candles, params.swingLen, params.minSwingPct);
  const minorPivots = findPivots(candles, params.minorLen, params.minSwingPct);
  const confirmMap = byConfirmIndex(pivots);
  const minorConfirmMap = byConfirmIndex(minorPivots);

  // ---- Structure: BOS / CHoCH (major) + MSS (minor, trend direction only) ----
  const events = [];
  const trendAt = new Array(n).fill('none');
  let trend = 'none';
  let armedHigh = null;
  let armedLow = null;
  let armedMinorHigh = null;
  let armedMinorLow = null;
  for (let i = 0; i < n; i++) {
    for (const p of confirmMap.get(i) || []) {
      if (p.kind === 'high') armedHigh = p;
      else armedLow = p;
    }
    // A level arms at its confirmation bar; a close break at that same bar
    // cannot break the just-armed level (the pivot is the strict extreme of
    // its window), so index >= confirmIndex always holds for these events.
    if (armedHigh && candles[i].c > armedHigh.price) {
      events.push({
        index: i,
        confirmIndex: armedHigh.confirmIndex,
        pivotIndex: armedHigh.index,
        type: trend === 'down' ? 'CHoCH' : 'BOS',
        direction: 'up',
        level: armedHigh.price,
      });
      trend = 'up';
      armedHigh = null;
    } else if (armedLow && candles[i].c < armedLow.price) {
      events.push({
        index: i,
        confirmIndex: armedLow.confirmIndex,
        pivotIndex: armedLow.index,
        type: trend === 'up' ? 'CHoCH' : 'BOS',
        direction: 'down',
        level: armedLow.price,
      });
      trend = 'down';
      armedLow = null;
    }
    for (const p of minorConfirmMap.get(i) || []) {
      if (p.kind === 'high') armedMinorHigh = p;
      else armedMinorLow = p;
    }
    if (trend === 'up' && armedMinorHigh && candles[i].c > armedMinorHigh.price) {
      events.push({
        index: i,
        confirmIndex: armedMinorHigh.confirmIndex,
        pivotIndex: armedMinorHigh.index,
        type: 'MSS',
        direction: 'up',
        level: armedMinorHigh.price,
      });
      armedMinorHigh = null;
    } else if (trend === 'down' && armedMinorLow && candles[i].c < armedMinorLow.price) {
      events.push({
        index: i,
        confirmIndex: armedMinorLow.confirmIndex,
        pivotIndex: armedMinorLow.index,
        type: 'MSS',
        direction: 'down',
        level: armedMinorLow.price,
      });
      armedMinorLow = null;
    }
    trendAt[i] = trend;
  }

  // ---- Zones: displacement break -> origin candle (+ widen) -> OB bounds ----
  const zones = [];
  let demandCount = 0;
  let supplyCount = 0;
  for (const ev of events) {
    if (ev.type !== 'BOS' && ev.type !== 'CHoCH') continue;
    const i = ev.index;
    if (i === 0) continue;
    const atr = atrArr[i];
    if (atr === null) continue;
    let displaced = false;
    if (ev.direction === 'up') displaced = candles[i].c - candles[i - 1].l > params.atrMult * atr;
    else displaced = candles[i - 1].h - candles[i].c > params.atrMult * atr;
    if (!displaced) continue;
    const wantBearish = ev.direction === 'up'; // demand origin = last bearish candle
    let origin = -1;
    for (let j = i - 1; j >= Math.max(0, i - params.zoneLookback); j--) {
      const bearish = candles[j].c < candles[j].o;
      if (wantBearish ? bearish : !bearish && candles[j].c > candles[j].o) {
        origin = j;
        break;
      }
    }
    if (origin === -1) continue;
    const start = Math.max(0, origin - (params.zoneWiden - 1));
    let top = -Infinity;
    let bottom = Infinity;
    for (let j = start; j <= origin; j++) {
      if (candles[j].h > top) top = candles[j].h;
      if (candles[j].l < bottom) bottom = candles[j].l;
    }
    const side = ev.direction === 'up' ? 'demand' : 'supply';
    const zone = {
      id: side === 'demand' ? `D${++demandCount}` : `S${++supplyCount}`,
      side,
      top,
      bottom,
      obTop: candles[origin].h,
      obBottom: candles[origin].l,
      originIndex: origin,
      createdIndex: i,
      touches: 0,
      mitigated: false,
      mitigatedIndex: null,
    };
    zones.push(zone);
  }
  // Mitigation: first close through the zone; touches count range overlaps
  // on bars after creation up to (not including) the mitigating bar.
  for (const zone of zones) {
    for (let k = zone.createdIndex + 1; k < n; k++) {
      if (zone.side === 'demand') {
        if (candles[k].c < zone.bottom) {
          zone.mitigated = true;
          zone.mitigatedIndex = k;
          break;
        }
      } else {
        if (candles[k].c > zone.top) {
          zone.mitigated = true;
          zone.mitigatedIndex = k;
          break;
        }
      }
      if (candles[k].l <= zone.top && candles[k].h >= zone.bottom) zone.touches += 1;
    }
  }

  // ---- Fair value gaps ----
  const fvgs = [];
  for (let i = 2; i < n; i++) {
    if (candles[i].l > candles[i - 2].h) {
      fvgs.push({ index: i, top: candles[i].l, bottom: candles[i - 2].h, direction: 'bull', filled: false, filledIndex: null });
    } else if (candles[i].h < candles[i - 2].l) {
      fvgs.push({ index: i, top: candles[i - 2].l, bottom: candles[i].h, direction: 'bear', filled: false, filledIndex: null });
    }
  }
  for (const fvg of fvgs) {
    for (let k = fvg.index + 1; k < n; k++) {
      if (fvg.direction === 'bull' && candles[k].l <= fvg.bottom) {
        fvg.filled = true;
        fvg.filledIndex = k;
        break;
      }
      if (fvg.direction === 'bear' && candles[k].h >= fvg.top) {
        fvg.filled = true;
        fvg.filledIndex = k;
        break;
      }
    }
  }

  // ---- Liquidity pools: consecutive equal highs / lows + sweeps ----
  const liquidity = [];
  const liqTol = params.liqTolerancePct / 100;
  const highs = pivots.filter((p) => p.kind === 'high');
  const lows = pivots.filter((p) => p.kind === 'low');
  for (let k = 1; k < highs.length; k++) {
    const a = highs[k - 1];
    const b = highs[k];
    if (a.price !== 0 && Math.abs(b.price - a.price) / a.price <= liqTol) {
      liquidity.push({
        side: 'bsl',
        level: Math.max(a.price, b.price),
        index: b.index,
        confirmIndex: b.confirmIndex,
        swept: false,
        sweepIndex: null,
      });
    }
  }
  for (let k = 1; k < lows.length; k++) {
    const a = lows[k - 1];
    const b = lows[k];
    if (a.price !== 0 && Math.abs(b.price - a.price) / a.price <= liqTol) {
      liquidity.push({
        side: 'ssl',
        level: Math.min(a.price, b.price),
        index: b.index,
        confirmIndex: b.confirmIndex,
        swept: false,
        sweepIndex: null,
      });
    }
  }
  for (const pool of liquidity) {
    for (let k = pool.confirmIndex + 1; k < n; k++) {
      if (pool.side === 'bsl' && candles[k].h > pool.level && candles[k].c < pool.level) {
        pool.swept = true;
        pool.sweepIndex = k;
        break;
      }
      if (pool.side === 'ssl' && candles[k].l < pool.level && candles[k].c > pool.level) {
        pool.swept = true;
        pool.sweepIndex = k;
        break;
      }
    }
  }
  const poolSweepsAt = new Map(); // bar index -> pools swept on that bar
  for (const pool of liquidity) {
    if (pool.sweepIndex !== null) {
      if (!poolSweepsAt.has(pool.sweepIndex)) poolSweepsAt.set(pool.sweepIndex, []);
      poolSweepsAt.get(pool.sweepIndex).push(pool);
    }
  }

  // ---- Entry engine: sweep gate -> rejection at zone -> retest -> signal ----
  function buildSignal(i, side, sweptLevel, setupLow, setupHigh) {
    const entry = candles[i].c;
    const atr = atrArr[i];
    const buffer = atr === null ? 0 : params.slBufferAtrMult * atr;
    let sl;
    let tp;
    if (side === 'buy') {
      sl = sweptLevel - buffer;
      if (!(sl < entry)) sl = Math.min(candles[i].l, setupLow) - buffer;
      if (!(sl < entry)) sl = entry - Math.max(buffer, entry * 0.001);
      tp = entry + params.targetRR * (entry - sl);
    } else {
      sl = sweptLevel + buffer;
      if (!(sl > entry)) sl = Math.max(candles[i].h, setupHigh) + buffer;
      if (!(sl > entry)) sl = entry + Math.max(buffer, entry * 0.001);
      tp = entry - params.targetRR * (sl - entry);
    }
    return {
      index: i,
      t: candles[i].t,
      side,
      entry,
      sl,
      tp,
      rr: params.targetRR,
      outcome: 'open',
      outcomeIndex: null,
    };
  }

  const signals = [];
  let sellSwept = false; // sell-side liquidity swept (relevant for buys)
  let buySwept = false; // buy-side liquidity swept (relevant for sells)
  let sweptSellLevel = null;
  let sweptBuyLevel = null;
  let setup = null; // { side, setupBar, setupLevel, sweptLevel, setupLow, setupHigh }
  let lastQualRejection = null; // { bar, side } — gate-passing rejection at a zone
  let lastLowPivot = null;
  let lastHighPivot = null;

  for (let i = 0; i < n; i++) {
    for (const p of confirmMap.get(i) || []) {
      if (p.kind === 'high') lastHighPivot = p;
      else lastLowPivot = p;
    }
    const barTrend = trendAt[i];

    // Sweep flags: wick beyond the last confirmed swing, close back inside.
    if (
      barTrend === 'up' &&
      lastLowPivot &&
      candles[i].l < lastLowPivot.price &&
      candles[i].c > lastLowPivot.price
    ) {
      sellSwept = true;
      buySwept = false;
      sweptSellLevel = lastLowPivot.price;
      sweptBuyLevel = null;
    } else if (
      barTrend === 'down' &&
      lastHighPivot &&
      candles[i].h > lastHighPivot.price &&
      candles[i].c < lastHighPivot.price
    ) {
      buySwept = true;
      sellSwept = false;
      sweptBuyLevel = lastHighPivot.price;
      sweptSellLevel = null;
    }
    // Pool sweeps set the corresponding flag too.
    for (const pool of poolSweepsAt.get(i) || []) {
      if (pool.side === 'ssl') {
        sellSwept = true;
        buySwept = false;
        sweptSellLevel = pool.level;
        sweptBuyLevel = null;
      } else {
        buySwept = true;
        sellSwept = false;
        sweptBuyLevel = pool.level;
        sweptSellLevel = null;
      }
    }

    // Rejection candles.
    const range = candles[i].h - candles[i].l;
    let bullRej = false;
    let bearRej = false;
    if (range > 0) {
      const lowerWick = Math.min(candles[i].o, candles[i].c) - candles[i].l;
      const upperWick = candles[i].h - Math.max(candles[i].o, candles[i].c);
      const body = Math.abs(candles[i].c - candles[i].o);
      bullRej =
        lowerWick / range >= params.wickRatioMin && body / range <= params.bodyRatioMax;
      bearRej =
        upperWick / range >= params.wickRatioMin && body / range <= params.bodyRatioMax;
    }
    const activeZones = zones.filter(
      (z) => z.createdIndex <= i && (z.mitigatedIndex === null || z.mitigatedIndex > i),
    );
    const atDemand = activeZones.some(
      (z) =>
        z.side === 'demand' && candles[i].l <= z.top && candles[i].h >= z.bottom,
    );
    const atSupply = activeZones.some(
      (z) =>
        z.side === 'supply' && candles[i].l <= z.top && candles[i].h >= z.bottom,
    );
    const buyCandidate = bullRej && atDemand && (!params.requireSweep || sellSwept);
    const sellCandidate = bearRej && atSupply && (!params.requireSweep || buySwept);
    if (buyCandidate) lastQualRejection = { bar: i, side: 'buy' };
    if (sellCandidate) lastQualRejection = { bar: i, side: 'sell' };

    // Expire a setup whose retest window has passed.
    if (setup && i - setup.setupBar > params.retestBars) setup = null;

    // Retest: price back within tolerance of the setup level + a second
    // rejection of the same side (need not be at a zone).
    if (setup && params.requireRetest) {
      const tol = params.retestTolerancePct / 100;
      const near =
        setup.side === 'buy'
          ? setup.setupLevel !== 0 &&
            Math.abs(candles[i].l - setup.setupLevel) / setup.setupLevel <= tol
          : setup.setupLevel !== 0 &&
            Math.abs(candles[i].h - setup.setupLevel) / setup.setupLevel <= tol;
      const secondRej = setup.side === 'buy' ? bullRej : bearRej;
      if (near && secondRej) {
        signals.push(
          buildSignal(i, setup.side, setup.sweptLevel, setup.setupLow, setup.setupHigh),
        );
        setup = null;
        sellSwept = false;
        buySwept = false;
        sweptSellLevel = null;
        sweptBuyLevel = null;
        continue;
      }
    }

    // Start a setup, or fire immediately when no retest is required.
    if (!setup) {
      if (buyCandidate) {
        const sweptLevel = sweptSellLevel !== null ? sweptSellLevel : candles[i].l;
        if (params.requireRetest) {
          setup = {
            side: 'buy',
            setupBar: i,
            setupLevel: candles[i].l,
            sweptLevel,
            setupLow: candles[i].l,
            setupHigh: candles[i].h,
          };
        } else {
          signals.push(buildSignal(i, 'buy', sweptLevel, candles[i].l, candles[i].h));
          sellSwept = false;
          buySwept = false;
          sweptSellLevel = null;
          sweptBuyLevel = null;
        }
      } else if (sellCandidate) {
        const sweptLevel = sweptBuyLevel !== null ? sweptBuyLevel : candles[i].h;
        if (params.requireRetest) {
          setup = {
            side: 'sell',
            setupBar: i,
            setupLevel: candles[i].h,
            sweptLevel,
            setupLow: candles[i].l,
            setupHigh: candles[i].h,
          };
        } else {
          signals.push(buildSignal(i, 'sell', sweptLevel, candles[i].l, candles[i].h));
          sellSwept = false;
          buySwept = false;
          sweptSellLevel = null;
          sweptBuyLevel = null;
        }
      }
    }
  }

  // ---- Outcomes: SL first on a bar, else TP; expiry, else open ----
  for (const sig of signals) {
    const end = Math.min(n - 1, sig.index + params.expiryBars);
    let closed = false;
    for (let k = sig.index + 1; k <= end; k++) {
      if (sig.side === 'buy') {
        if (candles[k].l <= sig.sl) {
          sig.outcome = 'sl_hit';
          sig.outcomeIndex = k;
          closed = true;
          break;
        }
        if (candles[k].h >= sig.tp) {
          sig.outcome = 'tp_hit';
          sig.outcomeIndex = k;
          closed = true;
          break;
        }
      } else {
        if (candles[k].h >= sig.sl) {
          sig.outcome = 'sl_hit';
          sig.outcomeIndex = k;
          closed = true;
          break;
        }
        if (candles[k].l <= sig.tp) {
          sig.outcome = 'tp_hit';
          sig.outcomeIndex = k;
          closed = true;
          break;
        }
      }
    }
    if (!closed) {
      if (end === sig.index + params.expiryBars) {
        sig.outcome = 'expired';
        sig.outcomeIndex = end;
      } else {
        sig.outcome = 'open';
        sig.outcomeIndex = null;
      }
    }
  }

  const stats = {
    total: signals.length,
    tpHit: signals.filter((s) => s.outcome === 'tp_hit').length,
    slHit: signals.filter((s) => s.outcome === 'sl_hit').length,
    open: signals.filter((s) => s.outcome === 'open').length,
    expired: signals.filter((s) => s.outcome === 'expired').length,
    tpRate: null,
  };
  if (stats.tpHit + stats.slHit > 0) {
    stats.tpRate = stats.tpHit / (stats.tpHit + stats.slHit);
  }

  // ---- Checklist: latest-bar state ----
  const last = candles[n - 1];
  const lastIndex = n - 1;
  const finalTrend = trendAt[lastIndex];

  let zoneDetail;
  let zoneOk = false;
  if (finalTrend === 'none') {
    zoneDetail = 'No clear trend — no trend-side zone';
  } else {
    const wantSide = finalTrend === 'up' ? 'demand' : 'supply';
    const active = zones.filter(
      (z) =>
        z.side === wantSide &&
        z.createdIndex <= lastIndex &&
        (z.mitigatedIndex === null || z.mitigatedIndex > lastIndex),
    );
    if (active.length === 0) {
      zoneDetail = wantSide === 'demand' ? 'No active demand zone' : 'No active supply zone';
    } else {
      const dist = (z) =>
        last.c >= z.bottom && last.c <= z.top
          ? 0
          : Math.min(Math.abs(last.c - z.bottom), Math.abs(last.c - z.top));
      active.sort((a, b) => dist(a) - dist(b));
      const nearest = active[0];
      zoneOk = true;
      zoneDetail = `${wantSide === 'demand' ? 'Demand' : 'Supply'} zone ${fmt(nearest.bottom)} – ${fmt(nearest.top)}`;
    }
  }

  let liqDetail;
  if (liquidity.length === 0) {
    liqDetail = 'No liquidity levels';
  } else {
    const unswept = liquidity.filter((p) => !p.swept);
    if (unswept.length === 0) {
      liqDetail = 'All liquidity levels swept';
    } else {
      unswept.sort((a, b) => Math.abs(a.level - last.c) - Math.abs(b.level - last.c));
      const nearest = unswept[0];
      const where =
        nearest.level > last.c ? 'above' : nearest.level < last.c ? 'below' : 'at current price';
      liqDetail = `Unswept ${nearest.side === 'ssl' ? 'sell-side' : 'buy-side'} liquidity (${nearest.side.toUpperCase()}) at ${fmt(nearest.level)} ${where}`;
    }
  }

  let sweepDetail;
  let sweepOk = false;
  if (finalTrend === 'up') {
    sweepOk = sellSwept;
    sweepDetail = sellSwept
      ? 'Sell-side liquidity swept — awaiting rejection'
      : 'Sell-side liquidity not swept yet';
  } else if (finalTrend === 'down') {
    sweepOk = buySwept;
    sweepDetail = buySwept
      ? 'Buy-side liquidity swept — awaiting rejection'
      : 'Buy-side liquidity not swept yet';
  } else {
    sweepDetail = 'No trend — sweep not applicable';
  }

  let rejectionDetail;
  let rejectionOk = false;
  if (setup) {
    rejectionOk = true;
    rejectionDetail =
      setup.side === 'buy'
        ? `Buy setup armed at ${fmt(setup.setupLevel)} — awaiting retest`
        : `Sell setup armed at ${fmt(setup.setupLevel)} — awaiting retest`;
  } else if (lastQualRejection && lastQualRejection.bar === lastIndex) {
    rejectionOk = true;
    rejectionDetail =
      lastQualRejection.side === 'buy'
        ? 'Bullish rejection on latest bar'
        : 'Bearish rejection on latest bar';
  } else {
    rejectionDetail = 'No rejection candle at a zone';
  }

  let retestDetail;
  let retestOk = false;
  if (!params.requireRetest) {
    retestOk = true;
    retestDetail = 'Entry fires on first rejection';
  } else {
    const lastSignal = signals.length > 0 ? signals[signals.length - 1] : null;
    if (lastSignal && lastIndex - lastSignal.index <= params.retestBars) {
      retestOk = true;
      retestDetail = `Last signal confirmed by retest ${lastIndex - lastSignal.index} bars ago`;
    } else {
      retestDetail = 'Waiting for retest confirmation';
    }
  }

  const checklist = [
    {
      key: 'trend',
      label: 'Trend direction',
      ok: finalTrend !== 'none',
      detail:
        finalTrend === 'up' ? 'Uptrend' : finalTrend === 'down' ? 'Downtrend' : 'No clear trend',
    },
    { key: 'zone', label: 'Zone on trend side', ok: zoneOk, detail: zoneDetail },
    {
      key: 'liquidity',
      label: 'Liquidity level',
      ok: liquidity.length > 0,
      detail: liqDetail,
    },
    { key: 'sweep', label: 'Liquidity swept', ok: sweepOk, detail: sweepDetail },
    { key: 'rejection', label: 'Rejection candle', ok: rejectionOk, detail: rejectionDetail },
    { key: 'retest', label: 'Retest confirmation', ok: retestOk, detail: retestDetail },
  ];

  return {
    params,
    atr: atrArr.length > 0 ? atrArr[atrArr.length - 1] : null,
    trend: finalTrend,
    pivots,
    events,
    zones,
    fvgs,
    liquidity,
    signals,
    checklist,
    stats,
  };
}
