/* ============================================================
   Gragon Store — calculator.js
   Kalkulator estimasi harga akun Free Fire. Fitur tambahan,
   berdiri sendiri — tidak menyentuh checkout, transaksi,
   jual akun, admin dashboard, atau logika Supabase lain.

   Struktur harga (tetap, jangan diubah tanpa diminta):
     Harga dasar akun        Rp10.000 (flat)
     Level                   Rp100 / level
     Rank (tier, harga tetap sesuai tier terpilih):
       Bronze       Rp0
       Silver       Rp1.000
       Gold         Rp2.000
       Platinum     Rp3.000
       Diamond      Rp5.000
       Heroic       Rp10.000
       Master       Rp15.000
       Grandmaster  Rp20.000
     Evo Gun Lv.1-3           Rp5.000 / pcs
     Evo Gun Lv.4-6           Rp15.000 / pcs
     Evo Gun Max              Rp40.000 / pcs
     Bundle/Outfit            Rp250 / pcs
     Emote                    Rp1.000 / pcs
     Skin Senjata             Rp100 / pcs
     Skin Senjata Langka      Rp500 / pcs
     Item Limited             Rp10.000 / pcs
     Item Event Lama          Rp5.000 / pcs
     Vehicle Skin             Rp1.000 / pcs
     Pet                      Rp2.000 / pcs
     Pet Skin                 Rp500 / pcs
   ============================================================ */

