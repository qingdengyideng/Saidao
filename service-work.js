/* ========= 基础配置 ========= */
const SW_VERSION = 'v3.0.0'; // 🔴 每次发布必须修改
const CACHE_NAME = `pwa-cache-${SW_VERSION}`;

/* 需要缓存的静态资源（不要放 HTML） */
const STATIC_ASSETS = [
    '/favicon.ico',
];

/* ========= 安装阶段 ========= */
self.addEventListener('install', event => {
    console.log('[SW] install', SW_VERSION);

    // 强制进入 activate
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
});

/* ========= 激活阶段 ========= */
self.addEventListener('activate', event => {
    console.log('[SW] activate', SW_VERSION);

    event.waitUntil(
        Promise.all([
            // 删除所有旧版本缓存
            caches.keys().then(keys => {
                return Promise.all(
                    keys
                        .filter(key => key !== CACHE_NAME)
                        .map(key => {
                            console.log('[SW] delete old cache', key);
                            return caches.delete(key);
                        })
                );
            }),
            // 立即接管页面（华为浏览器关键）
            self.clients.claim()
        ])
    );
});

/* ========= 请求拦截 ========= */
self.addEventListener('fetch', event => {
    const { request } = event;

    // ❌ 非 GET 请求不处理
    if (request.method !== 'GET') return;

    // ❌ 跳过跨域请求
    if (!request.url.startsWith(self.location.origin)) return;

    // ❌ 永远不缓存 HTML（防止 PWA 死缓存）
    if (request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(fetch(request));
        return;
    }

    // ✅ 静态资源：cache-first + 后台更新
    event.respondWith(
        caches.match(request).then(cacheRes => {
            const fetchPromise = fetch(request).then(networkRes => {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(request, networkRes.clone());
                });
                return networkRes;
            });

            return cacheRes || fetchPromise;
        })
    );
});

/* ========= 接收客户端指令（可选） ========= */
self.addEventListener('message', event => {
    if (event.data === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
