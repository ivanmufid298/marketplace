-- TEST DATA for the dev project only: a few reviews on the first products, so the review section can be tried before
-- real reviews exist. Never run this on production. It is not a migration and nothing runs it automatically.
--
--   supabase db query --linked -f supabase/dev-data/reviews.sql
--
-- Run it again any time: it first removes the rows it made. Remove them for good with reviews-remove.sql. Every row it
-- makes has no account (user_id is null), which is how a real review (always tied to an account) is told apart.
delete from public.product_reviews where user_id is null and author_name in ('Nadia P.', 'Sarah A.', 'Budi S.', 'Maya R.', 'Rudi T.', 'Tes Tersembunyi');

insert into public.product_reviews (product_id, author_name, rating, body, is_verified, status, created_at)
select p.id, r.author_name, r.rating, r.body, r.is_verified, r.status, now() - r.ago
from (select id from public.products order by id limit 2) p
cross join (values
  ('Nadia P.',         5, 'Produknya sesuai foto, packing rapi dan warnanya cantik banget.',                                                  true,  'published', interval '2 days'),
  ('Sarah A.',         4, 'Barang bagus dan admin responsif. Pengiriman sedikit lebih lama dari perkiraan.',                                  true,  'published', interval '1 week'),
  ('Budi S.',          5, 'Kualitas jahitan rapi, bahannya tebal. Sudah beli yang kedua kali untuk hadiah.',                                  true,  'published', interval '3 weeks'),
  ('Maya R.',          3, 'Lumayan, tapi warnanya sedikit lebih gelap dari di foto.',                                                         false, 'published', interval '1 month'),
  ('Rudi T.',          2, E'Ukuran lebih kecil dari yang saya bayangkan.\nMungkin saya yang kurang teliti membaca deskripsi.',                 false, 'published', interval '2 months'),
  ('Tes Tersembunyi',  1, 'Ulasan ini disembunyikan admin, jadi tidak boleh tampil di toko.',                                                 false, 'hidden',    interval '5 days')
) as r(author_name, rating, body, is_verified, status, ago);
