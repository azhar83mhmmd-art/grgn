/* ============================================================
   Gragon Store — app.js
   Shared utilities: navbar, toast, WhatsApp helper, settings,
   dan logika khusus homepage (featured accounts, kategori, hero).
   Migrasi: tidak lagi fetch ke /api/*, langsung ke Supabase client.
   ============================================================ */

const GRAGON = (function () {
  const state = {
    settings: null,
  };

  // ── Konfigurasi utama Gragon Store ──────────────────────────────
  // Nomor WhatsApp admin (format internasional tanpa +/0 depan).
  // 082357961890  →  6282357961890. Ganti di sini bila nomor berubah.
  const CONFIG = {
    BRAND: 'Gragon Store',
    ADMIN_WA: '6282357961890',
  };

  // 08xxxx / +628xxxx / 628xxxx  →  628xxxx (siap dipakai wa.me)
  function normalizePhone(raw) {
    let d = String(raw || '').replace(/\D/g, '');
    if (d.startsWith('0')) d = '62' + d.slice(1);
    else if (d.startsWith('8')) d = '62' + d;
    return d;
  }

  // ── Validasi ringan (dulu di lib/validators.js sisi server) ─
  function isValidWhatsApp(v) {
    if (typeof v !== 'string' || v.trim().length === 0) return false;
    const digits = v.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15;
  }

  // ── Ikon SVG (menggantikan emoji) ─────────────────────────
  const ICON_PATHS = {"check": "<polyline points=\"20 6 9 17 4 12\"></polyline>", "x": "<line x1=\"18\" y1=\"6\" x2=\"6\" y2=\"18\"></line><line x1=\"6\" y1=\"6\" x2=\"18\" y2=\"18\"></line>", "clock": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><polyline points=\"12 6 12 12 16 14\"></polyline>", "hourglass": "<path d=\"M5 22h14M5 2h14M17 22v-4.17a2 2 0 0 0-.59-1.42L12 12m0 0-4.41 4.41A2 2 0 0 0 7 17.83V22M12 12 7.59 7.59A2 2 0 0 1 7 6.17V2m10 0v4.17a2 2 0 0 1-.59 1.42L12 12\"></path>", "check-circle": "<path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"></path><polyline points=\"22 4 12 14.01 9 11.01\"></polyline>", "x-circle": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"15\" y1=\"9\" x2=\"9\" y2=\"15\"></line><line x1=\"9\" y1=\"9\" x2=\"15\" y2=\"15\"></line>", "ban": "<circle cx=\"12\" cy=\"12\" r=\"10\"></circle><line x1=\"4.93\" y1=\"4.93\" x2=\"19.07\" y2=\"19.07\"></line>", "lock": "<rect x=\"3\" y=\"11\" width=\"18\" height=\"11\" rx=\"2\"></rect><path d=\"M7 11V7a5 5 0 0 1 10 0v4\"></path>", "bolt": "<polygon points=\"13 2 3 14 12 14 11 22 21 10 12 10 13 2\"></polygon>", "chat": "<path d=\"M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z\"></path>", "arrow-right": "<line x1=\"5\" y1=\"12\" x2=\"19\" y2=\"12\"></line><polyline points=\"12 5 19 12 12 19\"></polyline>", "external": "<path d=\"M7 17 17 7\"></path><polyline points=\"7 7 17 7 17 17\"></polyline>", "chevron-up": "<polyline points=\"18 15 12 9 6 15\"></polyline>", "chevron-down": "<polyline points=\"6 9 12 15 18 9\"></polyline>", "trash": "<polyline points=\"3 6 5 6 21 6\"></polyline><path d=\"M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6\"></path><path d=\"M10 11v6M14 11v6\"></path><path d=\"M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2\"></path>", "alert": "<path d=\"M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z\"></path><line x1=\"12\" y1=\"9\" x2=\"12\" y2=\"13\"></line><line x1=\"12\" y1=\"17\" x2=\"12.01\" y2=\"17\"></line>", "circle": "<circle cx=\"12\" cy=\"12\" r=\"9\"></circle>", "dot": "<circle cx=\"12\" cy=\"12\" r=\"9\"></circle><circle cx=\"12\" cy=\"12\" r=\"4\" fill=\"currentColor\"></circle>", "eye": "<path d=\"M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z\"></path><circle cx=\"12\" cy=\"12\" r=\"3\"></circle>"};
  function icon(name, size = 16, cls = '') {
    const p = ICON_PATHS[name] || '';
    return `<svg class="icon ${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
  }

  // ── Toast ────────────────────────────────────────────────────
  function ensureToastStack() {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    return stack;
  }

  function toast(message, type = 'info', duration = 4200) {
    const stack = ensureToastStack();
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 220);
    }, duration);
  }

  // ── Format harga ────────────────────────────────────────────
  function formatRupiah(value) {
    const n = Number(value) || 0;
    return 'Rp' + n.toLocaleString('id-ID');
  }

  // ── Diskon: hitung harga yang berlaku sekarang (mirror dari
  // effective_price() di database) — dipakai HANYA untuk tampilan.
  // Harga transaksi sesungguhnya selalu dihitung ulang di server lewat
  // RPC create_purchase_transaction, jadi nilai ini tidak pernah dikirim
  // sebagai harga saat checkout.
  function isDiscountLive(account) {
    if (!account || !account.discount_active || account.discount_price == null) return false;
    const now = new Date();
    if (account.discount_starts_at && new Date(account.discount_starts_at) > now) return false;
    if (account.discount_ends_at && new Date(account.discount_ends_at) < now) return false;
    return Number(account.discount_price) < Number(account.price);
  }

  function getEffectivePrice(account) {
    return isDiscountLive(account) ? Number(account.discount_price) : Number(account.price);
  }

  function discountPercent(account) {
    if (!isDiscountLive(account)) return 0;
    const price = Number(account.price) || 0;
    const discountPrice = Number(account.discount_price) || 0;
    if (price <= 0) return 0;
    return Math.round(((price - discountPrice) / price) * 100);
  }

  // Markup harga siap pakai: harga coret + harga diskon + label promo,
  // atau harga normal saja kalau diskon tidak aktif.
  function priceMarkup(account) {
    if (!isDiscountLive(account)) {
      return `<span class="price-block__final">${formatRupiah(account.price)}</span>`;
    }
    const pct = discountPercent(account);
    const label = account.promo_label ? escapeAttr(account.promo_label) : `HEMAT ${pct}%`;
    return `
      <span class="price-block price-block--discount">
        <span class="price-block__promo-label">${label}</span>
        <del class="price-block__original">${formatRupiah(account.price)}</del>
        <span class="price-block__final">${formatRupiah(account.discount_price)}</span>
      </span>`;
  }

  // ── WhatsApp helper terpusat ──────────────────────────────
  // Dulu pesan dibuat backend; sekarang dibuat di browser lewat
  // WA_TEMPLATES (wa-templates.js) memakai template dari site_settings.
  function buildWhatsAppUrl(message, number) {
    const target = normalizePhone(number || CONFIG.ADMIN_WA);
    return `https://wa.me/${target}?text=${encodeURIComponent(message || '')}`;
  }

  // Buka WhatsApp admin di tab baru. Argumen pertama dipertahankan demi
  // kompatibilitas pemanggil lama, tetapi tujuan SELALU nomor admin
  // Gragon Store (CONFIG.ADMIN_WA) supaya tidak salah kirim.
  function openWhatsApp(_legacyAdminNumber, message) {
    const url = buildWhatsAppUrl(message);
    const win = window.open(url, '_blank', 'noopener');
    if (!win) window.location.href = url; // popup diblokir → pindah di tab yang sama
  }

  // Pindah langsung ke WhatsApp di tab yang sama. Lebih andal di HP
  // (tidak diblokir popup blocker) — dipakai setelah pesanan dibuat.
  function goToWhatsApp(message) {
    window.location.href = buildWhatsAppUrl(message);
  }

  // ── Settings (nama situs, whatsapp admin, footer, dst) ─────
  async function loadSettings() {
    if (state.settings) return state.settings;
    try {
      const { data, error } = await supabaseClient
        .from('site_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      state.settings = data || {};
    } catch (e) {
      state.settings = {};
    }
    applySettingsToDom();
    return state.settings;
  }

  function applySettingsToDom() {
    const s = state.settings || {};
    // Abaikan sisa nama lama (Kenarrz/Gondam) yang mungkin masih tersimpan di
    // database sebelum migration_v8 dijalankan.
    const isLegacy = (v) => /kenarrz|gondam/i.test(String(v || ''));
    const siteName = s.site_name && !isLegacy(s.site_name) ? s.site_name : CONFIG.BRAND;
    const footerText =
      s.footer_text && !isLegacy(s.footer_text)
        ? s.footer_text
        : `© ${new Date().getFullYear()} ${CONFIG.BRAND}. Seluruh hak cipta dilindungi.`;
    document.querySelectorAll('[data-site-name]').forEach((el) => {
      el.textContent = siteName;
    });
    document.querySelectorAll('[data-footer-text]').forEach((el) => {
      el.textContent = footerText;
    });
  }

  // ── Navbar mobile drawer ────────────────────────────────────
  function initNavbar() {
    const menuToggle = document.querySelector('[data-menu-toggle]');
    const drawer = document.querySelector('[data-mobile-drawer]');
    const closeBtn = document.querySelector('[data-drawer-close]');
    const backdrop = document.querySelector('[data-drawer-backdrop]');

    function openDrawer() {
      drawer?.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    }
    function closeDrawer() {
      drawer?.classList.remove('is-open');
      document.body.style.overflow = '';
    }

    menuToggle?.addEventListener('click', openDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    backdrop?.addEventListener('click', closeDrawer);

    const norm = (p) => (p.replace(/\/+$/, '').replace(/\.html$/, '') || '/').replace(/^\/(home|index)$/, '/');
    const here = norm(window.location.pathname);
    document.querySelectorAll('.navbar__link, .mobile-drawer__link').forEach((link) => {
      const href = link.getAttribute('href');
      if (href && norm(new URL(href, window.location.origin).pathname) === here) link.classList.add('is-active');
    });
  }

  // ── Skeleton generator ──────────────────────────────────────
  function skeletonCards(count) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += `
        <div class="account-card-skeleton">
          <div class="skeleton skeleton-media"></div>
          <div class="skeleton skeleton-line" style="width: 40%"></div>
          <div class="skeleton skeleton-line" style="width: 80%"></div>
          <div class="skeleton skeleton-line" style="width: 55%"></div>
        </div>`;
    }
    return html;
  }

  // ── Render satu account card (dipakai homepage & shop) ──────
  function renderAccountCard(account) {
    const images = account.account_images || [];
    const primary = images.find((img) => img.is_primary) || images[0];
    const isSold = account.status === 'SOLD';
    const isReserved = account.status === 'RESERVED';
    const isUnavailable = isSold || isReserved;
    const statusLabel = isSold ? 'Sold' : isReserved ? 'Diproses' : 'Available';
    const statusClass = isSold ? 'badge--sold' : isReserved ? 'badge--reserved' : 'badge--available';
    const categoryName = account.categories?.name || '';
    const productUrl = `/akun.html?id=${encodeURIComponent(account.id)}`;

    const mediaHtml = primary
      ? `<img src="${escapeAttr(primary.image_url)}" alt="${escapeAttr(account.name)}" loading="lazy" onerror="this.closest('.account-card__media').innerHTML='<div class=&quot;account-card__media-fallback&quot;>Gragon Store</div>'" />`
      : `<div class="account-card__media-fallback">Gragon Store</div>`;

    return `
      <div class="account-card ${isUnavailable ? 'is-sold' : ''}" data-account-id="${escapeAttr(account.id)}">
        <a class="account-card__link" href="${productUrl}">
          <div class="account-card__media">
            ${mediaHtml}
            <div class="account-card__badges">
              <span class="badge ${statusClass}" data-card-status-badge>${statusLabel}</span>
            </div>
            ${account.featured ? '<div class="account-card__stamp">Featured</div>' : ''}
            ${isDiscountLive(account) ? `<div class="account-card__promo-stamp">${account.promo_label ? escapeAttr(account.promo_label) : `HEMAT ${discountPercent(account)}%`}</div>` : ''}
          </div>
          <div class="account-card__perforation"></div>
          <div class="account-card__body">
            <span class="account-card__code">${escapeAttr(account.account_code || '')}</span>
            ${categoryName ? `<span class="account-card__category">${escapeAttr(categoryName)}</span>` : ''}
            <h3 class="account-card__name">${escapeAttr(account.name)}</h3>
            <p class="account-card__platform">${escapeAttr(account.platform)}</p>
            <p class="account-card__desc">${escapeAttr(account.description || '')}</p>
            <div class="account-card__price">${priceMarkup(account)}</div>
          </div>
        </a>
        <div class="account-card__actions">
          <button type="button" class="btn btn-sm btn-primary" data-card-buy="${escapeAttr(account.id)}" ${isUnavailable ? 'disabled' : ''}>Beli</button>
          <button type="button" class="btn btn-sm" data-card-offer="${escapeAttr(account.id)}" ${isUnavailable ? 'disabled' : ''}>Tawar</button>
        </div>
      </div>`;
  }

  // ── Delegasi klik Beli/Tawar dari card (homepage & shop) ─────
  function initCardActions() {
    document.addEventListener('click', (e) => {
      const buyBtn = e.target.closest('[data-card-buy]');
      if (buyBtn) {
        if (buyBtn.disabled) return;
        e.preventDefault();
        window.location.href = `/akun.html?id=${encodeURIComponent(buyBtn.dataset.cardBuy)}&action=buy`;
        return;
      }
      const offerBtn = e.target.closest('[data-card-offer]');
      if (offerBtn) {
        if (offerBtn.disabled) return;
        e.preventDefault();
        window.location.href = `/akun.html?id=${encodeURIComponent(offerBtn.dataset.cardOffer)}&action=offer`;
      }
    });
  }

  function escapeAttr(str) {
    if (typeof str !== 'string') return str ?? '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Homepage: featured accounts, kategori, hero search, stat ──
  async function initHomepage() {
    const featuredContainer = document.querySelector('[data-featured-accounts]');
    const categoryContainer = document.querySelector('[data-category-grid]');
    const heroSearchForm = document.querySelector('[data-hero-search]');
    const statTotal = document.querySelector('[data-stat-total]');
    const statCategory = document.querySelector('[data-stat-category]');

    if (!featuredContainer && !categoryContainer) return; // bukan homepage

    if (featuredContainer) featuredContainer.innerHTML = skeletonCards(4);

    // Tiga query independen (featured accounts, total tersedia, kategori)
    // dijalankan PARALEL lewat Promise.all, bukan berurutan — memangkas
    // waktu tunggu total dari (t1+t2+t3) jadi ~max(t1,t2,t3).
    const [featuredResult, statResult, categoryResult] = await Promise.allSettled([
      featuredContainer
        ? supabaseClient
            .from('accounts')
            .select('*, account_images(id, image_url, is_primary), categories(name)')
            // Akun RESERVED (sedang checkout, belum dikonfirmasi admin) tetap
            // ditampilkan — jangan langsung disembunyikan sebelum admin approve.
            .in('status', ['AVAILABLE', 'RESERVED'])
            .eq('featured', true)
            .order('created_at', { ascending: false })
            .limit(8)
        : Promise.resolve(null),
      statTotal
        ? supabaseClient.from('accounts').select('id', { count: 'exact', head: true }).eq('status', 'AVAILABLE')
        : Promise.resolve(null),
      categoryContainer
        ? supabaseClient.from('categories').select('*').order('name', { ascending: true })
        : Promise.resolve(null),
    ]);

    if (featuredContainer) {
      const res = featuredResult.status === 'fulfilled' ? featuredResult.value : null;
      if (!res || res.error) {
        featuredContainer.innerHTML = `
          <div class="empty-state" style="grid-column: 1/-1;">
            <h3>Terjadi Kesalahan</h3>
            <p>Data belum dapat dimuat. Silakan coba lagi.</p>
          </div>`;
      } else {
        const data = res.data;
        if (!data || data.length === 0) {
          featuredContainer.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
              <h3>Belum Ada Akun</h3>
              <p>Saat ini belum ada akun yang tersedia.</p>
            </div>`;
        } else {
          featuredContainer.innerHTML = data.map(renderAccountCard).join('');
        }
        if (statTotal) {
          const statRes = statResult.status === 'fulfilled' ? statResult.value : null;
          statTotal.textContent = statRes && !statRes.error ? statRes.count ?? data.length : data.length;
        }
      }
    }

    if (categoryContainer) {
      const res = categoryResult.status === 'fulfilled' ? categoryResult.value : null;
      if (!res || res.error) {
        categoryContainer.innerHTML = '';
      } else {
        const data = res.data;
        if (statCategory) statCategory.textContent = data?.length ?? 0;
        categoryContainer.innerHTML = (data || [])
          .map(
            (cat) => `
            <a class="category-chip" href="/katalog.html?category=${encodeURIComponent(cat.id)}">
              <span class="category-chip__name">${escapeAttr(cat.name)}</span>
              <span class="category-chip__count">Lihat akun ${icon('arrow-right', 13)}</span>
            </a>`
          )
          .join('');
      }
    }

    heroSearchForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = heroSearchForm.querySelector('input[name="q"]').value.trim();
      window.location.href = `/katalog.html${q ? `?search=${encodeURIComponent(q)}` : ''}`;
    });
  }

  // ── Init umum di semua halaman ──────────────────────────────
  function init() {
    initNavbar();
    initCardActions();
    loadSettings();
    initHomepage();

    document.querySelectorAll('[data-current-year]').forEach((el) => {
      el.textContent = new Date().getFullYear();
    });

    // Toggle show/hide untuk field password (/jual-akun, /dashboard, dst).
    document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.togglePassword);
        if (!input) return;
        const isHidden = input.type === 'password';
        input.type = isHidden ? 'text' : 'password';
        btn.textContent = isHidden ? 'Hide' : 'Show';
      });
    });
  }

  document.addEventListener('DOMContentLoaded', init);

  return {
    toast,
    icon,
    formatRupiah,
    openWhatsApp,
    goToWhatsApp,
    buildWhatsAppUrl,
    normalizePhone,
    CONFIG,
    ADMIN_WA: CONFIG.ADMIN_WA,
    loadSettings,
    getSettings: () => state.settings,
    renderAccountCard,
    skeletonCards,
    escapeAttr,
    isValidWhatsApp,
    isDiscountLive,
    getEffectivePrice,
    discountPercent,
    priceMarkup,
  };
})();
