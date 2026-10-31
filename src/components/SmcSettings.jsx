import { useState } from 'react'
import { useLang } from '../lib/i18n'
import {
  PRESETS,
  SWING_LEVELS,
  defaultSettings,
  loadProfiles,
  matchPreset,
  saveProfile,
  deleteProfile,
  setActiveProfile,
  swingLevelOf,
} from '../lib/smcSettings'

// SMC settings panel (Pro feature, inside the SMC tab): presets,
// strategy knobs, display toggles, position sizer and named profiles.
// Settings live in App state; this component only renders controls and
// reports changes. Storage helpers handle persistence per device.

export default function SmcSettings({
  settings,
  onChange,
  ticker,
  perStock,
  onTogglePerStock,
}) {
  const { t } = useLang()
  const [open, setOpen] = useState(false)
  const [profilesData, setProfilesData] = useState(() => loadProfiles())
  const [saving, setSaving] = useState(false)
  const [profileName, setProfileName] = useState('')

  const params = settings.params
  const presetId = matchPreset(params)
  const activeProfile = profilesData.profiles.find((p) => p.id === profilesData.active)

  function setParams(patch) {
    onChange({ ...settings, params: { ...params, ...patch } })
    // Any manual edit means the working copy no longer IS the profile.
    if (profilesData.active !== 'custom') {
      const next = setActiveProfile('custom')
      setProfilesData(next)
    }
  }
  function setTop(patch) {
    onChange({ ...settings, ...patch })
  }
  function setDisplay(key, value) {
    onChange({ ...settings, display: { ...settings.display, [key]: value } })
  }
  function setSizer(key, value) {
    const n = Number(value)
    onChange({
      ...settings,
      sizer: { ...settings.sizer, [key]: Number.isFinite(n) && n > 0 ? n : 0 },
    })
  }

  function applyPreset(id) {
    onChange({ ...settings, params: { ...PRESETS[id].params } })
    setProfilesData(setActiveProfile('custom'))
  }

  function applyProfile(id) {
    if (id === 'custom') {
      setProfilesData(setActiveProfile('custom'))
      return
    }
    const prof = profilesData.profiles.find((p) => p.id === id)
    if (!prof) return
    setProfilesData(setActiveProfile(id))
    onChange(prof.settings)
  }

  function doSaveProfile() {
    const name = profileName.trim()
    if (!name) return
    setProfilesData(saveProfile(name, settings))
    setProfileName('')
    setSaving(false)
  }

  function doDeleteProfile() {
    if (!activeProfile) return
    setProfilesData(deleteProfile(activeProfile.id))
  }

  const sel = 'smc-set-select'
  const row = 'smc-set-row'
  const lbl = 'smc-set-label'

  return (
    <div className="smc-settings">
      <div className="smc-set-head">
        <button
          className="dash-org-btn"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
        >
          ⚙ {t('smcset.title')}
        </button>
        <span className="smc-set-summary">
          {activeProfile
            ? activeProfile.name
            : presetId
              ? t('smcset.preset.' + presetId)
              : t('smcset.custom')}
          {' · '}
          {settings.timeframe === 'weekly' ? t('smcset.tfWeekly') : t('smcset.tfDaily')}
          {perStock ? ` · ${t('smcset.perStockOn', { ticker })}` : ''}
        </span>
      </div>

      {open && (
        <div className="smc-set-panel">
          <div className={row}>
            <span className={lbl}>{t('smcset.presets')}</span>
            <span className="smc-set-btns">
              {Object.keys(PRESETS).map((id) => (
                <button
                  key={id}
                  className={`dash-org-btn${presetId === id ? ' primary' : ''}`}
                  onClick={() => applyPreset(id)}
                >
                  {t('smcset.preset.' + id)}
                </button>
              ))}
              <button
                className="dash-org-btn"
                onClick={() => onChange(defaultSettings())}
              >
                {t('smcset.reset')}
              </button>
            </span>
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.profile')}</span>
            <select
              className={sel}
              value={activeProfile ? activeProfile.id : 'custom'}
              onChange={(e) => applyProfile(e.target.value)}
            >
              <option value="custom">{t('smcset.custom')}</option>
              {profilesData.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {saving ? (
              <>
                <input
                  className="smc-set-input"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder={t('smcset.profileName')}
                  maxLength={40}
                />
                <button className="dash-org-btn primary" onClick={doSaveProfile}>
                  {t('smcset.save')}
                </button>
                <button className="dash-org-btn" onClick={() => setSaving(false)}>
                  {t('smcset.cancel')}
                </button>
              </>
            ) : (
              <button className="dash-org-btn" onClick={() => setSaving(true)}>
                {t('smcset.saveAs')}
              </button>
            )}
            {activeProfile && (
              <button className="dash-org-btn" onClick={doDeleteProfile}>
                {t('smcset.delete')}
              </button>
            )}
            <label className="smc-set-check">
              <input
                type="checkbox"
                checked={perStock}
                onChange={(e) => onTogglePerStock(e.target.checked)}
              />{' '}
              {t('smcset.perStock', { ticker })}
            </label>
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.timeframe')}</span>
            <span className="smc-set-btns">
              <button
                className={`dash-org-btn${settings.timeframe === 'daily' ? ' primary' : ''}`}
                onClick={() => setTop({ timeframe: 'daily' })}
              >
                {t('smcset.tfDaily')}
              </button>
              <button
                className={`dash-org-btn${settings.timeframe === 'weekly' ? ' primary' : ''}`}
                onClick={() => setTop({ timeframe: 'weekly' })}
              >
                {t('smcset.tfWeekly')}
              </button>
            </span>
            <span className={lbl}>{t('smcset.swing')}</span>
            <select
              className={sel}
              value={swingLevelOf(params)}
              onChange={(e) => {
                const lvl = SWING_LEVELS.find((l) => l.id === e.target.value)
                if (lvl) setParams({ swingLen: lvl.swingLen, minorLen: lvl.minorLen })
              }}
            >
              {SWING_LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {t('smcset.swing.' + l.id)}
                </option>
              ))}
            </select>
            <span className={lbl}>{t('smcset.rr')}</span>
            <select
              className={sel}
              value={String(params.targetRR)}
              onChange={(e) => setParams({ targetRR: Number(e.target.value) })}
            >
              {[1.5, 2, 2.5, 3, 4].map((v) => (
                <option key={v} value={v}>
                  {v}R
                </option>
              ))}
            </select>
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.displacement')}</span>
            <select
              className={sel}
              value={String(params.atrMult)}
              onChange={(e) => setParams({ atrMult: Number(e.target.value) })}
            >
              {[0.8, 1.0, 1.2, 1.5, 2.0].map((v) => (
                <option key={v} value={v}>
                  {v.toFixed(1)}× ATR
                </option>
              ))}
            </select>
            <span className={lbl}>{t('smcset.expiry')}</span>
            <select
              className={sel}
              value={String(params.expiryBars)}
              onChange={(e) => setParams({ expiryBars: Number(e.target.value) })}
            >
              {[20, 40, 60, 100].map((v) => (
                <option key={v} value={v}>
                  {t('smcset.bars', { n: v })}
                </option>
              ))}
            </select>
            <span className={lbl}>{t('smcset.retestWindow')}</span>
            <select
              className={sel}
              value={String(params.retestBars)}
              onChange={(e) => setParams({ retestBars: Number(e.target.value) })}
            >
              {[5, 10, 20, 40].map((v) => (
                <option key={v} value={v}>
                  {t('smcset.bars', { n: v })}
                </option>
              ))}
            </select>
            <span className={lbl}>{t('smcset.zoneWidth')}</span>
            <select
              className={sel}
              value={String(params.zoneWiden)}
              onChange={(e) => setParams({ zoneWiden: Number(e.target.value) })}
            >
              {[1, 2, 3, 5].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          <div className={row}>
            <label className="smc-set-check">
              <input
                type="checkbox"
                checked={params.requireSweep}
                onChange={(e) => setParams({ requireSweep: e.target.checked })}
              />{' '}
              {t('smcset.requireSweep')}
            </label>
            <label className="smc-set-check">
              <input
                type="checkbox"
                checked={params.requireRetest}
                onChange={(e) => setParams({ requireRetest: e.target.checked })}
              />{' '}
              {t('smcset.requireRetest')}
            </label>
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.minScore')}</span>
            <select
              className={sel}
              value={String(settings.minScore)}
              onChange={(e) => setTop({ minScore: Number(e.target.value) })}
            >
              <option value="0">{t('smcset.minScoreAny')}</option>
              <option value="4">≥ 4/6</option>
              <option value="5">≥ 5/6</option>
              <option value="6">6/6</option>
            </select>
            <span className={lbl}>{t('smcset.statsWindow')}</span>
            <select
              className={sel}
              value={String(settings.statsWindow)}
              onChange={(e) =>
                setTop({
                  statsWindow: e.target.value === 'all' ? 'all' : Number(e.target.value),
                })
              }
            >
              <option value="all">{t('smcset.statsAll')}</option>
              <option value="50">{t('smcset.statsLast', { n: 50 })}</option>
              <option value="20">{t('smcset.statsLast', { n: 20 })}</option>
            </select>
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.show')}</span>
            {['zones', 'fvgs', 'liquidity', 'tpsl', 'expired'].map((key) => (
              <label key={key} className="smc-set-check">
                <input
                  type="checkbox"
                  checked={settings.display[key]}
                  onChange={(e) => setDisplay(key, e.target.checked)}
                />{' '}
                {t('smcset.show.' + key)}
              </label>
            ))}
          </div>

          <div className={row}>
            <span className={lbl}>{t('smcset.sizer')}</span>
            <input
              className="smc-set-input sm"
              type="number"
              min="0"
              value={settings.sizer.account || ''}
              onChange={(e) => setSizer('account', e.target.value)}
              placeholder={t('smcset.accountPh')}
            />
            <input
              className="smc-set-input sm"
              type="number"
              min="0"
              step="0.25"
              value={settings.sizer.riskPct || ''}
              onChange={(e) => setSizer('riskPct', e.target.value)}
              placeholder={t('smcset.riskPh')}
            />
            <span className="smc-set-note">{t('smcset.sizerNote')}</span>
          </div>
        </div>
      )}
    </div>
  )
}
