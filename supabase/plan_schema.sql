-- TickPin access tiers — run ONCE in the TickPin Supabase project's
-- SQL Editor. Adds profiles.plan (member | pro | friend) for the SMC
-- Analysis gate: Pro = paying subscriber (payments arrive later),
-- Friend = complimentary Pro access granted by an admin. Admins
-- (is_admin) always have access. Idempotent.

alter table public.profiles
  add column if not exists plan text not null default 'member'
  check (plan in ('member', 'pro', 'friend'));

-- Extend the existing guard: like is_admin, plan may only be changed
-- by the service role / SQL editor (auth.uid() is null) or an admin —
-- a member must never be able to grant themselves Pro from the client.
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
  if new.plan is distinct from old.plan
     and auth.uid() is not null
     and not public.am_admin() then
    raise exception 'plan can only be changed by an admin';
  end if;
  return new;
end;
$$;
