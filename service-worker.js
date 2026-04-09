const CACHE_NAME = 'daily-debug-v8';
const urlsToCache = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './image_c68888.jpg'
];

// インストール時にキャッシュ
self.addEventListener('install', (event) => {
  // すぐに新しいサービスワーカーを有効化させる
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

// 古いバージョンのキャッシュを完全に削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // すぐに制御を開始
  );
});

// ネットワーク優先（Network First）の戦略に変更
// 履歴やAIの返答を即座に反映させるため
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => {
      return caches.match(event.request);
    })
  );
});