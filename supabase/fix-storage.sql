-- ============================================================
-- Gragon Store — FIX UPLOAD FOTO AKUN & POSTER
-- Jalankan SEKALI di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan berulang (idempotent), tidak menghapus data.
-- ============================================================

-- 1. Fungsi cek admin harus bisa dipanggil oleh policy storage
grant execute on function public.is_admin() to anon, authenticated;

-- 2. Bucket publik "account-images" (dibuat jika belum ada,
--    diperbaiki jika sudah ada tapi private / salah setting)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-images', 'account-images', true, 5242880,
  array['image/jpeg','image/jpg','image/png','image/webp']
)
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['image/jpeg','image/jpg','image/png','image/webp'];

-- 3. Hapus SEMUA policy lama di storage.objects yang menyangkut bucket ini
--    (policy bawaan/rusak/bentrok dari versi lama ikut dibersihkan)
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual,'') ilike '%account-images%'
        or coalesce(with_check,'') ilike '%account-images%'
        or policyname in (
          'Publik baca account-images','Publik upload sell-requests',
          'Admin upload accounts','Admin update account-images storage',
          'Admin hapus account-images','Admin upload banner',
          'Admin update banner','Admin hapus banner',
          'Admin kelola account-images'))
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

-- 4. Policy storage yang benar
-- Semua orang boleh MELIHAT foto/poster (bucket publik)
create policy "Publik baca account-images" on storage.objects
  for select using (bucket_id = 'account-images');

-- Pengunjung boleh upload hanya ke folder sell-requests/ (form Jual Akun)
create policy "Publik upload sell-requests" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'account-images' and (storage.foldername(name))[1] = 'sell-requests');

-- Admin boleh upload/ubah/hapus di folder mana pun (accounts/, banners/, dll)
create policy "Admin upload account-images" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'account-images' and public.is_admin());

create policy "Admin update account-images" on storage.objects
  for update to authenticated
  using (bucket_id = 'account-images' and public.is_admin())
  with check (bucket_id = 'account-images' and public.is_admin());

create policy "Admin hapus account-images" on storage.objects
  for delete to authenticated
  using (bucket_id = 'account-images' and public.is_admin());

-- 5. Tabel foto akun & poster: pastikan RLS + izin admin benar
alter table public.account_images enable row level security;
alter table public.banners        enable row level security;

drop policy if exists "Publik baca account_images"  on public.account_images;
drop policy if exists "Admin kelola account_images" on public.account_images;
create policy "Publik baca account_images"  on public.account_images
  for select using (true);
create policy "Admin kelola account_images" on public.account_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Publik baca banner aktif" on public.banners;
drop policy if exists "Admin kelola banner"      on public.banners;
create policy "Publik baca banner aktif" on public.banners
  for select using (is_active = true or public.is_admin());
create policy "Admin kelola banner"      on public.banners
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.account_images, public.banners to anon, authenticated;
grant insert, update, delete on public.account_images, public.banners to authenticated;

-- 6. Pastikan akun yang login adalah admin (GANTI email di bawah, lalu jalankan)
-- update public.profiles set role = 'admin'
--  where id = (select id from auth.users where email = 'EMAIL_ADMIN_ANDA');

-- ============================================================
-- CEK HASIL (hasilnya muncul di tab Results):
-- ============================================================
select 'bucket' as cek, id, public::text as nilai from storage.buckets where id = 'account-images'
union all
select 'policy storage', policyname, cmd from pg_policies
 where schemaname = 'storage' and tablename = 'objects' and policyname like '%account-images%'
    or schemaname = 'storage' and tablename = 'objects' and policyname = 'Publik upload sell-requests'
union all
select 'admin terdaftar', u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
