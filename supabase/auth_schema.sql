-- TickPin accounts system — run ONCE in the TickPin Supabase project's
-- SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Mirrors the TruePin Property setup: public browsing stays open,
-- accounts add a personal watchlist, and admins manage members.
-- Safe to re-run: every statement is idempotent.

-- ---------- profiles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Admin check that bypasses RLS (a policy on profiles that queries
-- profiles would recurse without this SECURITY DEFINER helper).
create or replace function public.am_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and is_admin)
$$;

-- A DB-level guard so nobody can grant themselves admin from the client:
-- only the service role / SQL editor (auth.uid() is null) or an existing
-- admin session may change is_admin.
create or replace function public.guard_is_admin()
returns trigger
language plpgsql
as $$
begin
  if new.is_admin is distinct from old.is_admin
     and auth.uid() is not null
     and not public.am_admin() then
    raise exception 'is_admin can only be changed by an admin';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_is_admin on public.profiles;
create trigger profiles_guard_is_admin
  before update on public.profiles
  for each row execute function public.guard_is_admin();

drop policy if exists "profiles are readable by their owner" on public.profiles;
create policy "profiles are readable by their owner"
  on public.profiles for select
  using (auth.uid() = id);

drop policy if exists "admins can read all profiles" on public.profiles;
create policy "admins can read all profiles"
  on public.profiles for select
  using (public.am_admin());

drop policy if exists "users can update their own profile" on public.profiles;
create policy "users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles"
  on public.profiles for update
  using (public.am_admin())
  with check (public.am_admin());

-- Auto-create a profile row for every new signup (email or Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',
             new.raw_user_meta_data ->> 'name',
             split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- watchlist ----------
create table if not exists public.watchlist (
  user_id uuid not null references auth.users (id) on delete cascade,
  ticker text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, ticker)
);

alter table public.watchlist enable row level security;

drop policy if exists "users manage their own watchlist" on public.watchlist;
create policy "users manage their own watchlist"
  on public.watchlist for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------- make the Boss the first admin ----------
-- Run AFTER signing up on the site with this email (the profile row
-- must exist first). Idempotent.
update public.profiles
set is_admin = true
where email = 'radudon1991@gmail.com';
