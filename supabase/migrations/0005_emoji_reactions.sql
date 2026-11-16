-- Reactions with any emoji (replaces fist-bump-only kudos). One reaction per emoji per person per post.
alter table public.kudos add column if not exists emoji text check (emoji is null or char_length(emoji) between 1 and 16);
alter table public.kudos drop constraint if exists kudos_kind_check;
alter table public.kudos add constraint kudos_kind_check check (kind in ('fist', 'note', 'react'));
update public.kudos set kind = 'react', emoji = '👊' where kind = 'fist';
create unique index if not exists kudos_one_emoji_per_person on public.kudos (from_user, activity_id, emoji) where kind = 'react' and activity_id is not null;
drop policy if exists read_kudos on public.kudos;
create policy read_kudos on public.kudos for select to authenticated
  using (
    to_user = (select auth.uid())
    or from_user = (select auth.uid())
    or (kind in ('fist', 'react') and private.are_friends((select auth.uid()), to_user))
  );
