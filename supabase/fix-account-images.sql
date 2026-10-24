-- ============================================================
-- Gragon Store — PERBAIKI & CEK TABEL FOTO AKUN (account_images)
-- Jalankan di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan berulang. Tidak menghapus data.
-- Cocok untuk database lama (PT Gondam) yang struktur tabelnya beda.
-- ============================================================

-- 1. Pastikan tabel & kolom yang dipakai kode ada
create table if not exists public.account_images (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  image_url text,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.account_images add column if not exists image_url  text;
alter table public.account_images add column if not exists is_primary boolean not null default false;
alter table public.account_images add column if not exists created_at timestamptz not null default now();

-- 2. Kalau tabel lama memakai nama kolom lain, salin ke image_url
do $$
declare c text;
begin
  foreach c in array array['url','image','image_path','photo_url','path'] loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name='account_images' and column_name=c) then
      execute format(
        'update public.account_images set image_url = %I where (image_url is null or image_url = '''') and %I is not null', c, c);
    end if;
  end loop;
end $$;

-- 3. Relasi akun → foto (dibutuhkan agar katalog bisa memuat foto bersama akun)
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.account_images'::regclass and contype = 'f'
      and confrelid = 'public.accounts'::regclass
  ) then
    alter table public.account_images
      add constraint account_images_account_id_fkey
      foreign key (account_id) references public.accounts(id) on delete cascade;
  end if;
end $$;
create index if not exists idx_account_images_account on public.account_images(account_id);

-- 4. Izin baca publik + kelola admin
alter table public.account_images enable row level security;
drop policy if exists "Publik baca account_images"  on public.account_images;
drop policy if exists "Admin kelola account_images" on public.account_images;
create policy "Publik baca account_images"  on public.account_images for select using (true);
create policy "Admin kelola account_images" on public.account_images
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
grant select on public.account_images to anon, authenticated;
grant insert, update, delete on public.account_images to authenticated;

-- 5. Muat ulang cache skema API (WAJIB setelah mengubah tabel/kolom)
notify pgrst, 'reload schema';

-- ============================================================
-- HASIL PEMERIKSAAN — kirim hasil tab Results ini kalau masih bermasalah
-- ============================================================
select '1. kolom account_images' as cek, column_name as info, data_type as nilai
  from information_schema.columns
 where table_schema='public' and table_name='account_images'
union all
select '2. jumlah foto tercatat', 'baris', count(*)::text from public.account_images
union all
select '3. akun tanpa foto', 'akun', count(*)::text from public.accounts a
 where not exists (select 1 from public.account_images i where i.account_id = a.id)
union all
select '4. foto terbaru', to_char(created_at,'DD-MM HH24:MI'), image_url
  from (select * from public.account_images order by created_at desc limit 5) x
union all
select '5. bucket', id, 'public=' || public::text from storage.buckets where id = 'account-images'
union all
select '6. file di storage', count(*)::text, coalesce(max(name),'-')
  from storage.objects where bucket_id = 'account-images' and name like 'accounts/%'
union all
select '7. admin terdaftar', u.email, p.role
  from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
