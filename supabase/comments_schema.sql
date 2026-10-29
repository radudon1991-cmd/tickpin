-- TickPin per-stock comments — run ONCE in the TickPin Supabase
-- project's SQL Editor (Dashboard → SQL Editor → New query → paste →
-- Run). Reading is public; posting needs a member account; authors
-- can delete their own comments and admins can delete any comment.
-- Automatic cleanup (Boss's rule, 2026-10-28): a daily pg_cron job
-- deletes every comment older than 6 months.
-- Safe to re-run: statements are idempotent.

-- ---------- comments ----------
create table if not exists public.comments (
  id bigint generated always as identity primary key,
  ticker text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists comments_ticker_created_idx
  on public.comments (ticker, created_at desc);

alter table public.comments enable row level security;

drop policy if exists "comments are readable by everyone" on public.comments;
create policy "comments are readable by everyone"
  on public.comments for select
  using (true);

drop policy if exists "members can post comments" on public.comments;
create policy "members can post comments"
  on public.comments for insert
  with check (auth.uid() = user_id);

drop policy if exists "authors and admins can delete comments" on public.comments;
create policy "authors and admins can delete comments"
  on public.comments for delete
  using (auth.uid() = user_id or public.am_admin());

-- ---------- automatic 6-month cleanup ----------
-- Daily at 03:15 UTC: delete comments older than 6 months.
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'tickpin-comments-cleanup') then
    perform cron.unschedule('tickpin-comments-cleanup');
  end if;
  perform cron.schedule(
    'tickpin-comments-cleanup',
    '15 3 * * *',
    'delete from public.comments where created_at < now() - interval ''6 months'''
  );
end $$;
