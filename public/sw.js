const CACHE_NAME = 'unic-patent-v1';
const STATIC_ASSETS = [
  '/',
  '/css/style.css',
  '/css/ejs-style.css',
  '/css/annual-fee-status.css',
  '/css/admin.css',
  '/js/main.js',
  '/js/script.js',
  '/js/registered.js',
  '/images/logo.png',
  '/images/favicon.svg',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png',
  '/images/hero-background-tech.jpg',
  '/manifest.json'
];

// 설치: 정적 자산 캐시
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// 활성화: 이전 캐시 정리
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 페치: Network First (API), Cache First (정적 자산)
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API 요청은 항상 네트워크 우선 (민감한 특허 데이터)
  if (event.request.method === 'POST' ||
      url.pathname.startsWith('/search-') ||
      url.pathname.startsWith('/get-') ||
      url.pathname.startsWith('/export-') ||
      url.pathname.startsWith('/login') ||
      url.pathname.startsWith('/logout') ||
      url.pathname.startsWith('/register') ||
      url.pathname.startsWith('/lookup-') ||
      url.pathname.startsWith('/update-') ||
      url.pathname.startsWith('/reset-') ||
      url.pathname.startsWith('/admin')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: '오프라인 상태입니다. 네트워크 연결을 확인해주세요.' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // 정적 자산은 캐시 우선
  if (url.pathname.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?)$/)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // HTML 페이지는 네트워크 우선, 실패 시 캐시
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          return cached || caches.match('/').then((fallback) => {
            return fallback || new Response('오프라인 상태입니다.', {
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          });
        });
      })
  );
});
