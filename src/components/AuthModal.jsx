import { useState } from 'react'
import { useAuth } from '../lib/AuthContext'
import { authConfigured } from '../lib/supabase'

export default function AuthModal({ onClose }) {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [notice, setNotice] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'login') {
        const { error: err } = await signIn(email.trim(), password)
        if (err) throw err
        onClose()
      } else {
        const { data, error: err } = await signUp(email.trim(), password)
        if (err) throw err
        if (data.session) onClose()
        else setNotice('Account created — check your email to confirm it, then log in.')
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h3>{mode === 'login' ? 'Log in to TickPin' : 'Create your TickPin account'}</h3>
        {!authConfigured && (
          <p className="error">Accounts are being set up — please check back shortly.</p>
        )}
        <button className="google-btn" onClick={handleGoogle} disabled={!authConfigured || busy}>
          Continue with Google
        </button>
        <div className="modal-divider">or with email</div>
        <form onSubmit={handleSubmit}>
          <input
            type="email"
            required
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          <button type="submit" className="primary-btn" disabled={!authConfigured || busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
          </button>
        </form>
        <p className="modal-switch">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <button onClick={() => setMode('signup')}>Create an account</button>
            </>
          ) : (
            <>
              Already have an account? <button onClick={() => setMode('login')}>Log in</button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}
