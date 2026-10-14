-- Runs the order clean-up on its own, so nobody has to place an order to get an expired one's stock back.
--
-- Every minute: orders that ran out of time expire and their stock is returned. Every 5 minutes: buyers whose order
-- will expire within 30 minutes are reminded. Both functions are safe to run any number of times, and a job that is
-- scheduled again under the same name is replaced, so this migration is safe to run twice.
--
-- To stop them: select cron.unschedule('expire-overdue-orders'); select cron.unschedule('remind-expiring-orders');

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule('expire-overdue-orders', '* * * * *', 'select public.expire_overdue_orders()');
select cron.schedule('remind-expiring-orders', '*/5 * * * *', 'select public.remind_expiring_orders()');
