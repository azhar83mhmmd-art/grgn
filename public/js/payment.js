/* ============================================================
   Gragon Store — payment.js
   Halaman STATUS PESANAN untuk pembelian manual via WhatsApp.
   - Detail pesanan diambil lewat RPC get_transaction_by_invoice
     (nomor pesanan = token akses acak, tidak mudah ditebak).
   - Pembayaran TIDAK diproses otomatis oleh website: pembeli
     membayar sesuai arahan admin di WhatsApp; status PAID/COMPLETED
     hanya ditetapkan admin dari dashboard.
   - Polling berkala supaya status ikut berubah saat admin
     approve/tolak. Data akun (kredensial) hanya muncul setelah
     pesanan COMPLETED.
   ============================================================ */

(function () {
  const root = document.querySelector('[data-payment-root]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const invoiceId = params.get('invoice');

  const loadingEl = document.querySelector('[data-payment-loading]');
  const notFoundEl = document.querySelector('[data-payment-not-found]');

  if (!invoiceId) {
    loadingEl?.remove();
    if (notFoundEl) notFoundEl.style.display = 'block';
    return;
  }

  let pollTimer = null;
  let countdownTimer = null;
  let currentTx = null;

  const STATUS_LABEL = {
    PENDING_PAYMENT: 'Menunggu Konfirmasi & Pembayaran',
    PROOF_SUBMITTED: 'Menunggu Verifikasi Admin',
    VERIFYING: 'Menunggu Verifikasi Admin',
    PAID: 'Pembayaran Diverifikasi',
    REJECTED: 'Pesanan Ditolak',
    EXPIRED: 'Pesanan Berakhir',
    COMPLETED: 'Selesai',
  };

  const STATUS_BADGE_CLASS = {
    PENDING_PAYMENT: 'badge--pending',
    PROOF_SUBMITTED: 'badge--verifying',
    VERIFYING: 'badge--verifying',
    PAID: 'badge--paid',
    REJECTED: 'badge--rejected',
    EXPIRED: 'badge--expired',
    COMPLETED: 'badge--paid',
  };

  const STATUS_ICON = {
    PENDING_PAYMENT: ['clock', 'icon--warn'],
    PROOF_SUBMITTED: ['hourglass', 'icon--accent'],
    VERIFYING: ['hourglass', 'icon--accent'],
    PAID: ['check-circle', 'icon--success'],
    REJECTED: ['x-circle', 'icon--danger'],
    EXPIRED: ['ban', 'icon--muted'],
  };

  const isCompleted = (tx) => tx.payment_status === 'PAID' && tx.transaction_status === 'COMPLETED';
  const isCancelledByBuyer = (tx) => tx.payment_status === 'EXPIRED' && tx.transaction_status === 'CANCELLED';

  // ── Link pesanan: tampilkan & siapkan tombol salin/bagikan ──
  function setupUrlTracking() {
    const urlInput = document.querySelector('[data-payment-url-input]');
    const fullUrl = window.location.href;
    if (urlInput) urlInput.value = fullUrl;

    document.querySelector('[data-copy-url-btn]')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(fullUrl);
        GRAGON.toast('Link pesanan berhasil disalin.', 'success');
      } catch (e) {
        urlInput?.select();
        GRAGON.toast('Gagal menyalin otomatis — silakan salin manual.', 'error');
      }
    });

    const shareBtn = document.querySelector('[data-share-url-btn]');
    if (shareBtn && navigator.share) {
      shareBtn.style.display = '';
      shareBtn.addEventListener('click', async () => {
        try {
          await navigator.share({ title: 'Link Pesanan Gragon Store', url: fullUrl });
        } catch (e) {
          /* dibatalkan user, abaikan */
        }
      });
    }
  }

  // ── Timeline status pesanan ─────────────────────────────────
  function renderTimeline(tx) {
    const el = document.querySelector('[data-payment-timeline]');
    if (!el) return;

    if (isCancelledByBuyer(tx)) {
      el.innerHTML = `
        <li class="tx-timeline__item is-done"><span class="tx-timeline__icon">${GRAGON.icon('check', 15)}</span> Pesanan dibuat</li>
        <li class="tx-timeline__item is-rejected"><span class="tx-timeline__icon">${GRAGON.icon('x', 15)}</span> Dibatalkan oleh pembeli</li>`;
      return;
    }
    if (tx.payment_status === 'REJECTED') {
      el.innerHTML = `
        <li class="tx-timeline__item is-done"><span class="tx-timeline__icon">${GRAGON.icon('check', 15)}</span> Pesanan dibuat</li>
        <li class="tx-timeline__item is-rejected"><span class="tx-timeline__icon">${GRAGON.icon('x', 15)}</span> Pesanan ditolak / dibatalkan admin</li>`;
      return;
    }
    if (tx.payment_status === 'EXPIRED') {
      el.innerHTML = `
        <li class="tx-timeline__item is-done"><span class="tx-timeline__icon">${GRAGON.icon('check', 15)}</span> Pesanan dibuat</li>
        <li class="tx-timeline__item is-rejected"><span class="tx-timeline__icon">${GRAGON.icon('clock', 15)}</span> Masa tahan akun habis — pembayaran tidak dikonfirmasi tepat waktu</li>`;
      return;
    }

    const steps = [
      'Pesanan dibuat',
      'Chat admin & pembayaran via WhatsApp',
      'Verifikasi admin',
      'Pesanan selesai — akun diserahkan',
    ];

    let currentIdx = 1;
    if (['PROOF_SUBMITTED', 'VERIFYING'].includes(tx.payment_status)) currentIdx = 2;
    else if (tx.payment_status === 'PAID' && !isCompleted(tx)) currentIdx = 3;
    else if (isCompleted(tx)) currentIdx = 4; // semua selesai

    el.innerHTML = steps
      .map((label, idx) => {
        let cls = 'is-pending';
        let icon = GRAGON.icon('circle', 15);
        if (idx < currentIdx) {
          cls = 'is-done';
          icon = GRAGON.icon('check', 15);
        } else if (idx === currentIdx) {
          cls = 'is-current';
          icon = GRAGON.icon('dot', 15);
        }
        return `<li class="tx-timeline__item ${cls}"><span class="tx-timeline__icon">${icon}</span> ${label}</li>`;
      })
      .join('');
  }

  // ── AKUN ANDA: hanya diambil & ditampilkan setelah COMPLETED ─
  async function renderCredentialsIfCompleted(tx) {
    const block = document.querySelector('[data-payment-credentials-block]');
    if (!block) return;
    if (!isCompleted(tx)) {
      block.style.display = 'none';
      return;
    }
    block.style.display = '';
    const loading = block.querySelector('[data-payment-credentials-loading]');
    const emailInput = block.querySelector('[data-cred-email]');
    const passwordInput = block.querySelector('[data-cred-password]');
    if (emailInput.dataset.loaded === '1') return; // jangan fetch ulang tiap poll
    try {
      const { data, error } = await supabaseClient.rpc('get_purchased_account_credentials', { p_invoice_id: invoiceId });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      emailInput.value = row?.account_email || '-';
      passwordInput.value = row?.account_password || '-';
      emailInput.dataset.loaded = '1';
      if (loading) loading.style.display = 'none';
    } catch (e) {
      if (loading) loading.textContent = 'Data akun belum dapat dimuat. Silakan refresh halaman atau hubungi admin.';
    }
  }

  document.querySelector('[data-toggle-cred-password-btn]')?.addEventListener('click', (e) => {
    const input = document.querySelector('[data-cred-password]');
    const hidden = input.type === 'password';
    input.type = hidden ? 'text' : 'password';
    e.target.textContent = hidden ? 'Sembunyikan Password' : 'Tampilkan Password';
  });
  async function copyValue(selector, okMsg) {
    try {
      await navigator.clipboard.writeText(document.querySelector(selector).value);
      GRAGON.toast(okMsg, 'success');
    } catch (e) {
      GRAGON.toast('Gagal menyalin.', 'error');
    }
  }
  document.querySelector('[data-copy-email-btn]')?.addEventListener('click', () => copyValue('[data-cred-email]', 'Email berhasil disalin.'));
  document.querySelector('[data-copy-password-btn]')?.addEventListener('click', () => copyValue('[data-cred-password]', 'Password berhasil disalin.'));

  async function fetchTransaction() {
    const { data, error } = await supabaseClient.rpc('get_transaction_by_invoice', { p_invoice_id: invoiceId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row || null;
  }

  // ── Hitung mundur masa tahan akun ───────────────────────────
  function renderCountdown(expiresAt) {
    const row = document.querySelector('[data-payment-countdown-row]');
    const el = document.querySelector('[data-payment-countdown]');
    clearInterval(countdownTimer);
    if (!expiresAt) {
      row.style.display = 'none';
      return;
    }
    row.style.display = '';

    function tick() {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) {
        el.textContent = 'Habis';
        clearInterval(countdownTimer);
        refreshAfterExpiry();
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const sec = Math.floor((diff % 60000) / 1000);
      el.textContent = h > 0 ? `${h} jam ${m} menit` : `${m}:${String(sec).padStart(2, '0')}`;
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  async function refreshAfterExpiry() {
    try {
      await supabaseClient.rpc('expire_stale_transactions');
    } catch (e) {
      /* abaikan */
    }
    loadAndRender();
  }

  // ── Render ──────────────────────────────────────────────────
  function renderTransaction(tx) {
    currentTx = tx;
    document.querySelector('[data-payment-invoice]').textContent = tx.invoice_id;
    document.querySelector('[data-payment-account-name]').textContent = tx.account_name || '-';
    document.querySelector('[data-payment-account-code]').textContent = tx.account_code || '-';
    document.querySelector('[data-payment-platform]').textContent = tx.platform || '-';
    document.querySelector('[data-payment-category]').textContent = tx.category_name || '-';
    document.querySelector('[data-payment-price]').textContent = GRAGON.formatRupiah(tx.price);
    document.querySelector('[data-payment-total]').textContent = GRAGON.formatRupiah(tx.price);

    const badge = document.querySelector('[data-payment-status-badge]');
    let label;
    let ic;
    if (isCompleted(tx)) { label = 'Pesanan Selesai'; ic = ['check-circle', '']; }
    else if (isCancelledByBuyer(tx)) { label = 'Dibatalkan'; ic = ['ban', '']; }
    else { label = STATUS_LABEL[tx.payment_status] || tx.payment_status; ic = STATUS_ICON[tx.payment_status]; }
    badge.innerHTML = `${ic ? GRAGON.icon(ic[0], 14) + ' ' : ''}${GRAGON.escapeAttr(label)}`;
    badge.className = `badge ${STATUS_BADGE_CLASS[tx.payment_status] || 'badge--neutral'}`;

    renderTimeline(tx);
    renderCredentialsIfCompleted(tx);

    const descEl = document.querySelector('[data-payment-status-desc]');
    const actionsBlock = document.querySelector('[data-payment-actions-block]');
    const finalBlock = document.querySelector('[data-payment-final-block]');
    const finalIcon = document.querySelector('[data-payment-final-icon]');
    const setFinalIcon = (name, cls) => { finalIcon.innerHTML = GRAGON.icon(name, 30, cls); };
    const finalTitle = document.querySelector('[data-payment-final-title]');
    const finalMessage = document.querySelector('[data-payment-final-message]');
    const rejectionBox = document.querySelector('[data-payment-rejection-box]');
    const cancelBtn = document.querySelector('[data-cancel-order-btn]');

    actionsBlock.style.display = 'none';
    finalBlock.style.display = 'none';
    rejectionBox.style.display = 'none';
    descEl.textContent = '';

    switch (tx.payment_status) {
      case 'PENDING_PAYMENT':
        descEl.textContent = 'Pesanan kamu sudah tercatat dan akunnya kami tahan. Lanjutkan chat dengan admin di WhatsApp untuk pembayaran.';
        actionsBlock.style.display = '';
        if (cancelBtn) cancelBtn.style.display = '';
        renderCountdown(tx.expires_at);
        break;
      case 'PROOF_SUBMITTED':
      case 'VERIFYING':
        clearInterval(countdownTimer);
        document.querySelector('[data-payment-countdown-row]').style.display = 'none';
        actionsBlock.style.display = '';
        if (cancelBtn) cancelBtn.style.display = 'none';
        finalBlock.style.display = '';
        setFinalIcon('hourglass', 'icon--accent');
        finalTitle.textContent = 'Menunggu Verifikasi Admin';
        finalMessage.textContent = 'Admin sedang memeriksa pembayaranmu secara manual. Halaman ini akan berubah otomatis.';
        break;
      case 'PAID':
        clearInterval(countdownTimer);
        document.querySelector('[data-payment-countdown-row]').style.display = 'none';
        finalBlock.style.display = '';
        if (isCompleted(tx)) {
          setFinalIcon('check-circle', 'icon--success');
          finalTitle.textContent = 'Pesanan Selesai';
          finalMessage.textContent = 'Pembayaran sudah diverifikasi dan akun diserahkan. Data akun ada di bagian "AKUN ANDA" di bawah. Segera ganti password setelah login.';
          stopPolling();
        } else {
          setFinalIcon('check', 'icon--success');
          finalTitle.textContent = 'Pembayaran Diverifikasi';
          finalMessage.textContent = 'Admin sedang menyiapkan serah terima akun. Simpan link pesanan ini — data akun akan tampil di sini.';
        }
        break;
      case 'COMPLETED':
        clearInterval(countdownTimer);
        finalBlock.style.display = '';
        setFinalIcon('check', 'icon--success');
        finalTitle.textContent = 'Transaksi Selesai';
        finalMessage.textContent = 'Akun sudah diserahkan. Terima kasih sudah berbelanja di Gragon Store.';
        stopPolling();
        break;
      case 'REJECTED':
        clearInterval(countdownTimer);
        document.querySelector('[data-payment-countdown-row]').style.display = 'none';
        finalBlock.style.display = '';
        setFinalIcon('x', 'icon--danger');
        finalTitle.textContent = 'Pesanan Ditolak';
        finalMessage.textContent = 'Admin menolak atau membatalkan pesanan ini. Akun kembali tersedia untuk pembeli lain.';
        if (tx.rejection_reason) {
          rejectionBox.style.display = '';
          document.querySelector('[data-payment-rejection-reason]').textContent = tx.rejection_reason;
        }
        stopPolling();
        break;
      case 'EXPIRED':
        clearInterval(countdownTimer);
        document.querySelector('[data-payment-countdown-row]').style.display = 'none';
        finalBlock.style.display = '';
        isCancelledByBuyer(tx) ? setFinalIcon('x', 'icon--danger') : setFinalIcon('clock', 'icon--warn');
        finalTitle.textContent = isCancelledByBuyer(tx) ? 'Pesanan Dibatalkan' : 'Masa Tahan Akun Habis';
        finalMessage.textContent = isCancelledByBuyer(tx)
          ? 'Kamu membatalkan pesanan ini. Silakan pilih akun lain atau buat pesanan baru.'
          : 'Pembayaran tidak dikonfirmasi sebelum masa tahan habis, sehingga akun dilepas kembali. Jika masih berminat dan akunnya tersedia, silakan buat pesanan baru.';
        stopPolling();
        break;
      default:
        break;
    }
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(async () => {
      try {
        const tx = await fetchTransaction();
        if (tx) renderTransaction(tx);
      } catch (e) {
        /* diamkan — coba lagi di polling berikutnya */
      }
    }, 8000);
  }

  function stopPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = null;
  }

  async function loadAndRender() {
    try {
      const tx = await fetchTransaction();
      if (!tx) {
        loadingEl?.remove();
        if (notFoundEl) notFoundEl.style.display = 'block';
        return;
      }
      loadingEl?.remove();
      root.style.display = '';
      renderTransaction(tx);
      if (['PENDING_PAYMENT', 'PROOF_SUBMITTED', 'VERIFYING'].includes(tx.payment_status) || (tx.payment_status === 'PAID' && !isCompleted(tx))) {
        startPolling();
      }
    } catch (e) {
      loadingEl?.remove();
      if (notFoundEl) {
        notFoundEl.style.display = 'block';
        notFoundEl.querySelector('p').textContent = 'Pesanan tidak dapat dimuat. Silakan coba lagi.';
      }
    }
  }

  // ── Chat admin (tindak lanjut) ──────────────────────────────
  document.querySelector('[data-chat-admin-btn]')?.addEventListener('click', () => {
    if (!currentTx) return;
    const message = WA_TEMPLATES.fillTemplate(WA_TEMPLATES.DEFAULT_TEMPLATE_ORDER_FOLLOWUP, {
      INVOICE: currentTx.invoice_id,
      'NAMA AKUN': currentTx.account_name || '-',
      'ID AKUN': currentTx.account_code || '-',
      HARGA: WA_TEMPLATES.formatRupiah(currentTx.price),
      STATUS: STATUS_LABEL[currentTx.payment_status] || currentTx.payment_status,
      'LINK PESANAN': window.location.href,
    });
    GRAGON.openWhatsApp('', message);
  });

  // ── Batalkan pesanan (hanya saat belum dibayar) ─────────────
  document.querySelector('[data-cancel-order-btn]')?.addEventListener('click', async (e) => {
    if (!currentTx || currentTx.payment_status !== 'PENDING_PAYMENT') return;
    if (!confirm('Batalkan pesanan ini? Akun akan dilepas dan bisa dibeli orang lain.')) return;
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('cancel_order_by_invoice', { p_invoice_id: invoiceId });
      if (error) {
        if ((error.message || '').includes('PESANAN_TIDAK_BISA_DIBATALKAN')) throw new Error('Pesanan ini sudah diproses admin dan tidak bisa dibatalkan dari sini. Hubungi admin lewat WhatsApp.');
        throw new Error('Gagal membatalkan pesanan. Silakan coba lagi.');
      }
      GRAGON.toast('Pesanan dibatalkan.', 'success');
      loadAndRender();
    } catch (err) {
      GRAGON.toast(err.message, 'error', 7000);
    } finally {
      btn.disabled = false;
    }
  });

  window.addEventListener('beforeunload', () => {
    stopPolling();
    clearInterval(countdownTimer);
  });

  loadAndRender();
  setupUrlTracking();
})();
