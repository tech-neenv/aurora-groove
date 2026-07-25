-- Aurora Groove — database schema.
-- Paste into Supabase → SQL Editor → Run. Safe to re-run (idempotent).

-- ── profiles ───────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
drop policy if exists "profiles_read"   on public.profiles;
drop policy if exists "profiles_insert"  on public.profiles;
drop policy if exists "profiles_update"  on public.profiles;
create policy "profiles_read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles_insert" on public.profiles for insert with check (auth.uid() = id);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- auto-create a profile row on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── grooves ────────────────────────────────────────────────────────────────
-- one saved session. `layers` = instrument note-events + fx (JSON). Voice audio
-- is NOT stored here — it goes to the `voice` Storage bucket as WAV, and
-- `voice_paths` lists the object paths in voice-layer order.
create table if not exists public.grooves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Groove',
  key_root int not null default 0,
  scale_id text not null default 'pentMajor',
  bpm int not null default 84,
  bars int not null default 2,
  quantize boolean not null default true,
  layers jsonb not null default '[]'::jsonb,
  voice_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.grooves enable row level security;
drop policy if exists "grooves_read"   on public.grooves;
drop policy if exists "grooves_insert" on public.grooves;
drop policy if exists "grooves_update" on public.grooves;
drop policy if exists "grooves_delete" on public.grooves;
create policy "grooves_read"   on public.grooves for select using (auth.uid() = user_id);
create policy "grooves_insert" on public.grooves for insert with check (auth.uid() = user_id);
create policy "grooves_update" on public.grooves for update using (auth.uid() = user_id);
create policy "grooves_delete" on public.grooves for delete using (auth.uid() = user_id);
create index if not exists grooves_user_updated on public.grooves (user_id, updated_at desc);

-- ── voice audio storage (private bucket, RLS by top folder = user id) ────────
insert into storage.buckets (id, name, public) values ('voice', 'voice', false)
  on conflict (id) do nothing;
drop policy if exists "voice_read"   on storage.objects;
drop policy if exists "voice_insert" on storage.objects;
drop policy if exists "voice_delete" on storage.objects;
create policy "voice_read"   on storage.objects for select
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "voice_insert" on storage.objects for insert
  with check (bucket_id = 'voice' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "voice_delete" on storage.objects for delete
  using (bucket_id = 'voice' and (storage.foldername(name))[1] = auth.uid()::text);
