import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { authConfigured } from '../lib/supabase'

export default function AuthModal({ onClose, initialMode = 'login' }) {
  const { signIn, signUp, signInWithGoogle, resetPassword, updatePassword, clearRecovery } =
    useAuth()
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
        else setNotice('Account created — check your email to confirm it, then log in.')
      } else if (mode === 'forgot') {
        const { error: err } = await resetPassword(email.trim())
        if (err) throw err
        setNotice(
          'If an account exists for that email, a password reset link is on its way. Check your inbox.'
        )
      } else if (mode === 'newpassword') {
        if (password !== confirm) throw new Error('The two passwords do not match.')
        const { error: err } = await updatePassword(password)
        if (err) throw err
        handleClose()
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.')
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
    login: 'Log in to TickPin',
    signup: 'Create your TickPin account',
    forgot: 'Reset your password',
    newpassword: 'Choose a new password',
  }

  return (
    <div className="modal-backdrop" onClick={handleClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={handleClose} aria-label="Close">
          ×
        </button>
        <h3>{titles[mode]}</h3>
        {!authConfigured && (
          <p className="error">Accounts are being set up — please check back shortly.</p>
        )}
        {(mode === 'login' || mode === 'signup') && (
          <>
            <button className="google-btn" onClick={handleGoogle} disabled={!authConfigured || busy}>
              Continue with Google
            </button>
            <div className="modal-divider">or with email</div>
          </>
        )}
        {mode === 'forgot' && (
          <p className="notice">
            Enter the email you signed up with and we will send you a link to set a new password.
          </p>
        )}
        {mode === 'newpassword' && (
          <p className="notice">Almost there — pick a new password for your account.</p>
        )}
        <form onSubmit={handleSubmit}>
          {mode !== 'newpassword' && (
            <input
              type="email"
              required
              placeholder="Email address"
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
              placeholder={mode === 'newpassword' ? 'New password' : 'Password'}
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
              placeholder="Repeat new password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              autoComplete="new-password"
            />
          )}
          {mode === 'login' && (
            <p className="modal-switch">
              <button type="button" onClick={() => switchMode('forgot')}>
                Forgot your password?
              </button>
            </p>
          )}
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <button type="submit" className="primary-btn" disabled={!authConfigured || busy}>
            {busy
              ? 'Please wait…'
              : mode === 'login'
                ? 'Log in'
                : mode === 'signup'
                  ? 'Sign up'
                  : mode === 'forgot'
                    ? 'Send reset link'
                    : 'Save new password'}
          </button>
        </form>
        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
          <p className="modal-switch">
            {mode === 'login' ? (
              <>
                New here? <button onClick={() => switchMode('signup')}>Create an account</button>
              </>
            ) : (
              <>
                Already have an account? <button onClick={() => switchMode('login')}>Log in</button>
              </>
            )}
          </p>
        )}
      </div>
    </div>
  )
}
