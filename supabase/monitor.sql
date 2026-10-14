-- A read-only health and usage check of the linked Supabase project against the free plan's limits.
-- Run it with `npm run monitor:supabase`. It changes nothing.
--
-- Not visible from SQL (look at the dashboard, Settings > Usage): bandwidth (5 GB a month on the free plan),
-- monthly active users (50,000), and whether the project is about to be paused for inactivity.
--
-- "status" is ok, watch (more than 60% of a limit, or something to look at) or ACT (more than 85%, or broken).

with limits as (
  select
    pg_database_size(current_database())::numeric                                    as db_bytes,
    500 * 1024 * 1024::numeric                                                       as db_limit,
    coalesce((select sum((metadata ->> 'size')::bigint) from storage.objects), 0)::numeric as storage_bytes,
    1024 * 1024 * 1024::numeric                                                      as storage_limit
), rows_ as (
  select 1 as n, 'database size' as metric, pg_size_pretty(db_bytes::bigint) as value, '500 MB' as free_limit, round(100 * db_bytes / db_limit, 1) as percent,
         case when db_bytes / db_limit > .85 then 'ACT' when db_bytes / db_limit > .6 then 'watch' else 'ok' end as status from limits
  union all
  select 2, 'file storage', pg_size_pretty(storage_bytes::bigint), '1 GB', round(100 * storage_bytes / storage_limit, 1),
         case when storage_bytes / storage_limit > .85 then 'ACT' when storage_bytes / storage_limit > .6 then 'watch' else 'ok' end from limits
  union all
  select 3, 'files in storage', count(*)::text, '', null, 'ok' from storage.objects
  union all
  select 4, 'accounts', count(*)::text, '50,000 active a month', round(100 * count(*) / 50000.0, 2), 'ok' from auth.users
  union all
  select 5, 'largest table: ' || relname, pg_size_pretty(pg_total_relation_size(c.oid)), '', null, 'ok'
    from (select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname in ('public', 'cron', 'auth') and c.relkind = 'r' order by pg_total_relation_size(c.oid) desc limit 3) c
  union all
  -- The scheduled jobs: they must be there, active, and have run in the last few minutes without failing.
  select 6, 'job ' || j.jobname, coalesce(to_char(r.last_run at time zone 'Asia/Jakarta', 'DD Mon HH24:MI "WIB"'), 'never ran'),
         j.schedule, null,
         case when not j.active then 'ACT' when r.last_run is null then 'watch'
              when r.last_run < now() - (case when j.schedule like '*/5%' then interval '15 minutes' when j.schedule = '* * * * *' then interval '5 minutes' else interval '2 days' end) then 'ACT'
              else 'ok' end
    from cron.job j
    left join lateral (select max(end_time) as last_run from cron.job_run_details d where d.jobid = j.jobid) r on true
  union all
  select 7, 'job runs that failed in the last 24 hours', count(*)::text, '0', null, case when count(*) = 0 then 'ok' else 'ACT' end
    from cron.job_run_details where status = 'failed' and end_time > now() - interval '24 hours'
  union all
  select 8, 'scheduler log rows kept', count(*)::text, 'purged after 3 days', null, case when count(*) > 20000 then 'watch' else 'ok' end from cron.job_run_details
  union all
  -- If the expiry job is healthy nothing stays overdue for more than a minute or so.
  select 9, 'orders overdue but not yet expired', count(*)::text, '0', null, case when count(*) = 0 then 'ok' else 'ACT' end
    from public.orders
   where cancelled_at is null and ((payment_status = 'awaiting_payment' and expires_at < now() - interval '5 minutes')
      or (payment_status = 'rejected' and reupload_until is not null and reupload_until < now() - interval '5 minutes'))
  union all
  select 10, 'payments waiting for an admin', count(*)::text, '', null, 'ok' from public.orders where payment_status = 'under_review' and cancelled_at is null
  union all
  select 11, 'orders / products / reviews', (select count(*) from public.orders) || ' / ' || (select count(*) from public.products) || ' / ' || (select count(*) from public.product_reviews), '', null, 'ok'
)
select metric, value, free_limit, percent, status from rows_ order by n, metric;
