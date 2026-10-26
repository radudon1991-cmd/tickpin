import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { useLang } from '../lib/i18n'

export default function AdminPanel() {
  const { user } = useAuth()
  const { lang, t } = useLang()
  const [members, setMembers] = useState(null)
  const [error, setError] = useState(null)
  const [busyId, setBusyId] = useState(null)

  async function load() {
    const { data, error: err } = await supabase
      .from('profiles')
      .select('id, email, display_name, is_admin, created_at')
      .order('created_at', { ascending: true })
    if (err) setError(err.message)
    else setMembers(data)
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleAdmin(member) {
    const next = !member.is_admin
    if (
      !window.confirm(
        next
          ? t('admin.confirmMake', { email: member.email })
          : t('admin.confirmRemove', { email: member.email }),
      )
    )
      return
    setBusyId(member.id)
    const { error: err } = await supabase
      .from('profiles')
      .update({ is_admin: next })
      .eq('id', member.id)
    setBusyId(null)
    if (err) setError(err.message)
    else load()
  }

  const adminCount = members ? members.filter((m) => m.is_admin).length : 0

  return (
    <section className="admin-panel">
      <h2>{t('admin.title')}</h2>
      {error && <p className="error">{error}</p>}
      {members === null && !error && <p>{t('admin.loading')}</p>}
      {members && (
        <>
          <p>
            {t('admin.countLine', {
              members: members.length,
              ms: lang === 'en' ? (members.length === 1 ? '' : 's') : '',
              admins: adminCount,
              as: lang === 'en' ? (adminCount === 1 ? '' : 's') : '',
            })}
          </p>
          <table>
            <thead>
              <tr>
                <th>{t('admin.colMember')}</th>
                <th>{t('admin.colEmail')}</th>
                <th>{t('admin.colJoined')}</th>
                <th>{t('admin.colRole')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.display_name || '—'}</td>
                  <td>{m.email}</td>
                  <td>{m.created_at?.slice(0, 10)}</td>
                  <td>{m.is_admin ? t('admin.roleAdmin') : t('admin.roleMember')}</td>
                  <td>
                    {m.id !== user?.id && (
                      <button onClick={() => toggleAdmin(m)} disabled={busyId === m.id}>
                        {m.is_admin ? t('admin.removeAdmin') : t('admin.makeAdmin')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  )
}
