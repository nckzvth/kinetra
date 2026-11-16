import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import {
  acceptFriend,
  addFriend,
  clearPendingInvite,
  consumeInviteParam,
  profileByUsername,
  getMyProfile,
  inviteLink,
  isUsernameFree,
  listFriends,
  removeFriendship,
  saveMyProfile,
  searchProfiles,
  subscribeSocial,
  suggestUsername,
  USERNAME_RE,
  type FriendEntry,
  type PublicProfile,
} from '../data/social'
import { SignInForm } from './Account'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

export function Avatar({ p, size = 40 }: { p: Pick<PublicProfile, 'display_name' | 'username' | 'avatar_url'> | null; size?: number }) {
  const initial = (p?.display_name || p?.username || '?').slice(0, 1).toUpperCase()
  return p?.avatar_url ? (
    <img className="avatar" src={p.avatar_url} alt="" referrerPolicy="no-referrer" style={{ width: size, height: size }} />
  ) : (
    <span className="avatar avatar-fallback" style={{ width: size, height: size, fontSize: size * 0.42 }} aria-hidden="true">{initial}</span>
  )
}

const sessionMeta = (s: Session) => {
  const m = (s.user.user_metadata ?? {}) as { full_name?: string; name?: string; avatar_url?: string; picture?: string }
  return { name: (m.full_name ?? m.name ?? '').trim(), avatar: m.avatar_url ?? m.picture ?? null }
}

