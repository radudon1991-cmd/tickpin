import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function AdminPanel() {
  const { user } = useAuth()
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
          ? `Make ${member.email} an admin? Admins can manage members.`
          : `Remove admin from ${member.email}?`,
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

  return (
    <section className="admin-panel">
      <h2>Admin — Members</h2>
      {error && <p className="error">{error}</p>}
      {members === null && !error && <p>Loading members…</p>}
      {members && (
        <>
          <p>
            {members.length} member{members.length === 1 ? '' : 's'} ·{' '}
            {members.filter((m) => m.is_admin).length} admin
            {members.filter((m) => m.is_admin).length === 1 ? '' : 's'}
          </p>
          <table>
            <thead>
              <tr>
                <th>Member</th>
                <th>Email</th>
                <th>Joined</th>
                <th>Role</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <td>{m.display_name || '—'}</td>
                  <td>{m.email}</td>
                  <td>{m.created_at?.slice(0, 10)}</td>
                  <td>{m.is_admin ? 'Admin' : 'Member'}</td>
                  <td>
                    {m.id !== user?.id && (
                      <button onClick={() => toggleAdmin(m)} disabled={busyId === m.id}>
                        {m.is_admin ? 'Remove admin' : 'Make admin'}
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
