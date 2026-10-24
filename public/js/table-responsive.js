/* Gragon Store — table-responsive.js
   Mengisi atribut data-label pada setiap <td> dari teks <th> supaya
   tabel admin tampil sebagai kartu di layar HP (lihat gragon.css). */
(function () {
  function label(table) {
    const heads = Array.from(table.querySelectorAll('thead th')).map((th) => th.textContent.trim());
    table.querySelectorAll('tbody tr').forEach((tr) => {
      Array.from(tr.children).forEach((td, i) => {
        if (td.tagName === 'TD' && !td.hasAttribute('colspan') && heads[i] !== undefined && td.dataset.label !== heads[i]) {
          td.dataset.label = heads[i];
        }
      });
    });
  }
  function init() {
    document.querySelectorAll('.admin-table').forEach((table) => {
      label(table);
      const body = table.querySelector('tbody');
      if (body) new MutationObserver(() => label(table)).observe(body, { childList: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
