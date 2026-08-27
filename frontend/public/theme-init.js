// Runs synchronously, before the stylesheet and before React mounts, so the
// saved theme/font apply with no flash of the default. Must stay a plain,
// same-origin <script src> (not inline) — the CSP's script-src is 'self'
// plus accounts.google.com only, with no 'unsafe-inline'.
(function () {
  try {
    var theme = localStorage.getItem('theme');
    var font = localStorage.getItem('font');
    if (theme) document.documentElement.setAttribute('data-theme', theme);
    if (font) document.documentElement.setAttribute('data-font', font);
  } catch (e) {
    // localStorage can throw in some privacy modes — fall back to defaults.
  }
})();
