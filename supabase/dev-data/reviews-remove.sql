-- Removes the test reviews made by reviews.sql from the dev project. Real reviews always have an account, so they stay.
--
--   supabase db query --linked -f supabase/dev-data/reviews-remove.sql
delete from public.product_reviews where user_id is null;
