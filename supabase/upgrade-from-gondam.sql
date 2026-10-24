-- ============================================================
-- Gragon Store — UPGRADE dari database lama (PT Gondam / Kenarrz)
-- Urutan: (1) jalankan schema.sql  →  (2) jalankan file ini.
-- Data akun, kategori, foto, tawaran, pengajuan, dan transaksi TETAP ada.
-- Aman dijalankan ulang.
-- ============================================================

-- 1. Ganti brand: kode akun ARZ-xxxxxx → GRG-xxxxxx
update public.accounts
   set account_code = 'GRG-' || substr(account_code, 5)
 where account_code like 'ARZ-%'
   and not exists (select 1 from public.accounts b where b.account_code = 'GRG-' || substr(accounts.account_code, 5));

-- 2. Ganti nama situs & buang template lama yang masih menyebut brand lama
update public.site_settings
   set site_name = 'Gragon Store',
       footer_text = case when footer_text ~* '(gondam|kenarrz)' then null else footer_text end,
       wa_template_buy = case when wa_template_buy ~* '(gondam|kenarrz)' then null else wa_template_buy end,
       wa_template_offer = case when wa_template_offer ~* '(gondam|kenarrz)' then null else wa_template_offer end,
       wa_template_sell = case when wa_template_sell ~* '(gondam|kenarrz)' then null else wa_template_sell end,
       admin_whatsapp = '6282357961890'
 where id = 1;

-- 3. Rapikan status pembayaran lama (alur bukti-bayar sudah tidak dipakai)
update public.transactions set payment_status = 'PENDING_PAYMENT' where payment_status in ('PROOF_SUBMITTED', 'VERIFYING');

alter table public.transactions drop constraint if exists transactions_payment_status_check;
alter table public.transactions add constraint transactions_payment_status_check
  check (payment_status in ('PENDING_PAYMENT', 'PAID', 'REJECTED', 'EXPIRED', 'COMPLETED'));

drop index if exists public.idx_tx_one_active;
create unique index idx_tx_one_active on public.transactions(account_id) where payment_status = 'PENDING_PAYMENT';

-- 4. Buang fungsi, trigger, dan ekstensi yang tidak dipakai
drop trigger  if exists trg_notify_telegram_proof_submitted on public.transactions;
drop function if exists public.notify_telegram_proof_submitted();
drop function if exists public.submit_payment_proof(text, text, text, text);
drop function if exists public.create_purchase_transaction(uuid, text, text, text);
drop trigger  if exists trg_transaction_complete_sync on public.transactions;
drop function if exists public.sync_account_on_transaction_complete();
drop sequence if exists public.account_code_seq;
drop table    if exists public.admin_profiles cascade;

-- 5. Buang kolom lama yang tidak dipakai lagi (QRIS DANA / bukti bayar / email-IG pembeli)
--    PERHATIAN: isi kolom-kolom ini pada pesanan lama akan hilang.
alter table public.transactions
  drop column if exists buyer_email,
  drop column if exists buyer_instagram,
  drop column if exists sender_name,
  drop column if exists sender_account_number,
  drop column if exists payment_proof_path,
  drop column if exists payment_submitted_at,
  drop column if exists verified_by;

alter table public.site_settings
  drop column if exists logo_url,
  drop column if exists admin_email,
  drop column if exists social_media,
  drop column if exists merchant_name,
  drop column if exists dana_business_name,
  drop column if exists dana_business_number,
  drop column if exists qris_image_path,
  drop column if exists payment_whatsapp_template,
  drop column if exists payment_instruction;

alter table public.accounts drop column if exists discount_percent;

-- 6. Policy storage lama untuk bucket QRIS / bukti bayar
drop policy if exists "Publik upload payment-proofs" on storage.objects;
drop policy if exists "Admin baca payment-proofs"    on storage.objects;
drop policy if exists "Admin kelola payment-proofs"  on storage.objects;
drop policy if exists "Admin hapus payment-proofs"   on storage.objects;
drop policy if exists "Publik baca payment-assets"   on storage.objects;
drop policy if exists "Admin kelola payment-assets"  on storage.objects;
drop policy if exists "Admin update payment-assets"  on storage.objects;
drop policy if exists "Admin hapus payment-assets"   on storage.objects;
-- Bucket "payment-proofs" & "payment-assets" hapus manual lewat Supabase → Storage
-- (kosongkan isinya dulu, lalu Delete bucket).
