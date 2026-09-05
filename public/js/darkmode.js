/* ── Dark Mode global (localStorage) ─────────────────────────── */
(function () {
  const key = 'dramatiza-dark';
  const pref = localStorage.getItem(key);
  if (pref === 'dark' || (!pref && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.body.classList.add('dark');
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.dark-toggle').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.body.classList.toggle('dark');
        localStorage.setItem(key, document.body.classList.contains('dark') ? 'dark' : 'light');
        document.querySelectorAll('.dark-toggle').forEach(function (b) {
          b.textContent = document.body.classList.contains('dark') ? '\u2600\ufe0f Claro' : '\ud83c\udf19 Oscuro';
        });
      });
    });
    /* sync label on load */
    document.querySelectorAll('.dark-toggle').forEach(function (b) {
      b.textContent = document.body.classList.contains('dark') ? '\u2600\ufe0f Claro' : '\ud83c\udf19 Oscuro';
    });
  });
})();
