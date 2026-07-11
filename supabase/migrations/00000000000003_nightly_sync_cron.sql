-- MHTL Wealth — nightly sync scheduling (D27: 1x/day auto refresh)
-- Reference: .claude/orchestration-wealth-tracker/research/supabase-react-native-implementation.md §5
--
-- The vault secret 'nightly_sync_secret' must be created once via the Supabase dashboard/CLI
-- before this migration's cron jobs can authenticate to the Edge Functions:
--   select vault.create_secret('<service-role-or-function-secret>', 'nightly_sync_secret');

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

create or replace function public.trigger_nightly_sync()
returns void
language sql
as $$
  select net.http_post(
    url := current_setting('app.settings.nightly_sync_url', true),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets where name = 'nightly_sync_secret'
      )
    ),
    body := jsonb_build_object('triggered_at', now())
  );
$$;

select cron.schedule(
  'nightly-wealth-sync',
  '0 2 * * *',
  $$ select public.trigger_nightly_sync(); $$
);

-- Watchdog: catches the case where nightly-sync never wrote a sync_runs row at all
-- (function crash / network failure before it could record anything) — pg_net alone
-- would not surface this to the household (D26/D29).
select cron.schedule(
  'nightly-sync-watchdog',
  '30 2 * * *',
  $$
    insert into public.notifications (user_id, body)
    select hm.user_id, 'La synchronisation nocturne ne s''est pas exécutée correctement.'
    from public.household_members hm
    where hm.status = 'active'
      and not exists (
        select 1 from public.sync_runs sr
        where sr.household_id = hm.household_id
          and sr.ran_at::date = current_date
      );
  $$
);
