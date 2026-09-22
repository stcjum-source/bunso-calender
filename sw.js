// 분소 업무 달력 — 서비스워커 (앱 셸 캐시, 오프라인 로딩용)
const CACHE = 'bunso-cal-v1';
const SHELL = [
  './index.html', './app.mjs', './engine.mjs', './density.mjs', './holidays.js',
  './style.css', './desktop.css', './web.css', './config.js', './boot.js', './supabase.js',
  './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Supabase 등 외부 요청은 항상 네트워크로 (캐시하지 않음)
  if (url.origin !== self.location.origin) return;
  if (e.request.method !== 'GET') return;
  // 앱 셸: 네트워크 우선, 실패 시 캐시 (업데이트 반영 + 오프라인 대비)
  e.respondWith(
    fetch(e.request).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('./index.html')))
  );
});
