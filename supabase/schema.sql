-- ============================================================
-- Gragon Store — Skema Database Supabase (PostgreSQL)
-- SATU file untuk database BARU. Jalankan di Supabase → SQL Editor.
-- Aman dijalankan ulang (idempotent) dan tidak menghapus data.
-- Sudah menggabungkan semua migrasi lama (v3–v8) dan membuang yang
-- tidak dipakai lagi: QRIS/bukti bayar, Telegram webhook, admin_profiles.
-- Sudah punya database lama (PT Gondam)? Jalankan upgrade-from-gondam.sql.
-- ============================================================

create extension if not exists pgcrypto;

-- ── Helper umum ─────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── PROFILES (role admin/user, terhubung ke Supabase Auth) ──
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  full_name text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ── CATEGORIES ──────────────────────────────────────────────
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── ACCOUNTS ────────────────────────────────────────────────
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  account_code text not null unique,                 -- otomatis: GRG-XXXXXX
  name text not null,
  platform text not null,
  category_id uuid references public.categories(id) on delete set null,
  username text,
  price numeric(14,2) not null default 0,
  description text,
  details text,
  features text,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'RESERVED', 'SOLD')),
  featured boolean not null default false,
  discount_price numeric(14,2),
  discount_active boolean not null default false,
  discount_starts_at timestamptz,
  discount_ends_at timestamptz,
  promo_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accounts_discount_price_check
    check (discount_price is null or (discount_price >= 0 and discount_price < price))
);

create index if not exists idx_accounts_status on public.accounts(status);
create index if not exists idx_accounts_category on public.accounts(category_id);
create index if not exists idx_accounts_featured on public.accounts(featured);
create index if not exists idx_accounts_created on public.accounts(created_at desc);

create or replace function public.generate_account_code()
returns text language plpgsql as $$
declare candidate text; tries int := 0;
begin
  loop
    candidate := 'GRG-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.accounts where account_code = candidate);
    tries := tries + 1;
    if tries > 20 then
      candidate := 'GRG-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 10));
      exit;
    end if;
  end loop;
  return candidate;
end $$;

create or replace function public.set_account_code()
returns trigger language plpgsql as $$
begin
  if new.account_code is null or btrim(new.account_code) = '' then
    new.account_code := public.generate_account_code();
  end if;
  return new;
end $$;

drop trigger if exists trg_accounts_set_code on public.accounts;
create trigger trg_accounts_set_code before insert on public.accounts
  for each row execute function public.set_account_code();

drop trigger if exists trg_accounts_updated_at on public.accounts;
create trigger trg_accounts_updated_at before update on public.accounts
  for each row execute function public.set_updated_at();

-- Harga yang berlaku sekarang (memperhitungkan diskon aktif)
create or replace function public.effective_price(a public.accounts)
returns numeric language sql stable as $$
  select case
    when a.discount_active
      and a.discount_price is not null
      and (a.discount_starts_at is null or a.discount_starts_at <= now())
      and (a.discount_ends_at is null or a.discount_ends_at >= now())
    then a.discount_price
    else a.price
  end;
$$;

