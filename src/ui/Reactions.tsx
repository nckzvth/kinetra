import { useMemo, useState } from 'react'
import { emojiOf, isReaction, removeReaction, sendReaction, type Kudos } from '../data/social'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const RECENT_KEY = 'recent-emojis'
const DEFAULT_RECENT = ['👊', '🔥', '💪', '👏', '🙌', '🚀']

const SECTIONS: { title: string; emojis: string[] }[] = [
  { title: 'Hype', emojis: ['🔥', '💪', '👊', '🚀', '⚡', '💥', '🙌', '👏', '🏆', '🥇', '💯', '⭐', '🌟', '✨', '🎉', '🫡'] },
  { title: 'Respect', emojis: ['🫶', '❤️', '💙', '💚', '🧡', '💜', '🤝', '🙏', '👑', '🦾', '🦍', '🦁', '🐐', '🐂', '🏋️', '🤸'] },
  { title: 'Faces', emojis: ['😤', '😮‍💨', '🥵', '🤯', '😎', '🥹', '😂', '🤣', '😅', '😳', '🤩', '😍', '🫠', '😈', '🤘', '👀'] },
  { title: 'Training', emojis: ['🏃', '🚴', '🥊', '🧗', '🏊', '🧘', '⛰️', '🏔️', '⏱️', '🎯', '📈', '🧠', '🥗', '🍗', '💧', '😴'] },
]

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? 'null') as string[] | null
    if (Array.isArray(v) && v.length) return v
  } catch {
    /* ignore */
  }
  return DEFAULT_RECENT
}

function rememberEmoji(e: string) {
  try {
    const next = [e, ...readRecent().filter((x) => x !== e)].slice(0, 8)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* ignore */
  }
}

/** First emoji in a string (handles skin tones, flags and joined emoji), or null. */
export function firstEmoji(text: string): string | null {
  const seg = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : null
  const parts = seg ? [...seg.segment(text)].map((p) => p.segment) : [...text]
  return parts.find((p) => /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(p)) ?? null
}

/** Emoji picker sheet: recents, curated sections, and any emoji from the keyboard. */
export function EmojiPicker({ title = 'React', onPick, onClose }: { title?: string; onPick: (emoji: string) => void; onClose: () => void }) {
  const recent = useMemo(readRecent, [])
  const [custom, setCustom] = useState('')
  const pick = (e: string) => {
    rememberEmoji(e)
    onPick(e)
  }
  return (
    <Sheet title={title} onClose={onClose} right={<button className="btn ghost" onClick={onClose}>Cancel</button>}>
      <div className="emoji-any">
        <input
          className="input"
          inputMode="text"
          placeholder="Type any emoji"
          value={custom}
          aria-label="Type any emoji"
          onChange={(e) => {
            const em = firstEmoji(e.target.value)
            setCustom(e.target.value)
            if (em) {
              setCustom('')
              pick(em)
            }
          }}
        />
        <span className="tiny muted">Tap the 🌐 or 😀 key on your keyboard</span>
      </div>
      <div className="emoji-section-title">Recent</div>
      <div className="emoji-grid">
        {recent.map((e) => (
          <button key={`r-${e}`} className="emoji-cell" onClick={() => pick(e)} aria-label={`React with ${e}`}>{e}</button>
        ))}
      </div>
      {SECTIONS.map((s) => (
        <div key={s.title}>
          <div className="emoji-section-title">{s.title}</div>
          <div className="emoji-grid">
            {s.emojis.map((e) => (
              <button key={e} className="emoji-cell" onClick={() => pick(e)} aria-label={`React with ${e}`}>{e}</button>
            ))}
          </div>
        </div>
      ))}
    </Sheet>
  )
}

export interface ReactionGroup {
  emoji: string
  count: number
  mine: boolean
}

export function groupReactions(kudos: Kudos[], me: string): ReactionGroup[] {
  const map = new Map<string, ReactionGroup>()
  for (const k of kudos.filter(isReaction)) {
    const e = emojiOf(k)
    const g = map.get(e) ?? { emoji: e, count: 0, mine: false }
    g.count++
    if (k.from_user === me) g.mine = true
    map.set(e, g)
  }
  return [...map.values()].sort((a, b) => b.count - a.count)
}

/** Grouped reaction chips (tap to toggle yours) plus an add-reaction button. */
export function ReactionBar({
  groups,
  onToggle,
  onAdd,
  readOnly = false,
}: {
  groups: ReactionGroup[]
  onToggle?: (emoji: string, on: boolean) => void
  onAdd?: () => void
  readOnly?: boolean
}) {
  if (readOnly && !groups.length) return null
  return (
    <span className="reaction-bar">
      {groups.map((g) =>
        readOnly ? (
          <span key={g.emoji} className="reaction-chip"><span className="re">{g.emoji}</span>{g.count}</span>
        ) : (
          <button
            key={g.emoji}
            className={`reaction-chip${g.mine ? ' mine' : ''}`}
            aria-pressed={g.mine}
            aria-label={`${g.emoji} ${g.count}${g.mine ? ', tap to remove yours' : ', tap to add yours'}`}
            onClick={() => onToggle?.(g.emoji, !g.mine)}
          >
            <span className="re">{g.emoji}</span>{g.count}
          </button>
        ),
      )}
      {!readOnly && (
        <button className="reaction-chip add" onClick={onAdd} aria-label="Add a reaction">
          <Icon name="smilePlus" size={17} />
        </button>
      )}
    </span>
  )
}

/** Reaction chips for a post with optimistic toggling, shared by workout and status cards. */
export function useReactions(
  target: { id: string; user_id: string },
  kudos: Kudos[],
  me: string,
  onChanged: () => void,
  notify: (m: string) => void,
) {
  const [optimistic, setOptimistic] = useState<{ emoji: string; on: boolean }[]>([])
  const groups = (() => {
    const g = groupReactions(kudos, me)
    for (const o of optimistic) {
      const cur = g.find((x) => x.emoji === o.emoji)
      if (o.on && !cur?.mine) cur ? ((cur.count += 1), (cur.mine = true)) : g.push({ emoji: o.emoji, count: 1, mine: true })
      if (!o.on && cur?.mine) ((cur.count -= 1), (cur.mine = false))
    }
    return g.filter((x) => x.count > 0)
  })()
  const toggle = async (emoji: string, on: boolean) => {
    setOptimistic((o) => [...o.filter((x) => x.emoji !== emoji), { emoji, on }])
    try {
      if (on) await sendReaction(target.user_id, target.id, emoji)
      else await removeReaction(target.id, emoji)
      onChanged()
    } catch {
      notify("Couldn't send that. Check your connection.")
    } finally {
      setTimeout(() => setOptimistic((o) => o.filter((x) => x.emoji !== emoji)), 1500)
    }
  }
  return { groups, toggle }
}