(function () {
  const form = document.querySelector('[data-calc-form]');
  if (!form) return; // bukan halaman kalkulator

  const resultEl = document.querySelector('[data-calc-result]');
  const errorEl = document.querySelector('[data-calc-error]');
  const totalEl = document.querySelector('[data-calc-total]');
  const roundedEl = document.querySelector('[data-calc-rounded]');
  const contactBtn = document.querySelector('[data-calc-contact-admin]');
  const sellBtn = document.querySelector('[data-calc-sell]');
  const resetBtn = document.querySelector('[data-calc-reset]');
  const rankSelect = document.querySelector('[data-calc-rank-select]');
  const rankIconEl = document.querySelector('[data-calc-rank-icon]');

  const BASE_PRICE = 10000;

  // Faktor per-unit: field name -> harga per pcs/level
  const FACTORS = {
    level: 100,
    evo1: 5000,
    evo2: 15000,
    evo3: 40000,
    bundle: 250,
    emote: 1000,
    skin: 100,
    skinRare: 500,
    limited: 10000,
    eventOld: 5000,
    vehicleSkin: 1000,
    pet: 2000,
    petSkin: 500,
  };

  // Harga rank: nilai TETAP sesuai tier terpilih (bukan dikali level)
  const RANK_PRICE = {
    1: 0,      // Bronze
    2: 1000,   // Silver
    3: 2000,   // Gold
    4: 3000,   // Platinum
    5: 5000,   // Diamond
    6: 10000,  // Heroic
    7: 15000,  // Master
    8: 20000,  // Grandmaster
  };

  const RANK_LABELS = {
    1: 'Bronze',
    2: 'Silver',
    3: 'Gold',
    4: 'Platinum',
    5: 'Diamond',
    6: 'Heroic',
    7: 'Master',
    8: 'Grandmaster',
  };

  const RANK_ICONS = {
    bronze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><path d="M8.5 13.5 6 22l6-3 6 3-2.5-8.5"></path></svg>',
    silver: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><path d="M8.5 13.5 6 22l6-3 6 3-2.5-8.5"></path><circle cx="12" cy="8" r="2.5"></circle></svg>',
    gold: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="6"></circle><path d="M8.5 13.5 6 22l6-3 6 3-2.5-8.5"></path><path d="M12 5v6M9 8h6"></path></svg>',
    platinum: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 3 9l9 13 9-13Z"></path><path d="M3 9h18M9 9l3 13 3-13"></path></svg>',
    diamond: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 3 12 0 4 6-10 12L2 9Z"></path><path d="M2 9h20M9 3l-2 6 5 12 5-12-2-6"></path></svg>',
    heroic: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2 2 6.5v5C2 17 6 21 12 22c6-1 10-5 10-10.5v-5Z"></path><path d="M9 12.5 11 14.5 15.5 10"></path></svg>',
    master: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 4h16v4l-4 3 4 3v4H4v-4l4-3-4-3Z"></path><path d="M9 4v3.5M15 4v3.5M9 16.5V20M15 16.5V20"></path></svg>',
    grandmaster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 2 2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 16.9l-5.8 3 1.1-6.5L2.6 8.8l6.5-.9Z"></path></svg>',
  };

  let lastResult = null; // { values, subtotals, rankPrice, total, rounded }

  // ── Ikon rank berubah mengikuti pilihan di dropdown ──────────
  function updateRankIcon() {
    if (!rankSelect || !rankIconEl) return;
    const opt = rankSelect.options[rankSelect.selectedIndex];
    const key = opt ? opt.dataset.rankIcon : '';
    rankIconEl.innerHTML = RANK_ICONS[key] || '';
    rankIconEl.className = `calc-select-icon calc-select-icon--${key || 'default'}`;
  }
  rankSelect?.addEventListener('change', updateRankIcon);
  updateRankIcon();

  // ── Input sanitasi: hanya angka positif atau 0, tanpa NaN/Infinity ──
  function sanitizeInputValue(input) {
    let raw = input.value.replace(/[^0-9]/g, ''); // hanya digit, tolak huruf & minus
    if (raw.length > 1) raw = raw.replace(/^0+(?=\d)/, ''); // buang leading zero berlebih
    if (raw !== input.value) input.value = raw;
  }

  document.querySelectorAll('[data-calc-input]').forEach((input) => {
    input.addEventListener('input', () => sanitizeInputValue(input));
    input.addEventListener('blur', () => {
      if (input.value === '') input.value = '0';
    });
    // Cegah minus/e/plus yang biasanya masih bisa diketik di input number
    input.addEventListener('keydown', (e) => {
      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
    });
    input.addEventListener('paste', (e) => {
      const text = (e.clipboardData || window.clipboardData).getData('text');
      if (/[^0-9]/.test(text)) e.preventDefault();
    });
  });

  function readValue(input) {
    if (!input) return 0;
    const raw = input.value;
    if (raw === '' || raw === null || raw === undefined) return 0;
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  }

  function roundToNearest10k(value) {
    if (!Number.isFinite(value) || value <= 0) return 0;
    return Math.round(value / 10000) * 10000;
  }

  function calculate() {
    const values = {};
    Object.keys(FACTORS).forEach((key) => {
      const input = form.querySelector(`[name="${key}"]`);
      values[key] = readValue(input);
    });
    const rankValue = readValue(rankSelect);
    values.rank = rankValue;

    const subtotals = {};
    let total = BASE_PRICE;
    Object.keys(FACTORS).forEach((key) => {
      const subtotal = values[key] * FACTORS[key];
      subtotals[key] = subtotal;
      total += subtotal;
    });

    const rankPrice = RANK_PRICE[rankValue] || 0;
    total += rankPrice;

    if (!Number.isFinite(total)) total = BASE_PRICE; // jaga-jaga, tidak boleh Infinity/NaN

    return {
      values,
      subtotals,
      rankPrice,
      total,
      rounded: roundToNearest10k(total),
    };
  }

  function renderResult(result) {
    // Hanya total akhir yang ditampilkan sebagai nominal rupiah.
    // Baris rincian di bawah menampilkan JUMLAH item yang diisi user,
    // bukan harga per satuan / subtotal rupiah masing-masing faktor.
    totalEl.textContent = GRAGON.formatRupiah(result.total);
    if (roundedEl) roundedEl.textContent = GRAGON.formatRupiah(result.rounded);

    Object.keys(FACTORS).forEach((key) => {
      const cell = document.querySelector(`[data-calc-row="${key}"]`);
      if (cell) cell.textContent = String(result.values[key]);
    });

    const rankLabelEl = document.querySelector('[data-calc-rank-label]');
    if (rankLabelEl) {
      const label = RANK_LABELS[result.values.rank] || '-';
      const ic = RANK_ICONS[label.toLowerCase()] || '';
      rankLabelEl.innerHTML = `<span class="inline-icon">${ic}</span> ${GRAGON.escapeAttr(label)}`;
    }
    resultEl.hidden = false;
    resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (errorEl) errorEl.style.display = 'none';
    const result = calculate();
    lastResult = result;
    renderResult(result);
  });

  resetBtn?.addEventListener('click', () => {
    form.reset();
    document.querySelectorAll('[data-calc-input]').forEach((input) => {
      input.value = '0';
    });
    if (rankSelect) rankSelect.selectedIndex = 0;
    updateRankIcon();
    resultEl.hidden = true;
    lastResult = null;
    form.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  contactBtn?.addEventListener('click', async () => {
    if (!lastResult) return;
    const settings = (await GRAGON.loadSettings()) || {};
    const message = WA_TEMPLATES.fillTemplate(WA_TEMPLATES.DEFAULT_TEMPLATE_CALCULATOR, {
      'HASIL KALKULATOR': WA_TEMPLATES.formatRupiah(lastResult.total),
    });
    GRAGON.openWhatsApp(settings.admin_whatsapp || '', message);
  });

  sellBtn?.addEventListener('click', () => {
    if (!lastResult) return;
    const v = lastResult.values;
    const rankLabel = (RANK_LABELS[v.rank] || '-');
    const details = [
      `Level: ${v.level}`,
      `Rank: ${rankLabel}`,
      `Evo Gun Lv.1-3: ${v.evo1}`,
      `Evo Gun Lv.4-6: ${v.evo2}`,
      `Evo Gun Max: ${v.evo3}`,
      `Bundle/Outfit: ${v.bundle}`,
      `Emote: ${v.emote}`,
      `Skin Senjata: ${v.skin}`,
      `Skin Senjata Langka: ${v.skinRare}`,
      `Item Limited: ${v.limited}`,
      `Item Event Lama: ${v.eventOld}`,
      `Vehicle Skin: ${v.vehicleSkin}`,
      `Pet: ${v.pet}`,
      `Pet Skin: ${v.petSkin}`,
      '',
      `Estimasi harga (kalkulator): ${GRAGON.formatRupiah(lastResult.total)}`,
    ].join('\n');

    try {
      sessionStorage.setItem(
        'gragon_calc_handoff',
        JSON.stringify({
          platform: 'Free Fire',
          desired_price: lastResult.total,
          details,
        })
      );
    } catch (e) {
      // storage tidak tersedia — tetap lanjut ke /jual-akun tanpa prefill
    }
    window.location.href = '/jual-akun.html';
  });
})();
