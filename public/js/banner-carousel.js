/* ============================================================
   Gragon Store — banner-carousel.js
   Carousel poster/banner di homepage (di atas "Jelajahi Kategori").
   Fitur tambahan, berdiri sendiri — hanya membaca tabel `banners`
   (is_active = true) dari Supabase, tidak menyentuh logika lain.
   ============================================================ */

(function () {
  const section = document.querySelector('[data-banner-section]');
  if (!section) return; // bukan halaman yang punya carousel

  const track = document.querySelector('[data-banner-track]');
  const dotsWrap = document.querySelector('[data-banner-dots]');
  const prevBtn = document.querySelector('[data-banner-prev]');
  const nextBtn = document.querySelector('[data-banner-next]');
  const viewport = document.querySelector('.banner-carousel__viewport');

  const AUTOPLAY_MS = 4500;
  let slides = [];
  let current = 0;
  let autoplayTimer = null;

  function escapeAttr(str) {
    return (GRAGON && GRAGON.escapeAttr) ? GRAGON.escapeAttr(str) : String(str ?? '');
  }

  async function loadBanners() {
    try {
      const { data, error } = await supabaseClient
        .from('banners')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      slides = data || [];
      if (slides.length === 0) {
        section.style.display = 'none';
        return;
      }
      render();
      section.style.display = '';
    } catch (e) {
      // Gagal memuat banner tidak boleh merusak homepage — sembunyikan saja,
      // tapi tetap dicatat di konsol supaya mudah didiagnosis.
      console.error('[banner-carousel] gagal memuat banner:', e);
      section.style.display = 'none';
    }
  }

  function render() {
    track.innerHTML = slides
      .map((b) => {
        const img = `<img class="banner-carousel__img" src="${escapeAttr(b.image_url)}" alt="${escapeAttr(b.title || 'Poster')}" loading="lazy" />`;
        const caption = b.title ? `<div class="banner-carousel__caption">${escapeAttr(b.title)}</div>` : '';
        const inner = img + caption;
        if (b.link_url) {
          return `<a class="banner-carousel__slide" data-clickable="true" href="${escapeAttr(b.link_url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
        return `<div class="banner-carousel__slide">${inner}</div>`;
      })
      .join('');

    dotsWrap.innerHTML = slides
      .map((_, i) => `<button type="button" class="banner-carousel__dot${i === 0 ? ' is-active' : ''}" data-banner-dot="${i}" aria-label="Poster ${i + 1}"></button>`)
      .join('');

    dotsWrap.querySelectorAll('[data-banner-dot]').forEach((dot) => {
      dot.addEventListener('click', () => {
        goTo(Number(dot.dataset.bannerDot));
        resetAutoplay();
      });
    });

    const showNav = slides.length > 1;
    if (prevBtn) prevBtn.style.display = showNav ? '' : 'none';
    if (nextBtn) nextBtn.style.display = showNav ? '' : 'none';
    if (dotsWrap) dotsWrap.style.display = showNav ? '' : 'none';

    current = 0;
    updateTrack();
    if (showNav) startAutoplay();
  }

  function updateTrack() {
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsWrap.querySelectorAll('[data-banner-dot]').forEach((dot, i) => {
      dot.classList.toggle('is-active', i === current);
    });
  }

  function goTo(index) {
    if (slides.length === 0) return;
    current = ((index % slides.length) + slides.length) % slides.length;
    updateTrack();
  }

  function next() {
    goTo(current + 1);
  }

  function prev() {
    goTo(current - 1);
  }

  function startAutoplay() {
    stopAutoplay();
    if (slides.length <= 1) return;
    autoplayTimer = setInterval(next, AUTOPLAY_MS);
  }

  function stopAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = null;
  }

  function resetAutoplay() {
    stopAutoplay();
    startAutoplay();
  }

  prevBtn?.addEventListener('click', () => {
    prev();
    resetAutoplay();
  });
  nextBtn?.addEventListener('click', () => {
    next();
    resetAutoplay();
  });

  // Jeda autoplay saat pointer di atas carousel (desktop)
  viewport?.addEventListener('mouseenter', stopAutoplay);
  viewport?.addEventListener('mouseleave', startAutoplay);

  // Swipe (mobile / touch)
  let touchStartX = 0;
  let touchDeltaX = 0;
  let isSwiping = false;

  track?.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchDeltaX = 0;
    isSwiping = true;
    stopAutoplay();
    track.style.transition = 'none';
  }, { passive: true });

  track?.addEventListener('touchmove', (e) => {
    if (!isSwiping) return;
    touchDeltaX = e.touches[0].clientX - touchStartX;
    const offsetPercent = (touchDeltaX / track.clientWidth) * 100;
    track.style.transform = `translateX(calc(-${current * 100}% + ${offsetPercent}%))`;
  }, { passive: true });

  track?.addEventListener('touchend', () => {
    if (!isSwiping) return;
    isSwiping = false;
    track.style.transition = '';
    const threshold = track.clientWidth * 0.15;
    if (touchDeltaX > threshold) {
      prev();
    } else if (touchDeltaX < -threshold) {
      next();
    } else {
      updateTrack();
    }
    resetAutoplay();
  });

  loadBanners();
})();
