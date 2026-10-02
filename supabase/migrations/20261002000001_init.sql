-- MarTime schema. Every record: id (uuid made on the device), user_id, created_at, updated_at, deleted_at (soft delete).
-- server_updated_at is set by the server and used to pull only what changed since the last sync.

create or replace function public.mt_touch() returns trigger language plpgsql as $$
begin
  -- last write wins, record by record: an older version never replaces a newer one
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_updated_at := clock_timestamp();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['areas','tasks','days','time_entries','log_sessions','places','energy_blocks','projects','goals','decisions','reflections','weekly_reviews','reorganizations','important_dates','settings','training_reports']
  loop
    execute format($f$
      create table if not exists public.%1$I (
        id uuid primary key,
        user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        deleted_at timestamptz,
        server_updated_at timestamptz not null default clock_timestamp(),
        data jsonb not null default '{}'::jsonb
      );
      create index if not exists %1$s_sync_idx on public.%1$I (user_id, server_updated_at);
      alter table public.%1$I enable row level security;
      drop policy if exists own_rows on public.%1$I;
      create policy own_rows on public.%1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
      drop trigger if exists mt_touch on public.%1$I;
      create trigger mt_touch before insert or update on public.%1$I for each row execute function public.mt_touch();
    $f$, t);
  end loop;
end $$;

create table if not exists public.scheduled_notifications (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  data jsonb not null default '{}'::jsonb,
  type text not null,
  send_at timestamptz not null,
  title text not null default 'MarTime',
  body text not null,
  url text not null default '#/hoje',
  status text not null default 'pending' check (status in ('pending','sent','deferred','cancelled')),
  key text not null,
  "deferrable" boolean not null default false,
  released_at timestamptz
);
create index if not exists scheduled_notifications_sync_idx on public.scheduled_notifications (user_id, server_updated_at);
create index if not exists scheduled_notifications_due_idx on public.scheduled_notifications (status, send_at);

create table if not exists public.push_subscriptions (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  server_updated_at timestamptz not null default clock_timestamp(),
  data jsonb not null default '{}'::jsonb,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  device text not null default ''
);
create index if not exists push_subscriptions_sync_idx on public.push_subscriptions (user_id, server_updated_at);

-- A device that has not yet seen that a notification was sent must not put it back to pending.
create or replace function public.mt_notification_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.status in ('sent','deferred') and new.status = 'pending' and new.send_at = old.send_at then
    new.status := old.status;
    new.released_at := old.released_at;
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['scheduled_notifications','push_subscriptions']
  loop
    execute format($f$
      alter table public.%1$I enable row level security;
      drop policy if exists own_rows on public.%1$I;
      create policy own_rows on public.%1$I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
      drop trigger if exists mt_touch on public.%1$I;
      create trigger mt_touch before insert or update on public.%1$I for each row execute function public.mt_touch();
    $f$, t);
  end loop;
end $$;

drop trigger if exists mt_notification_guard on public.scheduled_notifications;
create trigger mt_notification_guard before update on public.scheduled_notifications for each row execute function public.mt_notification_guard();
