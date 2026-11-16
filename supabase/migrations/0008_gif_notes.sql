-- Notes can carry a GIF. Only GIPHY media links are accepted, so a note can't embed an
-- arbitrary (tracking) image URL. The GIPHY API key lives in private.app_secrets ('giphy_key').
alter table public.kudos add column if not exists gif jsonb;
alter table public.kudos drop constraint if exists kudos_gif_is_giphy;
alter table public.kudos add constraint kudos_gif_is_giphy check (
  gif is null or (
    gif->>'url' ~ '^https://media[0-9]*\.giphy\.com/'
    and (gif->>'still' is null or gif->>'still' ~ '^https://media[0-9]*\.giphy\.com/')
  )
);
alter table public.kudos drop constraint if exists kudos_note_has_content;
alter table public.kudos add constraint kudos_note_has_content check (kind <> 'note' or message is not null or gif is not null);
