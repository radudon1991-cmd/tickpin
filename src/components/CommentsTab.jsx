import { useCallback, useEffect, useState } from 'react'
import { supabase, authConfigured } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useLang } from '../lib/i18n.jsx'
import { timeAgo } from '../lib/news'

// Per-stock comments (Boss's request, 2026-10-28, modelled on Yahoo
// Finance's Conversations tab): anyone can read; members post under
// their display name; authors can delete their own comments and
// admins can delete any. Comments older than 6 months are removed
// automatically by a nightly database job (see
// supabase/comments_schema.sql), so the section stays fresh.

const LINK_RE = /(https?:\/\/|www\.)/i
const MAX_LEN = 500

export default function CommentsTab({ ticker, onLogin }) {
  const { t } = useLang()
  const { user, profile, isAdmin } = useAuth()
  const [rows, setRows] = useState(null)
  const [state, setState] = useState('loading') // loading|ok|error
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [postError, setPostError] = useState('')

  const load = useCallback(async () => {
    if (!authConfigured || !ticker) return
    const { data, error } = await supabase
      .from('comments')
      .select('id, ticker, user_id, display_name, body, created_at')
      .eq('ticker', ticker)
      .order('created_at', { ascending: false })
      .limit(200)
    if (error) {
      setState('error')
      return
    }
    setRows(data || [])
    setState('ok')
  }, [ticker])

  useEffect(() => {
    setRows(null)
    setState('loading')
    setDraft('')
    setPostError('')
    load()
  }, [load])

  const myName =
    profile?.display_name || (user?.email ? user.email.split('@')[0] : '')

  async function post(e) {
    e.preventDefault()
    const body = draft.trim()
    if (!body || !user) return
    if (LINK_RE.test(body)) {
      setPostError(t('comments.noLinks'))
      return
    }
    setPosting(true)
    setPostError('')
    const { data, error } = await supabase
      .from('comments')
      .insert({ ticker, user_id: user.id, display_name: myName, body })
      .select('id, ticker, user_id, display_name, body, created_at')
      .single()
    setPosting(false)
    if (error) {
      setPostError(t('comments.postError'))
      return
    }
    setDraft('')
    setRows((prev) => [data, ...(prev || [])])
  }

  async function remove(id) {
    const { error } = await supabase.from('comments').delete().eq('id', id)
    if (!error) setRows((prev) => (prev || []).filter((r) => r.id !== id))
  }

  return (
    <div className="comments">
      {user ? (
        <form className="comment-compose" onSubmit={post}>
          <div className="comment-compose-head">
            <span className="comment-avatar" aria-hidden="true">
              {(myName || '?').slice(0, 1).toUpperCase()}
            </span>
            <span className="comment-author-name">{myName}</span>
            {isAdmin && <span className="comment-admin-badge">{t('comments.admin')}</span>}
          </div>
          <textarea
            className="comment-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t('comments.placeholder', { ticker })}
            maxLength={MAX_LEN}
            rows={3}
          />
          <div className="comment-compose-foot">
            <span className="comment-count">
              {draft.length}/{MAX_LEN}
            </span>
            {postError && <span className="comment-error">{postError}</span>}
            <button
              type="submit"
              className="primary-btn small"
              disabled={posting || draft.trim().length === 0}
            >
              {posting ? t('comments.posting') : t('comments.post')}
            </button>
          </div>
        </form>
      ) : (
        <div className="comment-signin">
          <p>{t('comments.signin')}</p>
          <button className="primary-btn small" onClick={onLogin}>
            {t('nav.login')}
          </button>
        </div>
      )}

      {state === 'loading' && <p>{t('comments.loading', { ticker })}</p>}
      {state === 'error' && <p className="error">{t('comments.error', { ticker })}</p>}
      {state === 'ok' && rows && rows.length === 0 && (
        <p>{t('comments.none', { ticker })}</p>
      )}
      {state === 'ok' && rows && rows.length > 0 && (
        <div className="comment-list">
          {rows.map((r) => {
            const mine = user && r.user_id === user.id
            const canDelete = mine || isAdmin
            return (
              <article className="comment-card" key={r.id}>
                <div className="comment-meta">
                  <span className="comment-avatar" aria-hidden="true">
                    {(r.display_name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="comment-author-name">
                    {r.display_name || '—'}
                  </span>
                  {mine && <span className="comment-you">{t('comments.you')}</span>}
                  <span className="comment-time">
                    {timeAgo(Math.floor(new Date(r.created_at).getTime() / 1000))}
                  </span>
                  {canDelete && (
                    <button
                      type="button"
                      className="comment-delete"
                      onClick={() => remove(r.id)}
                    >
                      {t('comments.delete')}
                    </button>
                  )}
                </div>
                <p className="comment-body">{r.body}</p>
              </article>
            )
          })}
        </div>
      )}

      <p className="source-note">{t('comments.note')}</p>
    </div>
  )
}
