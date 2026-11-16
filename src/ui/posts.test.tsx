import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { profileStats, weeklyLeaderboard, type SharedActivity, type SocialFeed } from '../data/social'
import { PostItem } from './Posts'

const p = { user_id: 'nick', username: 'nick', display_name: 'Nick Z', avatar_url: null, bio: 'Chasing a 2x bodyweight deadlift', share_activity: true, share_weights: true }
const daysAgo = (n: number, from = new Date('2026-11-18T12:00:00')) => new Date(from.getTime() - n * 86400000).toISOString()
const act = (id: string, kind: SharedActivity['kind'], at: string, summary = {}): SharedActivity => ({ id, user_id: 'nick', kind, title: kind === 'post' ? 'post' : 'Push A', started_at: at, duration_seconds: kind === 'post' ? null : 1800, summary })

describe('status posts', () => {
  it('renders text, a GIF and reactions with a note button for friends', () => {
    const a = act('p1', 'post', new Date().toISOString(), { body: 'New deadlift PR!\nFelt great', gif: { url: 'https://media1.giphy.com/media/x/200w.gif', w: 200, h: 150 } })
    const html = renderToStaticMarkup(
      <PostItem a={a} who={p} me="me" kudos={[{ id: 'k', from_user: 'sam', to_user: 'nick', activity_id: 'p1', kind: 'react', emoji: '🔥', message: null, created_at: a.started_at, seen_at: null }]} onNote={() => {}} onOpenProfile={() => {}} onChanged={() => {}} notify={() => {}} />,
    )
    expect(html).toContain('Nick Z')
    expect(html).toContain('New deadlift PR!')
    expect(html).toContain('media1.giphy.com')
    expect(html).toContain('🔥')
    expect(html).toContain('Note')
    expect(html).toContain('Open Nick Z')
  })

  it('shows your own post read-only as "You"', () => {
    const a = { ...act('p2', 'post', new Date().toISOString(), { body: 'Rest day' }), user_id: 'me' }
    const html = renderToStaticMarkup(<PostItem a={a} who={p} me="me" kudos={[]} onChanged={() => {}} notify={() => {}} />)
    expect(html).toContain('You')
    expect(html).not.toContain('Add a reaction')
  })

  it("doesn't count posts as training on the leaderboard", () => {
    const feed: SocialFeed = { me: 'me', friendIds: ['nick'], profiles: {}, live: [], kudos: [], inbox: [], activities: [act('p', 'post', new Date().toISOString(), { body: 'hi' })] }
    expect(weeklyLeaderboard(feed).find((r) => r.user_id === 'nick')?.sessions).toBe(0)
  })
})

describe('profile stats', () => {
  const now = new Date('2026-11-18T12:00:00') // a Wednesday
  it('counts this week, last 30 days and a weekly streak, ignoring posts', () => {
    const list = [act('1', 'lift', daysAgo(1)), act('2', 'post', daysAgo(1)), act('3', 'activity', daysAgo(8)), act('4', 'lift', daysAgo(15)), act('5', 'lift', daysAgo(40))]
    expect(profileStats(list, now)).toEqual({ thisWeek: 1, last30: 3, streakWeeks: 3, posts: 1 })
  })
  it('keeps the streak alive early in a week with nothing logged yet', () => {
    expect(profileStats([act('1', 'lift', daysAgo(7)), act('2', 'lift', daysAgo(14))], now).streakWeeks).toBe(2)
    expect(profileStats([act('1', 'lift', daysAgo(21))], now).streakWeeks).toBe(0)
  })
})