-- ── ACCOUNT IMAGES ──────────────────────────────────────────
create table if not exists public.account_images (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  image_url text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_account_images_account on public.account_images(account_id);

-- ── ACCOUNT CREDENTIALS (rahasia, hanya admin / pembeli lewat RPC) ──
create table if not exists public.account_credentials (
  account_id uuid primary key references public.accounts(id) on delete cascade,
  account_email text,
  account_password text,
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_account_credentials_updated_at on public.account_credentials;
create trigger trg_account_credentials_updated_at before update on public.account_credentials
  for each row execute function public.set_updated_at();

-- ── OFFERS (tawaran harga) ──────────────────────────────────
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts(id) on delete cascade,
  original_price numeric(14,2) not null,
  offer_price numeric(14,2) not null,
  buyer_name text not null,
  buyer_whatsapp text not null,
  note text,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_offers_account on public.offers(account_id);
create index if not exists idx_offers_status on public.offers(status);

-- ── SELL REQUESTS (pengajuan jual akun dari publik) ─────────
create table if not exists public.sell_requests (
  id uuid primary key default gen_random_uuid(),
  seller_name text not null,
  seller_whatsapp text not null,
  seller_email text,
  account_name text not null,
  platform text not null,
  category_id uuid references public.categories(id) on delete set null,
  username text,
  account_email text,
  account_password text,
  desired_price numeric(14,2),
  description text,
  details text,
  features text,
  additional_info text,
  photo_urls text[] default '{}',
  status text not null default 'PENDING' check (status in ('PENDING', 'REVIEW', 'ACCEPTED', 'REJECTED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_sell_requests_status on public.sell_requests(status);

-- ── TRANSACTIONS (pesanan manual via WhatsApp) ──────────────
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  invoice_id text,                                    -- GS-YYYYMMDD-XXXXXX
  account_id uuid references public.accounts(id) on delete set null,
  buyer_name text,
  buyer_whatsapp text not null,
  note text,
  price numeric(14,2) not null,
  payment_method text not null default 'MANUAL_WHATSAPP',
  payment_status text not null default 'PENDING_PAYMENT'
    check (payment_status in ('PENDING_PAYMENT', 'PAID', 'REJECTED', 'EXPIRED', 'COMPLETED')),
  transaction_status text not null default 'PENDING'
    check (transaction_status in ('PENDING', 'PROCESSING', 'WAITING_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED')),
  rejection_reason text,
  expires_at timestamptz,
  verified_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists idx_tx_invoice on public.transactions(invoice_id) where invoice_id is not null;
create index if not exists idx_tx_pay_status on public.transactions(payment_status);
create index if not exists idx_tx_account on public.transactions(account_id);
-- Satu akun hanya boleh punya SATU pesanan aktif (anti dobel beli)
create unique index if not exists idx_tx_one_active on public.transactions(account_id)
  where payment_status = 'PENDING_PAYMENT';

drop trigger if exists trg_transactions_updated_at on public.transactions;
create trigger trg_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ── SITE SETTINGS (satu baris) ──────────────────────────────
create table if not exists public.site_settings (
  id int primary key default 1,
  site_name text not null default 'Gragon Store',
  admin_whatsapp text default '6282357961890',
  footer_text text,
  wa_template_buy text,
  wa_template_offer text,
  wa_template_sell text,
  payment_expiration_minutes int not null default 120,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);
insert into public.site_settings (id) values (1) on conflict (id) do nothing;

-- ── BANNERS (poster carousel homepage) ──────────────────────
create table if not exists public.banners (
  id uuid primary key default gen_random_uuid(),
  image_url text not null,
  title text,
  link_url text,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_banners_active_order on public.banners(is_active, sort_order);

drop trigger if exists trg_banners_updated_at on public.banners;
create trigger trg_banners_updated_at before update on public.banners
  for each row execute function public.set_updated_at();

-- ============================================================
-- FUNGSI PESANAN (RPC)
-- ============================================================

create or replace function public.generate_invoice_id()
returns text language plpgsql as $$
declare c text;
begin
  loop
    c := 'GS-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 6));
    exit when not exists (select 1 from public.transactions where invoice_id = c);
  end loop;
  return c;
end $$;

-- Lepas pesanan yang kedaluwarsa & kembalikan akun ke AVAILABLE
create or replace function public.expire_stale_transactions()
returns void language plpgsql security definer set search_path = public as $$
begin
  update transactions
     set payment_status = 'EXPIRED', transaction_status = 'CANCELLED'
   where payment_status = 'PENDING_PAYMENT' and expires_at is not null and expires_at < now();
  update accounts set status = 'AVAILABLE'
   where status = 'RESERVED'
     and not exists (select 1 from transactions t
                      where t.account_id = accounts.id and t.payment_status = 'PENDING_PAYMENT');
end $$;

-- Buat pesanan: kunci akun (RESERVED) secara atomik, hitung harga final di server
create or replace function public.create_whatsapp_order(
  p_account_id uuid, p_buyer_name text, p_buyer_whatsapp text, p_buyer_note text
) returns table (invoice_id text, transaction_id uuid, expires_at timestamptz,
  account_name text, account_code text, platform text, category_name text, price numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_acc accounts%rowtype; v_cat text; v_min int; v_inv text; v_exp timestamptz;
  v_id uuid; v_price numeric; v_digits text; v_active int;
begin
  if p_buyer_name is null or char_length(btrim(p_buyer_name)) < 2 then raise exception 'NAMA_WAJIB_DIISI'; end if;
  v_digits := regexp_replace(coalesce(p_buyer_whatsapp, ''), '\D', '', 'g');
  if char_length(v_digits) < 8 or char_length(v_digits) > 15 then raise exception 'WHATSAPP_TIDAK_VALID'; end if;

  perform public.expire_stale_transactions();

  -- Anti timbun: maksimal 3 pesanan aktif per nomor WhatsApp
  select count(*) into v_active from transactions t
   where regexp_replace(coalesce(t.buyer_whatsapp, ''), '\D', '', 'g') = v_digits
     and t.payment_status = 'PENDING_PAYMENT'
     and (t.expires_at is null or t.expires_at > now());
  if v_active >= 3 then raise exception 'TERLALU_BANYAK_PESANAN'; end if;

  select * into v_acc from accounts where id = p_account_id for update;
  if not found then raise exception 'AKUN_TIDAK_DITEMUKAN'; end if;
  if v_acc.status <> 'AVAILABLE' then raise exception 'AKUN_TIDAK_TERSEDIA'; end if;

  v_price := public.effective_price(v_acc);
  select name into v_cat from categories where id = v_acc.category_id;
  select coalesce(payment_expiration_minutes, 120) into v_min from site_settings where id = 1;
  v_inv := public.generate_invoice_id();
  v_exp := now() + (coalesce(v_min, 120) || ' minutes')::interval;

  update accounts set status = 'RESERVED' where id = p_account_id;
  begin
    insert into transactions (account_id, buyer_name, buyer_whatsapp, note, price,
      payment_method, payment_status, transaction_status, invoice_id, expires_at)
    values (p_account_id, btrim(p_buyer_name), btrim(p_buyer_whatsapp),
      nullif(btrim(coalesce(p_buyer_note, '')), ''), v_price,
      'MANUAL_WHATSAPP', 'PENDING_PAYMENT', 'PENDING', v_inv, v_exp)
    returning id into v_id;
  exception when unique_violation then
    raise exception 'AKUN_TIDAK_TERSEDIA';
  end;

  return query select v_inv, v_id, v_exp, v_acc.name, v_acc.account_code, v_acc.platform, v_cat, v_price;
end $$;

-- Status pesanan untuk halaman pembeli (payment.html / track.html)
drop function if exists public.get_transaction_by_invoice(text);
create or replace function public.get_transaction_by_invoice(p_invoice_id text)
returns table (invoice_id text, payment_status text, transaction_status text, price numeric,
  buyer_name text, buyer_whatsapp text, rejection_reason text, expires_at timestamptz,
  created_at timestamptz, verified_at timestamptz, completed_at timestamptz,
  account_id uuid, account_name text, account_code text, platform text, category_name text,
  payment_method text)
language sql security definer stable set search_path = public as $$
  select t.invoice_id, t.payment_status, t.transaction_status, t.price, t.buyer_name,
    t.buyer_whatsapp, t.rejection_reason, t.expires_at, t.created_at, t.verified_at, t.completed_at,
    a.id, a.name, a.account_code, a.platform, c.name, t.payment_method
  from transactions t
  left join accounts a on a.id = t.account_id
  left join categories c on c.id = a.category_id
  where t.invoice_id = p_invoice_id
  limit 1;
$$;

-- Pembeli membatalkan pesanannya sendiri selama belum dibayar
create or replace function public.cancel_order_by_invoice(p_invoice_id text)
returns table (invoice_id text, payment_status text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where transactions.invoice_id = p_invoice_id for update;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.payment_status <> 'PENDING_PAYMENT' then raise exception 'PESANAN_TIDAK_BISA_DIBATALKAN'; end if;
  update transactions
     set payment_status = 'EXPIRED', transaction_status = 'CANCELLED',
         rejection_reason = 'Dibatalkan oleh pembeli'
   where transactions.id = v_tx.id;
  update accounts set status = 'AVAILABLE' where id = v_tx.account_id and status = 'RESERVED';
  return query select v_tx.invoice_id, 'EXPIRED'::text;
end $$;

-- Admin: setujui pembayaran + selesaikan pesanan sekaligus (akun jadi SOLD lewat trigger)
create or replace function public.approve_and_complete_transaction(p_transaction_id uuid)
returns table (invoice_id text, payment_status text, transaction_status text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED'; end if;
  select * into v_tx from transactions where transactions.id = p_transaction_id for update;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.payment_status = 'PAID' and v_tx.transaction_status = 'COMPLETED' then
    return query select v_tx.invoice_id, v_tx.payment_status, v_tx.transaction_status;
    return;
  end if;
  update transactions
     set payment_status = 'PAID', transaction_status = 'COMPLETED', completed_at = now()
   where transactions.id = v_tx.id;
  return query select v_tx.invoice_id, 'PAID'::text, 'COMPLETED'::text;
end $$;

-- Admin: selesaikan pesanan yang sudah PAID
create or replace function public.complete_transaction(p_invoice_id text)
returns table (invoice_id text, transaction_status text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  if not public.is_admin() then raise exception 'UNAUTHORIZED'; end if;
  select * into v_tx from transactions where transactions.invoice_id = p_invoice_id for update;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.payment_status <> 'PAID' then raise exception 'PEMBAYARAN_BELUM_TERVERIFIKASI'; end if;
  update transactions set transaction_status = 'COMPLETED', completed_at = now()
   where transactions.id = v_tx.id;
  return query select v_tx.invoice_id, 'COMPLETED'::text;
end $$;

-- Pembeli: baca data login akun, HANYA setelah pesanan selesai
create or replace function public.get_purchased_account_credentials(p_invoice_id text)
returns table (account_email text, account_password text)
language plpgsql security definer set search_path = public as $$
declare v_tx transactions%rowtype;
begin
  select * into v_tx from transactions where invoice_id = p_invoice_id;
  if not found then raise exception 'TRANSAKSI_TIDAK_DITEMUKAN'; end if;
  if v_tx.transaction_status <> 'COMPLETED' or v_tx.payment_status <> 'PAID' then
    raise exception 'PESANAN_BELUM_SELESAI';
  end if;
  return query
    select c.account_email, c.account_password
      from account_credentials c where c.account_id = v_tx.account_id;
end $$;

-- ── Trigger: sinkron status akun & validasi perubahan status bayar ──
create or replace function public.handle_transaction_payment_status_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.payment_status = 'PAID' and old.payment_status is distinct from 'PAID' then
    new.verified_at := now();
    if new.transaction_status = 'PENDING' then new.transaction_status := 'PROCESSING'; end if;
  end if;
  if new.payment_status = 'REJECTED' and old.payment_status is distinct from 'REJECTED' then
    if new.rejection_reason is null or btrim(new.rejection_reason) = '' then
      raise exception 'Alasan penolakan wajib diisi.';
    end if;
    new.transaction_status := 'CANCELLED';
  end if;
  return new;
end $$;

drop trigger if exists trg_tx_payment_status on public.transactions;
create trigger trg_tx_payment_status before update on public.transactions
  for each row execute function public.handle_transaction_payment_status_change();

create or replace function public.sync_account_on_payment_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.account_id is not null and new.payment_status is distinct from old.payment_status then
    if new.payment_status = 'PAID' then
      update accounts set status = 'SOLD' where id = new.account_id;
    elsif new.payment_status = 'REJECTED' then
      update accounts set status = 'AVAILABLE' where id = new.account_id and status = 'RESERVED';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_sync_account_payment on public.transactions;
create trigger trg_sync_account_payment after update on public.transactions
  for each row execute function public.sync_account_on_payment_status();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles            enable row level security;
alter table public.categories          enable row level security;
alter table public.accounts            enable row level security;
alter table public.account_images      enable row level security;
alter table public.account_credentials enable row level security;
alter table public.offers              enable row level security;
alter table public.sell_requests       enable row level security;
alter table public.transactions        enable row level security;
alter table public.site_settings       enable row level security;
alter table public.banners             enable row level security;

do $$
declare r record;
begin  -- bersihkan policy lama supaya script ini bisa dijalankan ulang
  for r in select schemaname, tablename, policyname from pg_policies
            where schemaname = 'public'
              and tablename in ('profiles','categories','accounts','account_images','account_credentials',
                                'offers','sell_requests','transactions','site_settings','banners')
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

create policy "Baca profile sendiri"   on public.profiles for select using (auth.uid() = id);

create policy "Publik baca categories" on public.categories for select using (true);
create policy "Admin kelola categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

create policy "Publik baca accounts"   on public.accounts for select using (true);
create policy "Admin kelola accounts"  on public.accounts for all using (public.is_admin()) with check (public.is_admin());

create policy "Publik baca account_images"  on public.account_images for select using (true);
create policy "Admin kelola account_images" on public.account_images for all using (public.is_admin()) with check (public.is_admin());

create policy "Admin kelola account_credentials" on public.account_credentials
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Publik buat offer" on public.offers for insert
  with check (exists (select 1 from public.accounts where id = account_id and status = 'AVAILABLE'));
create policy "Admin kelola offers" on public.offers for all using (public.is_admin()) with check (public.is_admin());

create policy "Publik buat sell_request" on public.sell_requests for insert with check (true);
create policy "Admin kelola sell_requests" on public.sell_requests for all using (public.is_admin()) with check (public.is_admin());

-- transactions: publik TIDAK punya akses langsung — hanya lewat fungsi RPC di atas
create policy "Admin kelola transactions" on public.transactions
  for all using (public.is_admin()) with check (public.is_admin());

create policy "Publik baca site_settings"  on public.site_settings for select using (true);
create policy "Admin update site_settings" on public.site_settings for update using (public.is_admin()) with check (public.is_admin());

create policy "Publik baca banner aktif" on public.banners for select using (is_active = true or public.is_admin());
create policy "Admin kelola banner"      on public.banners for all using (public.is_admin()) with check (public.is_admin());

-- ── Hak eksekusi RPC ────────────────────────────────────────
revoke all on function public.complete_transaction(text) from public, anon;
revoke all on function public.approve_and_complete_transaction(uuid) from public, anon;
grant execute on function public.create_whatsapp_order(uuid, text, text, text) to anon, authenticated;
grant execute on function public.get_transaction_by_invoice(text) to anon, authenticated;
grant execute on function public.cancel_order_by_invoice(text) to anon, authenticated;
grant execute on function public.expire_stale_transactions() to anon, authenticated;
grant execute on function public.get_purchased_account_credentials(text) to anon, authenticated;
grant execute on function public.complete_transaction(text) to authenticated;
grant execute on function public.approve_and_complete_transaction(uuid) to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================
do $$
declare t text;
begin
  foreach t in array array['accounts','categories','offers','transactions','sell_requests','site_settings','banners']
  loop
    if not exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============================================================
-- STORAGE — satu bucket publik: foto akun, pengajuan jual, banner
-- ============================================================
insert into storage.buckets (id, name, public) values ('account-images', 'account-images', true)
on conflict (id) do nothing;

drop policy if exists "Publik baca account-images" on storage.objects;
drop policy if exists "Publik upload sell-requests" on storage.objects;
drop policy if exists "Admin upload accounts" on storage.objects;
drop policy if exists "Admin update account-images storage" on storage.objects;
drop policy if exists "Admin hapus account-images" on storage.objects;
drop policy if exists "Admin upload banner" on storage.objects;
drop policy if exists "Admin update banner" on storage.objects;
drop policy if exists "Admin hapus banner" on storage.objects;

create policy "Publik baca account-images" on storage.objects
  for select using (bucket_id = 'account-images');
create policy "Publik upload sell-requests" on storage.objects
  for insert with check (bucket_id = 'account-images' and (storage.foldername(name))[1] = 'sell-requests');
create policy "Admin upload accounts" on storage.objects
  for insert with check (bucket_id = 'account-images' and public.is_admin());
create policy "Admin update account-images storage" on storage.objects
  for update using (bucket_id = 'account-images' and public.is_admin())
  with check (bucket_id = 'account-images' and public.is_admin());
create policy "Admin hapus account-images" on storage.objects
  for delete using (bucket_id = 'account-images' and public.is_admin());

-- ============================================================
-- SELESAI. Buat admin pertama:
--   1. Supabase → Authentication → Add user (email + password)
--   2. update public.profiles set role = 'admin' where id = 'UUID_USER_TADI';
-- ============================================================
