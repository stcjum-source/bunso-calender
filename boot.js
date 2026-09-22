// 웹 실행 부트스트랩 (데스크톱 앱에서는 아무것도 하지 않음)
if (!window.desktop) {
  try { document.body.classList.add('web'); } catch (e) {}
  var cfg = window.BUNSO_CONFIG || {};
  if (cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY) {
    try { document.body.classList.add('cloud'); } catch (e) {}
  }
}
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js').catch(function () {});
  });
}