/** You → Friends: your public profile, privacy, adding friends, requests and your friend list. */
export function FriendsPage({ session, notify }: { session: Session | null; notify: (m: string) => void }) {
  const [profile, setProfile] = useState<PublicProfile | null | undefined>(undefined)
  const [entries, setEntries] = useState<FriendEntry[]>([])
  const [editing, setEditing] = useState(false)
  const [removing, setRemoving] = useState<FriendEntry | null>(null)
  const [loadError, setLoadError] = useState(false)

  const reload = useCallback(async () => {
    if (!session) return
    try {
      const [p, f] = await Promise.all([getMyProfile(), listFriends()])
      setProfile(p)
      setEntries(f.entries)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [session])

  useEffect(() => {
    void reload()
    let off = () => {}
    void subscribeSocial(() => void reload()).then((u) => (off = u))
    return () => off()
  }, [reload])

  if (!session)
    return (
      <>
        <h1 className="page-title">Friends</h1>
        <p className="muted" style={{ margin: '8px 4px 18px' }}>Sign in to add friends, see when they're training and cheer each other on.</p>
        <SignInForm notify={notify} />
      </>
    )

  if (loadError && profile === undefined)
    return (
      <>
        <h1 className="page-title">Friends</h1>
        <div className="card empty" style={{ marginTop: 18 }}>
          <p style={{ fontWeight: 600, color: 'var(--text)' }}>Couldn't load your friends</p>
          <p className="small" style={{ marginTop: 4 }}>Check your connection and try again.</p>
          <button className="btn sm tint" style={{ marginTop: 14 }} onClick={() => void reload()}>Try again</button>
        </div>
      </>
    )
  if (profile === undefined) return <div className="empty"><span className="spinner" style={{ margin: '0 auto' }} /></div>

  if (!profile || editing)
    return (
      <ProfileSetup
        session={session}
        existing={profile}
        onSaved={() => {
          setEditing(false)
          void reload()
          notify(profile ? 'Profile updated' : "You're all set — invite a friend")
        }}
        onCancel={profile ? () => setEditing(false) : undefined}
      />
    )

  const incoming = entries.filter((e) => e.direction === 'incoming')
  const outgoing = entries.filter((e) => e.direction === 'outgoing')
  const friends = entries.filter((e) => e.direction === 'friend')

  return (
    <>
      <h1 className="page-title">Friends</h1>

      <div className="card" style={{ marginTop: 18 }}>
        <div className="cell" style={{ gap: 14 }}>
          <Avatar p={profile} size={52} />
          <div className="grow">
            <div style={{ fontWeight: 700, fontSize: 18 }}>{profile.display_name || profile.username}</div>
            <div className="small muted">@{profile.username}</div>
          </div>
          <button className="btn sm" onClick={() => setEditing(true)}>Edit</button>
        </div>
        <InviteRow username={profile.username} notify={notify} />
      </div>

      <AddFriend entries={entries} onChanged={() => void reload()} notify={notify} />

      {incoming.length > 0 && (
        <>
          <div className="group-header">Requests · {incoming.length}</div>
          <div className="card list">
            {incoming.map((e) => (
              <div key={e.friendship.id} className="cell">
                <Avatar p={e.profile} />
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600 }}>{e.profile.display_name || e.profile.username}</span>
                  <span className="tiny muted">@{e.profile.username} wants to be friends</span>
                </span>
                <button className="btn sm tint" onClick={async () => { await acceptFriend(e.friendship.id); notify(`You and ${e.profile.display_name || e.profile.username} are now friends`); void reload() }}>Accept</button>
                <button className="icon-btn" aria-label="Decline" onClick={async () => { await removeFriendship(e.friendship.id); void reload() }}><Icon name="x" size={18} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="group-header">Friends{friends.length ? ` · ${friends.length}` : ''}</div>
      {friends.length === 0 ? (
        <div className="card empty small">No friends yet. Search above or share your invite link.</div>
      ) : (
        <div className="card list">
          {friends.map((e) => (
            <div key={e.friendship.id} className="cell">
              <Avatar p={e.profile} />
              <span className="grow">
                <span style={{ display: 'block', fontWeight: 600 }}>{e.profile.display_name || e.profile.username}</span>
                <span className="tiny muted">@{e.profile.username}</span>
              </span>
              <button className="icon-btn" aria-label={`Options for ${e.profile.username}`} onClick={() => setRemoving(e)}><Icon name="more" size={20} /></button>
            </div>
          ))}
        </div>
      )}

      {outgoing.length > 0 && (
        <>
          <div className="group-header">Sent</div>
          <div className="card list">
            {outgoing.map((e) => (
              <div key={e.friendship.id} className="cell">
                <Avatar p={e.profile} size={32} />
                <span className="grow small">@{e.profile.username}</span>
                <button className="btn sm ghost" onClick={async () => { await removeFriendship(e.friendship.id); void reload() }}>Cancel request</button>
              </div>
            ))}
          </div>
        </>
      )}

      <PrivacyCard profile={profile} onChanged={() => void reload()} />

      {removing && (
        <Sheet title={removing.profile.display_name || `@${removing.profile.username}`} onClose={() => setRemoving(null)}>
          <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px' }}>You'll stop seeing each other's workouts. You can add them again any time.</p>
          <div className="stack" style={{ gap: 8 }}>
            <button className="btn block" style={{ color: 'var(--danger)', background: 'var(--surface)' }} onClick={async () => { await removeFriendship(removing.friendship.id); setRemoving(null); void reload() }}>Remove friend</button>
            <button className="btn block" style={{ background: 'var(--surface)' }} onClick={() => setRemoving(null)}>Cancel</button>
          </div>
        </Sheet>
      )}
    </>
  )
}

function InviteRow({ username, notify }: { username: string; notify: (m: string) => void }) {
  const link = inviteLink(username)
  const share = async () => {
    const data = { title: 'Train with me on Kinetra', text: `Add me on Kinetra: @${username}`, url: link }
    try {
      if (navigator.share) await navigator.share(data)
      else {
        await navigator.clipboard.writeText(link)
        notify('Invite link copied')
      }
    } catch {
      /* share sheet dismissed */
    }
  }
  return (
    <button className="cell link" style={{ boxShadow: 'inset 16px 0.5px 0 0 var(--surface), inset 0 0.5px 0 0 var(--line-strong)' }} onClick={() => void share()}>
      <Icon name="external" /> Invite friends
      <span className="tiny muted" style={{ marginLeft: 'auto' }}>Share your link</span>
    </button>
  )
}

function AddFriend({ entries, onChanged, notify }: { entries: FriendEntry[]; onChanged: () => void; notify: (m: string) => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<PublicProfile[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) return setResults([])
    const t = setTimeout(() => void searchProfiles(term).then(setResults).catch(() => setResults([])), 250)
    return () => clearTimeout(t)
  }, [q])
  const statusOf = (id: string) => entries.find((e) => e.profile.user_id === id)?.direction

  return (
    <>
      <div className="group-header">Add a friend</div>
      <div className="row" style={{ background: 'var(--surface)', borderRadius: 12, padding: '0 12px' }}>
        <Icon name="search" size={17} className="faint" />
        <input className="input" style={{ background: 'transparent', padding: 0 }} placeholder="Search by name or @username" value={q} onChange={(e) => setQ(e.target.value)} autoCapitalize="none" autoCorrect="off" />
      </div>
      {results.length > 0 && (
        <div className="card list" style={{ marginTop: 8 }}>
          {results.map((p) => {
            const st = statusOf(p.user_id)
            return (
              <div key={p.user_id} className="cell">
                <Avatar p={p} />
                <span className="grow">
                  <span style={{ display: 'block', fontWeight: 600 }}>{p.display_name || p.username}</span>
                  <span className="tiny muted">@{p.username}</span>
                </span>
                {st === 'friend' ? (
                  <span className="chip accent">Friends</span>
                ) : st === 'outgoing' ? (
                  <span className="chip">Requested</span>
                ) : (
                  <button
                    className="btn sm tint"
                    disabled={busy === p.user_id}
                    onClick={async () => {
                      setBusy(p.user_id)
                      try {
                        const r = await addFriend(p.user_id)
                        notify(r === 'accepted' ? `You and ${p.display_name || p.username} are now friends` : 'Request sent')
                        onChanged()
                      } catch (e) {
                        notify(e instanceof Error ? e.message : "Couldn't send request")
                      } finally {
                        setBusy(null)
                      }
                    }}
                  >
                    {st === 'incoming' ? 'Accept' : 'Add'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
      {q.trim().length >= 2 && results.length === 0 && <p className="group-footer">No one found. Try their exact @username, or send them your invite link.</p>}
    </>
  )
}

function PrivacyCard({ profile, onChanged }: { profile: PublicProfile; onChanged: () => void }) {
  const set = async (patch: Partial<PublicProfile>) => {
    await saveMyProfile({ ...profile, ...patch })
    onChanged()
  }
  return (
    <>
      <div className="group-header">Privacy</div>
      <div className="card list">
        <div className="cell">
          <span className="grow">Share my workouts<span className="tiny muted" style={{ display: 'block' }}>Friends see finished sessions and when you're training</span></span>
          <button className="switch" role="switch" aria-checked={profile.share_activity} aria-label="Share my workouts" onClick={() => void set({ share_activity: !profile.share_activity })} />
        </div>
        <div className="cell">
          <span className="grow">Show my weights<span className="tiny muted" style={{ display: 'block' }}>Include the weights you lift in what friends see</span></span>
          <button className="switch" role="switch" aria-checked={profile.share_weights} aria-label="Show my weights" onClick={() => void set({ share_weights: !profile.share_weights })} />
        </div>
      </div>
      <p className="group-footer">Only accepted friends ever see your activity. Notes are private between you and the sender.</p>
    </>
  )
}

export function ProfileSetup({ session, existing, onSaved, onCancel }: { session: Session; existing: PublicProfile | null; onSaved: () => void; onCancel?: () => void }) {
  const meta = sessionMeta(session)
  const [name, setName] = useState(existing?.display_name ?? meta.name)
  const [username, setUsername] = useState(existing?.username ?? suggestUsername(meta.name, session.user.email))
  const [state, setState] = useState<'idle' | 'checking' | 'free' | 'taken' | 'invalid'>('idle')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!USERNAME_RE.test(username)) return setState('invalid')
    if (existing?.username === username) return setState('free')
    setState('checking')
    const t = setTimeout(() => void isUsernameFree(username).then((ok) => setState(ok ? 'free' : 'taken')), 350)
    return () => clearTimeout(t)
  }, [username, existing?.username])

  return (
    <>
      <h1 className="page-title">{existing ? 'Edit profile' : 'Your friend profile'}</h1>
      <p className="muted" style={{ margin: '8px 4px 18px' }}>
        {existing ? 'This is how friends find and see you.' : 'Pick how friends find you. You can change it later.'}
      </p>
      <div className="row" style={{ justifyContent: 'center', marginBottom: 16 }}>
        <Avatar p={{ display_name: name, username, avatar_url: existing?.avatar_url ?? meta.avatar }} size={72} />
      </div>
      <div className="card list">
        <div className="cell">
          <span style={{ width: 92 }}>Name</span>
          <input className="inline-input" style={{ textAlign: 'left', color: 'var(--text)' }} value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="cell">
          <span style={{ width: 92 }}>Username</span>
          <span className="muted">@</span>
          <input
            className="inline-input"
            style={{ textAlign: 'left', color: 'var(--text)' }}
            value={username}
            onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20))}
            autoCapitalize="none"
            autoCorrect="off"
          />
          <span className="tiny" style={{ whiteSpace: 'nowrap', color: state === 'free' ? 'var(--accent-text)' : state === 'checking' ? 'var(--text-2)' : 'var(--danger)' }}>
            {state === 'free' ? 'Available' : state === 'checking' ? 'Checking…' : state === 'taken' ? 'Taken' : state === 'invalid' ? '3–20 letters' : ''}
          </span>
        </div>
      </div>
      <p className="group-footer">Lowercase letters, numbers and underscores.</p>
      {error && <p className="small" style={{ color: 'var(--danger)', margin: '10px 4px 0' }}>{error}</p>}
      <button
        className="btn tint lg block"
        style={{ marginTop: 18 }}
        disabled={busy || state !== 'free' || !name.trim()}
        onClick={async () => {
          setBusy(true)
          setError(null)
          try {
            await saveMyProfile({
              username,
              display_name: name.trim(),
              avatar_url: existing?.avatar_url ?? meta.avatar,
              share_activity: existing?.share_activity ?? true,
              share_weights: existing?.share_weights ?? false,
            })
            onSaved()
          } catch (e) {
            setError(e instanceof Error ? e.message : "Couldn't save")
          } finally {
            setBusy(false)
          }
        }}
      >
        {existing ? 'Save' : 'Continue'}
      </button>
      {onCancel && <button className="btn ghost block" onClick={onCancel}>Cancel</button>}
    </>
  )
}

/**
 * Handles ?invite=username links: sign in if needed, create a friend profile if needed, then
 * one tap to add. The invite survives the sign-in redirect.
 */
export function InviteHandler({ session, notify }: { session: Session | null; notify: (m: string) => void }) {
  const [username, setUsername] = useState<string | null>(consumeInviteParam)
  const [target, setTarget] = useState<PublicProfile | null | undefined>(undefined)
  const [mine, setMine] = useState<PublicProfile | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!username || !session) return
    void profileByUsername(username).then(setTarget)
    void getMyProfile().then(setMine)
  }, [username, session])

  if (!username) return null
  const close = () => {
    clearPendingInvite()
    setUsername(null)
  }

  if (!session)
    return (
      <Sheet title={`Join @${username} on Kinetra`} onClose={close} right={<button className="btn ghost" onClick={close}>Later</button>}>
        <p className="small muted" style={{ margin: '0 4px 16px', lineHeight: 1.45 }}>Sign in or create an account to become friends, see each other's training and cheer each other on.</p>
        <SignInForm notify={notify} />
      </Sheet>
    )

  if (target === undefined || mine === undefined)
    return (
      <Sheet onClose={close}>
        <div className="empty"><span className="spinner" style={{ margin: '0 auto' }} /></div>
      </Sheet>
    )

  if (!target || target.user_id === session.user.id)
    return (
      <Sheet title={target ? "That's your own invite" : 'Invite not found'} onClose={close}>
        <p className="muted" style={{ textAlign: 'center', margin: '0 8px 18px' }}>
          {target ? 'Send this link to a friend so they can add you.' : `There's no one called @${username}. Check the link with whoever sent it.`}
        </p>
        <button className="btn block" style={{ background: 'var(--surface)' }} onClick={close}>OK</button>
      </Sheet>
    )

  if (!mine)
    return (
      <Sheet onClose={close} right={<button className="btn ghost" onClick={close}>Later</button>}>
        <ProfileSetup session={session} existing={null} onSaved={() => void getMyProfile().then(setMine)} />
      </Sheet>
    )

  return (
    <Sheet onClose={close}>
      <div style={{ textAlign: 'center', padding: '10px 4px 0' }}>
        <div className="row" style={{ justifyContent: 'center' }}><Avatar p={target} size={72} /></div>
        <h3 style={{ fontSize: 22, fontWeight: 700, marginTop: 12 }}>{target.display_name || `@${target.username}`}</h3>
        <p className="muted" style={{ margin: '2px 0 20px' }}>@{target.username} invited you to train together</p>
      </div>
      <div className="stack" style={{ gap: 8 }}>
        <button
          className="btn tint lg block"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try {
              const r = await addFriend(target.user_id)
              notify(r === 'accepted' ? `You and ${target.display_name || target.username} are now friends` : `Request sent to @${target.username}`)
              close()
            } catch (e) {
              notify(e instanceof Error ? e.message : "Couldn't add friend")
              setBusy(false)
            }
          }}
        >
          Add friend
        </button>
        <button className="btn ghost block" onClick={close}>Not now</button>
      </div>
    </Sheet>
  )
}
