const SW_VERSION = 'v1.0.2'; // 🔴 每次发布必须修改
const CACHE_NAME = `pwa-cache-${SW_VERSION}`;

/* 需要缓存的静态资源（不要放 HTML） */
const STATIC_ASSETS = [
    '/favicon.ico',
];

/* 要缓存的资源前缀 */
const CACHE_PREFIXES = [
    'https://ali2.a.yximgs.com/bs2/emotion',
    'https://cdnl.iconscout.com/lottie/premium/thumb',
    'https://rustfs.saidao.cc/images'
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

    // 清理旧缓存
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] 删除旧缓存:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // 激活后立即控制所有客户端
            return self.clients.claim();
        })
    );
});

/* ========= 拦截请求 ========= */
self.addEventListener('fetch', event => {
    // 检查请求URL是否匹配需要缓存的域名
    const shouldCache = CACHE_PREFIXES.some(prefix =>
        event.request.url.startsWith(prefix)
    );

    if (shouldCache) {
        // 对于这些资源使用缓存优先策略
        event.respondWith(
            caches.open(CACHE_NAME).then(cache => {
                return cache.match(event.request).then(cachedResponse => {
                    // 如果有缓存，直接返回
                    if (cachedResponse) {
                        console.log('[SW] 使用缓存:', event.request.url);
                        return cachedResponse;
                    }

                    // 否则从网络获取
                    console.log('[SW] 缓存新资源:', event.request.url);
                    return fetch(event.request).then(response => {
                        // 只缓存成功的响应
                        if (response && response.status === 200) {
                            // 克隆响应，因为响应是流，只能使用一次
                            const responseToCache = response.clone();
                            cache.put(event.request, responseToCache);
                        }
                        return response;
                    }).catch(error => {
                        console.error('[SW] 获取失败:', error);
                        // 可以返回一个默认的响应
                        return new Response('网络错误', {
                            status: 408,
                            headers: { 'Content-Type': 'text/plain' }
                        });
                    });
                });
            })
        );
    }
});