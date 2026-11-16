import { useEffect, useRef, useState } from 'react'
import { createPost, deletePost, photoUrl, POST_MAX, type Kudos, type NoteGif, type PostPhoto, type PublicProfile, type SharedActivity } from '../data/social'
import { Avatar, ReportSheet } from './Friends'
import { GifPicker, GifView } from './Gifs'
import { Icon } from './Icon'
import { EmojiPicker, ReactionBar, useReactions } from './Reactions'
import { Sheet } from './Sheet'

/** "What's up?" composer: text, plus a photo or a GIF. */
export function PostComposer({ me, onClose, onPosted, notify }: { me: PublicProfile | null; onClose: () => void; onPosted: () => void; notify: (m: string) => void }) {
  const [body, setBody] = useState('')
  const [gif, setGif] = useState<NoteGif | null>(null)
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!photo) return setPreview(null)
    const u = URL.createObjectURL(photo)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [photo])

  const left = POST_MAX - body.length
  const canPost = !busy && (body.trim().length > 0 || gif || photo) && left >= 0

  const post = async () => {
    setBusy(true)
    try {
      await createPost({ body, gif, photo })
      notify('Posted')
      onPosted()
      onClose()
    } catch (e) {
      notify(e instanceof Error ? e.message : "Couldn't post")
      setBusy(false)
    }
  }

  return (
    <>
      <Sheet
        title="New post"
        onClose={() => !busy && onClose()}
        left={<button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>}
        right={<button className="btn ghost" style={{ fontWeight: 700 }} disabled={!canPost} onClick={() => void post()}>{busy ? 'Posting…' : 'Post'}</button>}
      >
        <div className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
          <Avatar p={me} size={40} />
          <textarea
            className="composer-input"
            rows={4}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="What’s up? A PR, a rough day, tomorrow’s plan…"
            aria-label="Post text"
            autoFocus
          />
        </div>
        {preview && (
          <span className="post-media" style={{ marginTop: 12 }}>
            <img src={preview} alt="Selected photo" />
            <button className="gif-remove" onClick={() => setPhoto(null)} aria-label="Remove photo">×</button>
          </span>
        )}
        {gif && <GifView gif={gif} onRemove={() => setGif(null)} />}
        <div className="composer-bar">
          <button className="chip" onClick={() => fileRef.current?.click()} disabled={busy} aria-label={photo ? 'Change photo' : 'Add a photo'}>
            <Icon name="image" size={16} /> {photo ? 'Change' : 'Photo'}
          </button>
          <button className="chip gif-btn" onClick={() => setPicking(true)} disabled={busy} aria-label={gif ? 'Change GIF' : 'Add a GIF'}>
            GIF
          </button>
          <span className="grow" />
          <span className={`tiny num ${left < 40 ? '' : 'muted'}`} style={left < 0 ? { color: 'var(--danger)' } : undefined}>{left < 100 ? left : ''}</span>
        </div>
        <p className="group-footer" style={{ marginTop: 10 }}>Only your friends can see posts.</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            if (!f.type.startsWith('image/')) return notify('Choose a photo')
            if (f.size > 25 * 1024 * 1024) return notify('That photo is too large')
            setPhoto(f)
            setGif(null)
          }}
        />
      </Sheet>
      {picking && (
        <GifPicker
          onClose={() => setPicking(false)}
          onPick={(g) => {
            setGif(g)
            setPhoto(null)
            setPicking(false)
          }}
        />
      )}
    </>
  )
}

/** A post photo from the private bucket (signed link, loaded lazily). */
export function PostPhotoView({ photo }: { photo: PostPhoto }) {
  const [url, setUrl] = useState<string | null>(null)
  const [full, setFull] = useState(false)
  useEffect(() => {
    let live = true
    void photoUrl(photo.path).then((u) => live && setUrl(u))
    return () => {
      live = false
    }
  }, [photo.path])
  return (
    <>
      <button className="post-media" style={{ aspectRatio: `${photo.w} / ${Math.min(photo.h, photo.w * 1.35)}` }} onClick={() => url && setFull(true)} aria-label="View photo">
        {url && <img src={url} alt="" loading="lazy" decoding="async" />}
      </button>
      {full && url && (
        <div className="photo-full" role="dialog" aria-modal="true" onClick={() => setFull(false)}>
          <img src={url} alt="" />
          <button className="photo-close" aria-label="Close" onClick={() => setFull(false)}><Icon name="x" size={22} /></button>
        </div>
      )}
    </>
  )
}

