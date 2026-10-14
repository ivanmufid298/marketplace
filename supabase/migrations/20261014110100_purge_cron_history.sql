-- Keeps the scheduler's own log from growing for ever.
--
-- pg_cron writes one row to cron.job_run_details for every run and never deletes them. With the expiry job running every
-- minute that is about 1,500 rows a day, which is small but adds up inside the free plan's 500 MB database. This job
-- deletes the history older than 3 days once a day (at 03:17 UTC, a quiet time). Scheduling again under the same name
-- replaces the job, so this is safe to run twice.
--
-- To stop it: select cron.unschedule('purge-cron-history');

select cron.schedule('purge-cron-history', '17 3 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
