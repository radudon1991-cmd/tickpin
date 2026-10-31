// SMC user settings: presets, display toggles, position sizer, and
// named profiles — all saved per device in localStorage (same pattern
// as chart drawings and translate languages). No backend, no cost.
//
// A settings object:
// {
//   params:    engine params (see DEFAULT_PARAMS in ./smc.js),
//   timeframe: 'daily' | 'weekly',
//   minScore:  0..6 — minimum per-signal checklist score shown,
//   statsWindow: 'all' | 50 | 20 — signals counted in the stats,
//   display:   { zones, fvgs, liquidity, tpsl, expired },
//   sizer:     { account, riskPct } — position sizing, 0 = off,
// }
import { DEFAULT_PARAMS } from './smc'

export const PRESETS = {
  v38: {
    id: 'v38',
    params: { ...DEFAULT_PARAMS },
  },
  conservative: {
    id: 'conservative',
    params: {
      ...DEFAULT_PARAMS,
      swingLen: 15,
      minorLen: 5,
      atrMult: 1.5,
      requireSweep: true,
      requireRetest: true,
      targetRR: 3,
      expiryBars: 60,
    },
  },
  aggressive: {
    id: 'aggressive',
    params: {
      ...DEFAULT_PARAMS,
      swingLen: 5,
      minorLen: 2,
      atrMult: 0.9,
      requireSweep: false,
      requireRetest: false,
      targetRR: 2,
      expiryBars: 40,
    },
  },
}

export function defaultSettings() {
  return {
    params: { ...DEFAULT_PARAMS },
    timeframe: 'daily',
    minScore: 0,
    statsWindow: 'all',
    display: { zones: true, fvgs: true, liquidity: true, tpsl: true, expired: true },
    sizer: { account: 0, riskPct: 0 },
  }
}

// Which built-in preset (if any) the params match exactly.
export function matchPreset(params) {
  for (const p of Object.values(PRESETS)) {
    const keys = Object.keys(p.params)
    if (keys.every((k) => p.params[k] === params[k])) return p.id
  }
  return null
}

// Swing sensitivity is one friendly control over two engine numbers.
export const SWING_LEVELS = [
  { id: 'strict', swingLen: 15, minorLen: 5 },
  { id: 'normal', swingLen: 10, minorLen: 3 },
  { id: 'sensitive', swingLen: 5, minorLen: 2 },
]
export function swingLevelOf(params) {
  const hit = SWING_LEVELS.find(
    (l) => l.swingLen === params.swingLen && l.minorLen === params.minorLen,
  )
  return hit ? hit.id : 'normal'
}

// ---- Profile storage -------------------------------------------------
// localStorage 'tickpin-smc-profiles':
//   { active: 'default' | <profileId>, profiles: [{ id, name, settings }] }
// 'default' means the plain V38 defaults with no user customisation.
// Any edit creates/updates an implicit working copy so changes stick
// without forcing the user to name a profile first:
// localStorage 'tickpin-smc-working': the current settings object.
// Named profiles are snapshots the user explicitly saved.
// Per-stock overrides: localStorage 'tickpin-smc-perstock':
//   { TICKER: settings } — used when the user ticks "different settings
//   for this stock"; overrides the working/profile settings entirely.

const PROFILES_KEY = 'tickpin-smc-profiles'
const WORKING_KEY = 'tickpin-smc-working'
const PERSTOCK_KEY = 'tickpin-smc-perstock'

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}
function writeJSON(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* private mode — settings just won't persist */
  }
}

function sanitize(raw) {
  const base = defaultSettings()
  if (!raw || typeof raw !== 'object') return base
  const out = { ...base, ...raw }
  out.params = { ...DEFAULT_PARAMS, ...(raw.params || {}) }
  out.display = { ...base.display, ...(raw.display || {}) }
  out.sizer = { ...base.sizer, ...(raw.sizer || {}) }
  if (out.timeframe !== 'weekly') out.timeframe = 'daily'
  out.minScore = Math.min(6, Math.max(0, Number(out.minScore) || 0))
  if (!['all', 50, 20].includes(out.statsWindow)) out.statsWindow = 'all'
  return out
}

export function loadProfiles() {
  const data = readJSON(PROFILES_KEY, { active: 'default', profiles: [] })
  if (!Array.isArray(data.profiles)) data.profiles = []
  if (typeof data.active !== 'string') data.active = 'default'
  return data
}

// The settings to use for a ticker right now: a per-stock override if
// one exists, else the saved working copy, else the defaults.
export function loadEffectiveSettings(ticker) {
  const per = readJSON(PERSTOCK_KEY, {})
  if (ticker && per[ticker]) return { settings: sanitize(per[ticker]), perStock: true }
  const working = readJSON(WORKING_KEY, null)
  if (working) return { settings: sanitize(working), perStock: false }
  return { settings: defaultSettings(), perStock: false }
}

export function saveWorkingSettings(settings) {
  writeJSON(WORKING_KEY, settings)
}

export function savePerStockSettings(ticker, settings) {
  const per = readJSON(PERSTOCK_KEY, {})
  if (settings) per[ticker] = settings
  else delete per[ticker]
  writeJSON(PERSTOCK_KEY, per)
}

export function saveProfile(name, settings) {
  const data = loadProfiles()
  const id = `p${Date.now().toString(36)}`
  data.profiles.push({ id, name, settings })
  data.active = id
  writeJSON(PROFILES_KEY, data)
  return data
}

export function deleteProfile(id) {
  const data = loadProfiles()
  data.profiles = data.profiles.filter((p) => p.id !== id)
  if (data.active === id) data.active = 'default'
  writeJSON(PROFILES_KEY, data)
  return data
}

export function setActiveProfile(id) {
  const data = loadProfiles()
  data.active = id
  writeJSON(PROFILES_KEY, data)
  return data
}

// Applying a profile or preset replaces the working copy.
export function applyToWorking(settings) {
  saveWorkingSettings(sanitize(settings))
}
