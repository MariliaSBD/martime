-- Every minute, pg_cron asks the Edge Function to send the notifications that are due.
-- The function URL and the shared secret live in Supabase Vault (created outside the repository).
create extension if not exists pg_cron;
create extension if not exists pg_net;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'martime-send-notifications') then
    perform cron.unschedule('martime-send-notifications');
  end if;
end $$;

select cron.schedule(
  'martime-send-notifications',
  '* * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'martime_functions_url') || '/send-notifications',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'martime_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);
