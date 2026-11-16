import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { weeklyLeaderboard, type SocialFeed } from '../data/social'
import { ForYou, FriendItem, LeaderboardCard, LiveStrip } from './Feed'

const now = new Date()
const iso = (minsAgo: number) => new Date(now.getTime() - minsAgo * 60000).toISOString()
const profile = (id: string, name: string) => ({ user_id: id, username: name.toLowerCase(), display_name: name, avatar_url: null, share_activity: true, share_weights: true })

const feed: SocialFeed = {
  me: 'me',
  friendIds: ['nick', 'sam'],
  profiles: { me: profile('me', 'Alex'), nick: profile('nick', 'Nick Z'), sam: profile('sam', 'Sam') },
  live: [{ user_id: 'nick', title: 'Pull A', started_at: iso(18), updated_at: iso(1) }],
  activities: [
    { id: 'a1', user_id: 'nick', kind: 'lift', title: 'Push A', started_at: iso(3), duration_seconds: 2400, summary: { highlights: ['Bench Press up to 135 lb'], ups: 1, lifts: [{ name: 'Bench Press', weight: 130, unit: 'lb', reps: [5, 5, 5] }] } },
    { id: 'a2', user_id: 'sam', kind: 'activity', title: 'Outdoor Run', started_at: iso(4), duration_seconds: 1800, summary: {} },
    { id: 'a3', user_id: 'me', kind: 'lift', title: 'Legs A', started_at: iso(2), duration_seconds: 3000, summary: { ups: 2 } },
  ],
  kudos: [{ id: 'k1', from_user: 'sam', to_user: 'nick', activity_id: 'a1', kind: 'react', emoji: '🔥', message: null, created_at: iso(30), seen_at: null }],
  inbox: [{ id: 'k2', from_user: 'nick', to_user: 'me', activity_id: 'a3', kind: 'note', emoji: null, message: 'Strong work 💪', created_at: iso(5), seen_at: null }],
}

describe('friends feed components', () => {
  it('shows who is training now with a fist-bump button', () => {
    const html = renderToStaticMarkup(<LiveStrip feed={feed} notify={() => {}} />)
    expect(html).toContain('Training now')
    expect(html).toContain('Nick')
    expect(html).toContain('Pull A · 18 min')
    expect(html).toContain('👊')
    expect(html).toContain('Choose an emoji')
  })

  it('shows notes received in For you', () => {
    const html = renderToStaticMarkup(<ForYou feed={feed} />)
    expect(html).toContain('left a note')
    expect(html).toContain('Legs A')
    expect(html).toContain('Strong work')
  })

  it("renders a friend's post with weights and a fist-bump count", () => {
    const html = renderToStaticMarkup(
      <FriendItem a={feed.activities[0]} who={feed.profiles.nick} me="me" kudos={feed.kudos} onNote={() => {}} onChanged={() => {}} notify={() => {}} />,
    )
    expect(html).toContain('Nick')
    expect(html).toContain('finished')
    expect(html).toContain('Bench Press up to 135 lb')
    expect(html).toContain('5 · 5 · 5')
    expect(html).toMatch(/🔥<\/span>1/)
    expect(html).toContain('Add a reaction')
  })

  it('ranks the week: sessions first, then minutes and increases', () => {
    const rows = weeklyLeaderboard(feed)
    expect(rows.map((r) => r.user_id)[0]).toBe('me')
    expect(rows.find((r) => r.user_id === 'sam')!.sessions).toBe(1)
    const html = renderToStaticMarkup(<LeaderboardCard feed={feed} onOpen={() => {}} />)
    expect(html).toContain('This week')
    expect(html).toContain('of 3')
  })
})
