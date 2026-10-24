/* ============================================================
   Gragon Store — product.js
   Halaman detail akun: galeri foto, modal Beli Sekarang & Tawar
   Harga. Migrasi: insert langsung ke Supabase (transactions/offers),
   pesan WhatsApp dibangun di browser lewat WA_TEMPLATES.
   ============================================================ */

(function () {
  const root = document.querySelector('[data-product-root]');
  if (!root) return;

  const params = new URLSearchParams(window.location.search);
  const accountId = params.get('id');

  const notFoundEl = document.querySelector('[data-product-not-found]');
  const loadingEl = document.querySelector('[data-product-loading]');

  if (!accountId) {
    root.style.display = 'none';
    loadingEl?.remove();
    if (notFoundEl) notFoundEl.style.display = 'block';
    return;
  }

  let currentAccount = null;
  const pendingAction = params.get('action');

  async function fetchAccount() {
    const { data, error } = await supabaseClient
      .from('accounts')
      .select('*, account_images(id, image_url, is_primary), categories(name)')
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  // Dulu POST /api/accounts/:id/check-status di server — sekarang cukup
  // select status terbaru langsung dari Supabase sebelum buka modal.
  // RESERVED (sedang di-checkout orang lain) juga diblokir, bukan hanya SOLD.
  async function checkStatus() {
    // Best-effort: bebaskan reservasi yang sudah kedaluwarsa sebelum cek.
    try {
      await supabaseClient.rpc('expire_stale_transactions');
    } catch (e) {
      /* abaikan — tetap lanjut cek status apa adanya */
    }
    const { data, error } = await supabaseClient
      .from('accounts')
      .select('id, status, price, name, discount_active, discount_price, discount_starts_at, discount_ends_at, promo_label')
      .eq('id', accountId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { available: false };
    return { available: data.status === 'AVAILABLE', data };
  }

  async function loadProduct() {
    try {
      const data = await fetchAccount();
      if (!data) throw new Error('Akun tidak ditemukan.');
      currentAccount = data;
      window.GRAGON_PRODUCT_ID = data.id;
      renderProduct(data);
      loadingEl?.remove();
      root.style.display = '';

      if (pendingAction === 'buy' || pendingAction === 'offer') {
        params.delete('action');
        const qs = params.toString();
        window.history.replaceState({}, '', qs ? `?${qs}` : window.location.pathname);

        if (data.status !== 'SOLD') {
          const targetBtn = document.querySelector(pendingAction === 'buy' ? '[data-buy-btn]' : '[data-offer-btn]');
          targetBtn?.click();
        } else {
          GRAGON.toast('Akun ini baru saja terjual. Silakan pilih akun lainnya.', 'error');
        }
      }
    } catch (e) {
      loadingEl?.remove();
      root.style.display = 'none';
      if (notFoundEl) notFoundEl.style.display = 'block';
    }
  }

  function renderProduct(account) {
    document.title = `${account.name} — Gragon Store`;

    const images = account.account_images || [];
    const sorted = [...images].sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
    const mainImg = document.querySelector('[data-gallery-main]');
    const thumbsWrap = document.querySelector('[data-gallery-thumbs]');

    if (sorted.length > 0) {
      mainImg.innerHTML = `<img src="${GRAGON.escapeAttr(sorted[0].image_url)}" alt="${GRAGON.escapeAttr(account.name)}" />`;
      thumbsWrap.innerHTML = sorted
        .map(
          (img, idx) => `
        <div class="product-gallery__thumb ${idx === 0 ? 'is-active' : ''}" data-thumb data-src="${GRAGON.escapeAttr(img.image_url)}">
          <img src="${GRAGON.escapeAttr(img.image_url)}" alt="" />
        </div>`
        )
        .join('');

      thumbsWrap.querySelectorAll('[data-thumb]').forEach((thumb) => {
        thumb.addEventListener('click', () => {
          mainImg.innerHTML = `<img src="${thumb.dataset.src}" alt="${GRAGON.escapeAttr(account.name)}" />`;
          thumbsWrap.querySelectorAll('[data-thumb]').forEach((t) => t.classList.remove('is-active'));
          thumb.classList.add('is-active');
        });
      });
    } else {
      mainImg.innerHTML = `<div class="account-card__media-fallback" style="height:100%;">Gragon Store</div>`;
      thumbsWrap.innerHTML = '';
    }

    const isSold = account.status === 'SOLD';
    const isReserved = account.status === 'RESERVED';

    document.querySelector('[data-product-code]').textContent = account.account_code || '';
    document.querySelector('[data-product-name]').textContent = account.name;
    document.querySelector('[data-product-platform]').textContent = account.platform;
    document.querySelector('[data-product-price]').innerHTML = GRAGON.priceMarkup(account);
    document.querySelector('[data-product-description]').textContent = account.description || '-';

    const detailsEl = document.querySelector('[data-product-details]');
    const detailsBlock = document.querySelector('[data-product-details-block]');
    if (account.details) {
      detailsEl.textContent = account.details;
    } else {
      detailsBlock?.remove();
    }

    const featuresEl = document.querySelector('[data-product-features]');
    const featuresBlock = document.querySelector('[data-product-features-block]');
    if (account.features) {
      featuresEl.textContent = account.features;
    } else {
      featuresBlock?.remove();
    }

    const statusBadge = document.querySelector('[data-product-status-badge]');
    statusBadge.textContent = isSold ? 'Sold' : isReserved ? 'Diproses' : 'Available';
    statusBadge.classList.add(isSold ? 'badge--sold' : isReserved ? 'badge--reserved' : 'badge--available');

    const categoryBadge = document.querySelector('[data-product-category-badge]');
    if (account.categories?.name) {
      categoryBadge.textContent = account.categories.name;
    } else {
      categoryBadge.remove();
    }

    const buyBtn = document.querySelector('[data-buy-btn]');
    const offerBtn = document.querySelector('[data-offer-btn]');
    if (isSold || isReserved) {
      buyBtn.disabled = true;
      offerBtn.disabled = true;
      buyBtn.textContent = isSold ? 'Sudah Terjual' : 'Sedang Diproses';
    }

    document.querySelectorAll('[data-modal-account-name]').forEach((el) => (el.textContent = account.name));
    document.querySelectorAll('[data-modal-account-price]').forEach((el) => (el.textContent = GRAGON.formatRupiah(GRAGON.getEffectivePrice(account))));
  }

  // ── Ambil template pesan & nomor admin dari site_settings ────
  async function getWhatsappContext() {
    const settings = (await GRAGON.loadSettings()) || {};
    return {
      adminNumber: settings.admin_whatsapp || '',
      templates: {
        buy: WA_TEMPLATES.DEFAULT_TEMPLATE_BUY,
        offer: WA_TEMPLATES.pick(settings.wa_template_offer, WA_TEMPLATES.DEFAULT_TEMPLATE_OFFER),
      },
    };
  }

  // ── BELI SEKARANG (manual via WhatsApp) ──────────────────────
  // Alur realistis:
  //  1. Cek status akun terbaru (AVAILABLE) sebelum buka form.
  //  2. Submit form → RPC create_whatsapp_order: akun dikunci (RESERVED)
  //     secara atomik di database + dibuat nomor pesanan GS-xxxx.
  //     Harga final dihitung ulang di server (bukan dari browser).
  //  3. Pesan WhatsApp dibangun dari data akun + pembeli + nomor pesanan,
  //     lalu pembeli otomatis diarahkan ke WhatsApp admin Gragon Store.
  //  4. Admin menyepakati pembayaran di chat, lalu Approve/Tolak di
  //     dashboard (akun SOLD / kembali AVAILABLE).
  const buyModal = document.querySelector('[data-buy-modal]');
  const buyForm = document.querySelector('[data-buy-form]');
  const orderModal = document.querySelector('[data-order-modal]');
  let orderSubmitting = false;
  let redirectTimer = null;

  function unavailableMessage(status) {
    return status === 'RESERVED'
      ? 'Akun ini sedang diproses pembeli lain. Silakan pilih akun lainnya atau coba lagi nanti.'
      : 'Akun ini baru saja terjual. Silakan pilih akun lainnya.';
  }

  function orderUrl(invoiceId) {
    return new URL(`/pesanan.html?invoice=${encodeURIComponent(invoiceId)}`, window.location.href).href;
  }

  function productUrl() {
    return new URL(`/akun.html?id=${encodeURIComponent(accountId)}`, window.location.href).href;
  }

  function buildBuyMessage({ invoiceId, price, name, wa, note, categoryName }) {
    return WA_TEMPLATES.fillTemplate(WA_TEMPLATES.DEFAULT_TEMPLATE_BUY, {
      'ID AKUN': currentAccount.account_code || '-',
      'NAMA AKUN': currentAccount.name,
      PLATFORM: currentAccount.platform || '-',
      KATEGORI: categoryName || currentAccount.categories?.name || '-',
      HARGA: WA_TEMPLATES.formatRupiah(price),
      'LINK AKUN': productUrl(),
      INVOICE: invoiceId || '(menunggu konfirmasi admin)',
      'LINK PESANAN': invoiceId ? orderUrl(invoiceId) : '-',
      'NAMA PEMBELI': name,
      'NOMOR PEMBELI': wa,
      CATATAN: note || '-',
    });
  }

  // Simpan pesanan terakhir di perangkat pembeli (hanya kemudahan, bukan data penting).
  function rememberOrder(invoiceId) {
    try {
      const list = JSON.parse((localStorage.getItem('gragon_orders') || localStorage.getItem('gondam_orders')) || '[]');
      list.unshift({ invoice: invoiceId, at: Date.now() });
      localStorage.setItem('gragon_orders', JSON.stringify(list.slice(0, 10)));
    } catch (e) {
      /* localStorage bisa diblokir — abaikan */
    }
  }

  function showOrderModal({ invoiceId, accountName, total, waMessage }) {
    const waBtn = document.querySelector('[data-order-wa-btn]');
    const statusLink = document.querySelector('[data-order-status-link]');
    document.querySelector('[data-order-invoice]').textContent = invoiceId || 'Menunggu konfirmasi';
    document.querySelector('[data-order-account]').textContent = accountName;
    document.querySelector('[data-order-total]').textContent = GRAGON.formatRupiah(total);

    if (invoiceId) {
      statusLink.href = orderUrl(invoiceId);
      statusLink.style.display = '';
    } else {
      statusLink.style.display = 'none';
    }
    waBtn.onclick = () => {
      clearTimeout(redirectTimer);
      GRAGON.goToWhatsApp(waMessage);
    };
    document.querySelector('[data-order-hint]').textContent =
      'Mengalihkan ke WhatsApp admin... Jika tidak terbuka otomatis, tekan tombol di bawah. Akunmu ditahan selama proses chat.';
    openModal(orderModal);
    clearTimeout(redirectTimer);
    redirectTimer = setTimeout(() => GRAGON.goToWhatsApp(waMessage), 1600);
  }

  document.querySelector('[data-order-close]')?.addEventListener('click', () => {
    clearTimeout(redirectTimer);
    closeModal(orderModal);
    window.location.reload(); // refresh supaya status akun (Diproses) tampil
  });

  document.querySelector('[data-buy-btn]')?.addEventListener('click', async () => {
    if (!currentAccount) return;
    try {
      const { available, data: acc } = await checkStatus();
      if (!available) {
        GRAGON.toast(unavailableMessage(acc?.status), 'error');
        return;
      }
      openModal(buyModal);
    } catch (e) {
      GRAGON.toast(e.message, 'error');
    }
  });

  buyForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (orderSubmitting) return; // cegah klik ganda
    const submitBtn = buyForm.querySelector('button[type="submit"]');
    const name = buyForm.querySelector('[name="buyer_name"]').value.trim();
    const wa = buyForm.querySelector('[name="buyer_whatsapp"]').value.trim();
    const note = buyForm.querySelector('[name="buyer_note"]').value.trim();

    if (name.length < 2) return GRAGON.toast('Nama wajib diisi (minimal 2 huruf).', 'error');
    if (!GRAGON.isValidWhatsApp(wa)) return GRAGON.toast('Nomor WhatsApp tidak valid. Contoh: 08123456789', 'error');

    orderSubmitting = true;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Membuat pesanan...';

    try {
      const { data, error } = await supabaseClient.rpc('create_whatsapp_order', {
        p_account_id: accountId,
        p_buyer_name: name,
        p_buyer_whatsapp: wa,
        p_buyer_note: note || null,
      });

      // Fungsi database belum dipasang (migration_v8 belum dijalankan):
      // tetap layani pembeli lewat WhatsApp tanpa reservasi otomatis.
      const rpcMissing =
        error &&
        (error.code === 'PGRST202' ||
          error.code === '42883' ||
          /schema cache|could not find the function/i.test(error.message || ''));
      if (rpcMissing) {
        console.warn('create_whatsapp_order belum terpasang — jalankan supabase/migration_v8_manual_whatsapp.sql', error);
        const fresh = await checkStatus();
        if (!fresh.available) throw new Error(unavailableMessage(fresh.data?.status));
        const price = GRAGON.getEffectivePrice(fresh.data || currentAccount);
        const waMessage = buildBuyMessage({ invoiceId: null, price, name, wa, note });
        closeModal(buyModal);
        buyForm.reset();
        showOrderModal({ invoiceId: null, accountName: currentAccount.name, total: price, waMessage });
        return;
      }

      if (error) {
        console.error('create_whatsapp_order gagal:', error);
        const msg = error.message || '';
        if (msg.includes('AKUN_TIDAK_TERSEDIA')) throw new Error('Maaf, akun ini baru saja diambil pembeli lain. Silakan pilih akun lainnya.');
        if (msg.includes('AKUN_TIDAK_DITEMUKAN')) throw new Error('Akun tidak ditemukan.');
        if (msg.includes('NAMA_WAJIB_DIISI')) throw new Error('Nama wajib diisi.');
        if (msg.includes('WHATSAPP_TIDAK_VALID')) throw new Error('Nomor WhatsApp tidak valid.');
        if (msg.includes('TERLALU_BANYAK_PESANAN')) throw new Error('Kamu masih punya 3 pesanan yang belum selesai. Selesaikan atau batalkan dulu sebelum memesan lagi.');
        if (error.code === '23505' || msg.includes('duplicate key value')) throw new Error('Akun ini baru saja mulai diproses. Silakan refresh halaman dan coba lagi.');
        throw new Error('Gagal membuat pesanan. Silakan coba lagi.');
      }

      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.invoice_id) throw new Error('Gagal membuat pesanan. Silakan coba lagi.');

      rememberOrder(row.invoice_id);
      const waMessage = buildBuyMessage({
        invoiceId: row.invoice_id,
        price: row.price,
        name,
        wa,
        note,
        categoryName: row.category_name,
      });
      closeModal(buyModal);
      buyForm.reset();
      showOrderModal({ invoiceId: row.invoice_id, accountName: row.account_name, total: row.price, waMessage });
    } catch (err) {
      GRAGON.toast(err.message, 'error', 7000);
    } finally {
      orderSubmitting = false;
      submitBtn.disabled = false;
      submitBtn.textContent = 'Pesan via WhatsApp';
    }
  });

  const offerModal = document.querySelector('[data-offer-modal]');
  const offerForm = document.querySelector('[data-offer-form]');

  document.querySelector('[data-offer-btn]')?.addEventListener('click', async () => {
    if (!currentAccount) return;
    try {
      const { available, data: acc } = await checkStatus();
      if (!available) {
        GRAGON.toast(unavailableMessage(acc?.status), 'error');
        return;
      }
      openModal(offerModal);
    } catch (e) {
      GRAGON.toast(e.message, 'error');
    }
  });

  offerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const submitBtn = offerForm.querySelector('button[type="submit"]');
    const offerPrice = Number(offerForm.querySelector('[name="offer_price"]').value);
    const name = offerForm.querySelector('[name="buyer_name"]').value.trim();
    const wa = offerForm.querySelector('[name="buyer_whatsapp"]').value.trim();
    const note = offerForm.querySelector('[name="note"]').value.trim();

    if (!offerPrice || offerPrice <= 0) return GRAGON.toast('Harga tawaran harus berupa angka dan tidak boleh kosong.', 'error');
    if (!name) return GRAGON.toast('Nama wajib diisi.', 'error');
    if (!GRAGON.isValidWhatsApp(wa)) return GRAGON.toast('Nomor WhatsApp wajib diisi dengan format yang benar.', 'error');

    submitBtn.disabled = true;
    submitBtn.textContent = 'Memproses...';

    try {
      const { available, data: acc } = await checkStatus();
      if (!available) throw new Error(unavailableMessage(acc?.status));

      // Sama seperti transactions: offers juga tidak memberi anon/authenticated
      // policy SELECT, jadi insert saja tanpa .select().single().
      const { error } = await supabaseClient.from('offers').insert({
        account_id: accountId,
        original_price: acc.price,
        offer_price: offerPrice,
        buyer_name: name,
        buyer_whatsapp: wa,
        note,
        status: 'PENDING',
      });
      if (error) throw error;

      const { adminNumber, templates } = await getWhatsappContext();
      const message = WA_TEMPLATES.fillTemplate(templates.offer, {
        'NAMA AKUN': currentAccount.name,
        'ID AKUN': currentAccount.account_code,
        PLATFORM: currentAccount.platform,
        KATEGORI: currentAccount.categories?.name || '-',
        'HARGA ASLI': WA_TEMPLATES.formatRupiah(acc.price),
        'HARGA TAWARAN': WA_TEMPLATES.formatRupiah(offerPrice),
        NAMA: name,
        NOMOR: wa,
        CATATAN: note || '-',
      });

      GRAGON.openWhatsApp(adminNumber, message);
      closeModal(offerModal);
      GRAGON.toast('Tawaran terkirim! Kamu akan diarahkan ke WhatsApp admin.', 'success');
      offerForm.reset();
    } catch (err) {
      GRAGON.toast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Ajukan Tawaran';
    }
  });

  function openModal(modal) {
    modal?.classList.add('is-open');
    document.body.style.overflow = 'hidden';
  }
  function closeModal(modal) {
    modal?.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  document.querySelectorAll('[data-modal-close]').forEach((btn) => {
    btn.addEventListener('click', () => closeModal(btn.closest('.modal-overlay')));
  });
  document.querySelectorAll('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal(overlay);
    });
  });

  loadProduct();
})();
