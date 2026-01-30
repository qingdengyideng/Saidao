const SW_VERSION = 'v1.0.4'; // 🔴 版本号需要更新
const CACHE_NAME = `pwa-cache-${SW_VERSION}`;

/* 需要缓存的静态资源（不要放 HTML） */
const STATIC_ASSETS = [

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

/* ========= 拦截请求（简化版） ========= */
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') return;

    const requestUrl = event.request.url;
    const isTargetResource = CACHE_PREFIXES.some(prefix =>
        requestUrl.startsWith(prefix)
    );

    // 检查是否是图片资源
    const isImage = /\.(jpg|jpeg|png|gif|webp|svg|mp4|json)$/i.test(requestUrl) ||
        requestUrl.includes('images') ||
        requestUrl.includes('emotion') ||
        requestUrl.includes('lottie');

    if (!isTargetResource || !isImage) return;

    // console.log('[SW] 处理图片资源:', requestUrl);

    event.respondWith(
        caches.open(CACHE_NAME).then(cache => {
            return cache.match(event.request).then(cachedResponse => {
                if (cachedResponse) {
                    // console.log('[SW] ✅ 使用缓存的图片');
                    return cachedResponse;
                }

                // 对于图片资源，使用 no-cors 模式
                return fetch(event.request, {
                    mode: 'no-cors',
                    credentials: 'omit'
                }).then(response => {
                    // console.log('[SW] 图片响应:', {
                    //     type: response.type,
                    //     url: requestUrl,
                    //     fromCache: false
                    // });

                    // 克隆响应并缓存
                    const responseToCache = response.clone();

                    // 不等待缓存完成，后台处理
                    cache.put(event.request, responseToCache)
                        .then(() => console.log('[SW] ✅ 图片缓存成功'))
                        .catch(e => console.warn('[SW] ⚠️ 图片缓存失败:', e));

                    return response;
                }).catch(error => {
                    console.error('[SW] ❌ 图片获取失败:', error);

                    // 返回一个透明的 1x1 像素 PNG 作为占位图
                    const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

                    return fetch(placeholder).then(res => {
                        // console.log('[SW] 🔄 使用占位图');
                        return res;
                    });
                });
            });
        })
    );
});