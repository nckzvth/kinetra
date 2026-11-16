-- Profile bios and status posts (text, a GIPHY GIF and/or a photo). Posts live in
-- shared_activities (kind 'post') so reactions, notes, realtime and friend-only visibility
-- all work the same as for workouts. Photos go in a private bucket under <user_id>/.
alter table public.public_profiles add column if not exists bio text not null default ''
  check (char_length(bio) <= 160);

alter table public.shared_activities drop constraint if exists shared_activities_kind_check;
alter table public.shared_activities add constraint shared_activities_kind_check check (kind in ('lift', 'activity', 'post'));
alter table public.shared_activities drop constraint if exists shared_post_shape;
alter table public.shared_activities add constraint shared_post_shape check (
  kind <> 'post' or (
    char_length(coalesce(summary->>'body', '')) <= 500
    and (summary->'gif' is null or jsonb_typeof(summary->'gif') = 'null' or summary->'gif'->>'url' ~ '^https://media[0-9]*\.giphy\.com/')
    and (summary->'photo' is null or jsonb_typeof(summary->'photo') = 'null' or summary->'photo'->>'path' like user_id::text || '/%')
    and (coalesce(summary->>'body', '') <> '' or summary->'gif'->>'url' is not null or summary->'photo'->>'path' is not null)
  )
);

alter table public.reports add column if not exists activity_id uuid references public.shared_activities(id) on delete set null;
create index if not exists reports_activity_idx on public.reports(activity_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists post_photos_upload on storage.objects;
create policy post_photos_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists post_photos_delete on storage.objects;
create policy post_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'post-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
drop policy if exists post_photos_read on storage.objects;
create policy post_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'post-photos' and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or private.are_friends((select auth.uid()), ((storage.foldername(name))[1])::uuid)
    )
  );
