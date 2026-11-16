import type { Session } from '@supabase/supabase-js'
import { useCallback, useEffect, useState } from 'react'
import { blockUser, loadProfilePage, sendNote, type NoteGif, type ProfilePage, type SharedActivity } from '../data/social'
import { FriendItem } from './Feed'
import { Avatar, ProfileSetup, ReportSheet } from './Friends'
import { Icon } from './Icon'
import { NoteSheet } from './Feed'
import { PostComposer, PostItem } from './Posts'
import { Sheet } from './Sheet'

/** Someone's profile: who they are, how they've been training, and their posts and workouts. */
export function ProfileSheet({
  userId,
  session,
  onClose,
  notify,
}: {
  userId: string
  session: Session | null
  onClose: () => void
  notify: (m: string) => void
}) {
  const [page, setPage] = useState<ProfilePage | null | undefined>(undefined)
  const [editing, setEditing] = useState(false)
  const [composing, setComposing] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [noteFor, setNoteFor] = useState<SharedActivity | 'direct' | null>(null)

  const reload = useCallback(() => void loadProfilePage(userId).then(setPage).catch(() => setPage(null)), [userId])
  useEffect(reload, [reload])

  const p = page?.profile
  const first = p?.display_name.split(/\s+/)[0] || p?.username || 'Friend'

  return (
    <Sheet
      title={p ? (page!.isMe ? 'Your profile' : first) : 'Profile'}
      onClose={onClose}
      left={page && !page.isMe && page.isFriend ? <button className="icon-btn" aria-label="More options" onClick={() => setMenu(true)}><Icon name="more" size={20} /></button> : undefined}
      right={<button className="btn ghost" onClick={onClose}>Done</button>}
    >
      {page === undefined ? (
        <div className="profile-skeleton" aria-busy="true">
          <span className="sk-avatar" />
          <span className="sk-line" style={{ width: 140 }} />
          <span className="sk-line" style={{ width: 90 }} />
        </div>
      ) : page === null || !p ? (
        <p className="small muted" style={{ textAlign: 'center', margin: '30px 0' }}>This profile isn’t available.</p>
      ) : (
        <>
          <div className="profile-head">
            <Avatar p={p} size={84} />
            <h2 className="profile-name">{p.display_name || `@${p.username}`}</h2>
            <span className="small muted">@{p.username}</span>
            {p.bio ? <p className="profile-bio">{p.bio}</p> : page.isMe ? <p className="profile-bio muted">Add a short bio so friends know what you’re training for.</p> : null}
            <div className="row" style={{ gap: 8, marginTop: 14, justifyContent: 'center' }}>
              {page.isMe ? (
                <>
                  <button className="btn sm" style={{ background: 'var(--surface-2)' }} onClick={() => setEditing(true)}>Edit profile</button>
                  <button className="btn sm tint" onClick={() => setComposing(true)}>New post</button>
                </>
              ) : page.isFriend ? (
                <button className="btn sm tint" onClick={() => setNoteFor('direct')}><Icon name="pencil" size={14} /> Send a note</button>
              ) : null}
            </div>
          </div>

          {(page.isMe || page.isFriend) && (
            <div className="profile-stats">
              <Stat value={page.stats.thisWeek} label="This week" />
              <Stat value={page.stats.last30} label="Last 30 days" />
              <Stat value={page.stats.streakWeeks} label={page.stats.streakWeeks === 1 ? 'Week streak' : 'Week streak'} icon={page.stats.streakWeeks >= 2} />
            </div>
          )}

          {!page.isMe && !page.isFriend ? (
            <div className="card empty" style={{ marginTop: 16 }}>
              <Icon name="shield" size={22} />
              <p className="small" style={{ marginTop: 6 }}>Only friends can see {first}’s posts and training.</p>
            </div>
          ) : page.activities.length === 0 ? (
            <div className="card empty" style={{ marginTop: 16 }}>
              <p style={{ fontWeight: 600, color: 'var(--text)' }}>Nothing yet</p>
              <p className="small" style={{ marginTop: 4 }}>{page.isMe ? 'Your posts and shared workouts show up here.' : `${first}’s posts and workouts will show up here.`}</p>
            </div>
          ) : (
            <>
              <div className="group-header" style={{ marginTop: 18 }}>Posts and training</div>
              <div className="card list">
                {page.activities.map((a) => {
                  const kudos = page.kudos.filter((k) => k.activity_id === a.id)
                  return a.kind === 'post' ? (
                    <PostItem
                      key={a.id}
                      a={a}
                      who={p}
                      me={page.me}
                      kudos={kudos}
                      onNote={page.isMe ? undefined : () => setNoteFor(a)}
                      onChanged={reload}
                      notify={notify}
                    />
                  ) : (
                    <FriendItem key={a.id} a={a} who={p} me={page.me} kudos={kudos} readOnly={page.isMe} showDate onNote={() => setNoteFor(a)} onChanged={reload} notify={notify} />
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {editing && session && p && (
        <Sheet onClose={() => setEditing(false)}>
          <ProfileSetup
            session={session}
            existing={p}
            onSaved={() => {
              setEditing(false)
              notify('Profile saved')
              reload()
            }}
            onCancel={() => setEditing(false)}
          />
        </Sheet>
      )}
      {composing && page?.isMe && <PostComposer me={p ?? null} onClose={() => setComposing(false)} onPosted={reload} notify={notify} />}
      {noteFor && p && (
        <NoteSheet
          to={p}
          about={noteFor === 'direct' ? null : noteFor.kind === 'post' ? 'their post' : noteFor.title}
          onClose={() => setNoteFor(null)}
          onSend={async (msg: string, gif: NoteGif | null) => {
            await sendNote(p.user_id, noteFor === 'direct' ? null : noteFor.id, msg, gif)
            setNoteFor(null)
            notify('Note sent')
            reload()
          }}
        />
      )}
      {menu && p && (
        <Sheet title={first} onClose={() => setMenu(false)} right={<button className="btn ghost" onClick={() => setMenu(false)}>Done</button>}>
          <div className="card list">
            <button className="cell" style={{ color: 'var(--danger)' }} onClick={async () => { setMenu(false); await blockUser(p.user_id); notify(`Blocked @${p.username}`); onClose() }}>
              <Icon name="ban" size={18} /> <span className="grow">Block @{p.username}</span>
            </button>
            <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => { setMenu(false); setReporting(true) }}>
              <Icon name="flag" size={18} /> <span className="grow">Report @{p.username}</span>
            </button>
          </div>
          <p className="group-footer">Blocking removes them as a friend. They aren’t told.</p>
        </Sheet>
      )}
      {reporting && p && <ReportSheet who={p} onClose={() => setReporting(false)} notify={notify} />}
    </Sheet>
  )
}

function Stat({ value, label, icon }: { value: number; label: string; icon?: boolean }) {
  return (
    <span className="profile-stat">
      <span className="profile-stat-value num">{icon && <Icon name="flame" size={16} style={{ color: '#ff9f0a', verticalAlign: '-1px', marginRight: 2 }} />}{value}</span>
      <span className="tiny muted">{label}</span>
    </span>
  )
}