/** A status post in the feed or on a profile. */
export function PostItem({
  a,
  who,
  me,
  kudos,
  onOpenProfile,
  onNote,
  onChanged,
  notify,
}: {
  a: SharedActivity
  who: PublicProfile | undefined
  me: string
  kudos: Kudos[]
  onOpenProfile?: () => void
  onNote?: () => void
  onChanged: () => void
  notify: (m: string) => void
}) {
  const mine = a.user_id === me
  const { groups, toggle } = useReactions(a, kudos, me, onChanged, notify)
  const [picking, setPicking] = useState(false)
  const [menu, setMenu] = useState(false)
  const [reporting, setReporting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const name = mine ? 'You' : who?.display_name || who?.username || 'A friend'
  const notes = kudos.filter((k) => k.kind === 'note' && (mine || k.from_user === me)).length
  const s = a.summary

  return (
    <div className="feed-item post">
      <button className="avatar-btn" onClick={onOpenProfile} aria-label={`Open ${name}'s profile`} disabled={!onOpenProfile}>
        <Avatar p={who ?? null} size={36} />
      </button>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="spread" style={{ alignItems: 'baseline' }}>
          <button className="name-btn" onClick={onOpenProfile} disabled={!onOpenProfile}>{name}</button>
          <span className="row" style={{ gap: 2 }}>
            <span className="tiny muted">{ago(a.started_at)}</span>
            <button className="icon-btn" style={{ width: 28, height: 28, marginRight: -6 }} aria-label="Post options" onClick={() => setMenu(true)}>
              <Icon name="more" size={18} />
            </button>
          </span>
        </span>
        {s.body && <span className="post-body">{s.body}</span>}
        {s.photo && <PostPhotoView photo={s.photo} />}
        {s.gif && <GifView gif={s.gif} />}
        <span className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {mine ? (
            <>
              <ReactionBar groups={groups} readOnly />
              {notes > 0 && <span className="tiny muted" style={{ marginTop: 10 }}>{notes} {notes === 1 ? 'note' : 'notes'}</span>}
            </>
          ) : (
            <>
              <ReactionBar groups={groups} onToggle={(e, on) => void toggle(e, on)} onAdd={() => setPicking(true)} />
              {onNote && (
                <button className="reaction-chip" style={{ marginTop: 10 }} onClick={onNote}>
                  <Icon name="pencil" size={14} /> {notes ? 'Noted' : 'Note'}
                </button>
              )}
            </>
          )}
        </span>
      </span>
      {picking && (
        <EmojiPicker
          title={`React to ${name}`}
          onClose={() => setPicking(false)}
          onPick={(e) => {
            setPicking(false)
            void toggle(e, true)
          }}
        />
      )}
      {menu && (
        <Sheet title="Post" onClose={() => setMenu(false)} right={<button className="btn ghost" onClick={() => setMenu(false)}>Done</button>}>
          <div className="card list">
            {onOpenProfile && (
              <button className="cell" onClick={() => { setMenu(false); onOpenProfile() }}>
                <Icon name="user" size={18} /> <span className="grow">{mine ? 'View your profile' : `View ${name}'s profile`}</span>
              </button>
            )}
            {mine ? (
              <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => { setMenu(false); setConfirmDelete(true) }}>
                <Icon name="trash" size={18} /> <span className="grow">Delete post</span>
              </button>
            ) : (
              who && (
                <button className="cell" style={{ color: 'var(--danger)' }} onClick={() => { setMenu(false); setReporting(true) }}>
                  <Icon name="flag" size={18} /> <span className="grow">Report post</span>
                </button>
              )
            )}
          </div>
        </Sheet>
      )}
      {confirmDelete && (
        <Sheet title="Delete this post?" onClose={() => setConfirmDelete(false)}>
          <p className="small muted" style={{ margin: '0 4px 14px' }}>It’s removed for everyone, along with its reactions and notes. This can’t be undone.</p>
          <button
            className="btn lg block"
            style={{ background: 'var(--danger)', color: '#fff' }}
            onClick={async () => {
              setConfirmDelete(false)
              try {
                await deletePost(a)
                notify('Post deleted')
                onChanged()
              } catch {
                notify("Couldn't delete. Check your connection.")
              }
            }}
          >
            Delete
          </button>
          <button className="btn ghost block" onClick={() => setConfirmDelete(false)}>Cancel</button>
        </Sheet>
      )}
      {reporting && who && <ReportSheet who={who} activityId={a.id} onClose={() => setReporting(false)} notify={notify} />}
    </div>
  )
}

export function ago(iso: string) {
  const s = (Date.now() - Date.parse(iso)) / 1000
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m`
  if (s < 86400) return `${Math.round(s / 3600)}h`
  if (s < 7 * 86400) return `${Math.round(s / 86400)}d`
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
