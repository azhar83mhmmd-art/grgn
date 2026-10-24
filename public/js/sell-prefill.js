/* ============================================================
   Gragon Store — sell-prefill.js
   Skrip tambahan khusus /jual-akun: mengisi otomatis form Jual
   Akun dari data yang dikirim halaman Kalkulator Harga FF
   (lewat sessionStorage), lalu membiarkan user tetap bisa
   mengubah semua nilainya sebelum mengirim. Tidak mengubah
   sell.js atau logika submit form yang sudah ada.
   ============================================================ */

(function () {
  const form = document.querySelector('[data-sell-form]');
  if (!form) return;

  let payload = null;
  try {
    const raw = sessionStorage.getItem('gragon_calc_handoff');
    if (raw) payload = JSON.parse(raw);
  } catch (e) {
    payload = null;
  }
  if (!payload) return;

  try {
    sessionStorage.removeItem('gragon_calc_handoff');
  } catch (e) {
    /* noop */
  }

  function fill() {
    const platformInput = form.querySelector('[name="platform"]');
    const priceInput = form.querySelector('[name="desired_price"]');
    const detailsInput = form.querySelector('[name="details"]');
    const nameInput = form.querySelector('[name="account_name"]');

    if (platformInput && !platformInput.value) platformInput.value = payload.platform || 'Free Fire';
    if (nameInput && !nameInput.value) nameInput.value = 'Akun Free Fire';
    if (priceInput && payload.desired_price != null) priceInput.value = payload.desired_price;
    if (detailsInput && payload.details) detailsInput.value = payload.details;

    GRAGON?.toast?.('Data dari kalkulator sudah diisi otomatis. Silakan cek dan lengkapi sebelum mengirim.', 'info');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', fill);
  } else {
    fill();
  }
})();
