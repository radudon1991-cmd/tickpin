import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { authConfigured } from '../lib/supabase'
import { useLang } from '../lib/i18n'

export default function AuthModal({ onClose, initialMode = 'login' }) {
  const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword, clearRecovery } =
    useAuth()
  const { t } = useLang()
  const [mode, setMode] = useState(initialMode) // login | signup | forgot | newpassword
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  function handleClose() {
    clearRecovery()
    onClose()
  }

  function switchMode(next) {
    setMode(next)
    setError(null)
    setNotice(null)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email.trim(), password)
        if (err) throw err
        handleClose()
      } else if (mode === 'signup') {
        const { data, error: err } = await signUp(email.trim(), password)
        if (err) throw err
        if (data.session) handleClose()
        else setNotice(t('auth.accountCreated'))
      } else if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim())
        if (err) throw err
        setNotice(t('auth.resetSent'))
      } else if (mode === 'newpassword') {
        if (password !== confirm) throw new Error(t('auth.passwordMismatch'))
        const { error: err } = await updatePassword(password)
        if (err) throw err
        handleClose()
      }
    } catch (err) {
      setError(err.message || t('auth.genericError'))
    } finally {
      setBusy(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    const { error: err } = await signInWithGoogle()
    if (err) setError(err.message)
  }

  const titles = {
    login: t('auth.titleLogin'),
    signup: t('auth.titleSignup'),
    forgot: t('auth.titleForgot'),
    newpassword: t('auth.titleNewPassword'),
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label={t('auth.close')}>
          ×
        </button>
        <h3>{titles[mode]}</h3>
        {!authConfigured && <p className="error">{t('auth.notConfigured')}</p>}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <button className="google-btn" onClick={handleGoogle} disabled={!authConfigured || busy}>
              {t('auth.continueGoogle')}
            </button>
            <div className="modal-divider">{t('auth.orEmail')}</div>
          </>
        )}
        {mode === 'forgot' && <p className="notice">{t('auth.forgotIntro')}</p>}
        {mode === 'newpassword' && <p className="notice">{t('auth.newPasswordIntro')}</p>}
        <form onSubmit={handleSubmit}>
          {mode !== 'newpassword' && (
            <input
              type="email"
              required
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          )}
          {mode !== 'forgot' && (
            <input
              type="password"
              required
              minLength={6}
              placeholder={
                mode === 'newpassword'
                  ? t('auth.newPasswordPlaceholder')
                  : t('auth.passwordPlaceholder')
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          )}
          {mode === 'newpassword' && (
            <input
              type="password"
              required
              minLength={6}
              placeholder={t('auth.repeatPasswordPlaceholder')}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
          {mode === 'login' && (
            <p className="modal-switch">
              <button type="button" onClick={() => switchMode('forgot')}>
                {t('auth.forgotLink')}
              </button>
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <button type="submit" className="primary-btn" disabled={!authConfigured || busy}>
            {busy
              ? t('auth.pleaseWait')
              : mode === 'login'
                ? t('auth.login')
                : mode === 'signup'
                  ? t('auth.signup')
                  : mode === 'forgot'
                    ? t('auth.sendResetLink')
                    : t('auth.saveNewPassword')}
          </button>
        </form>
        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
          <p className="modal-switch">
            {mode === 'login' ? (
              <>
                {t('auth.newHere')}{' '}
                <button onClick={() => switchMode('signup')}>{t('auth.createAccount')}</button>
              </>
            ) : (
              <>
                {t('auth.alreadyHave')}{' '}
                <button onClick={() => switchMode('login')}>{t('auth.login')}</button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
