const SW_VERSION = 'v1.1.0';
const CACHE_NAME = `pwa-cache-${SW_VERSION}`;
const MAX_CACHE_ENTRIES = 160;

const STATIC_ASSETS = [];

const CACHE_PREFIXES = [
    'https://ali2.a.yximgs.com/bs2/emotion',
    'https://cdnl.iconscout.com/lottie/premium/thumb',
    'https://rustfs.saidao.cc/images'
];

const CACHEABLE_RESOURCE_PATTERN = /\.(jpg|jpeg|png|gif|webp|svg|json)$/i;

function shouldHandleRequest(requestUrl) {
    const isTargetResource = CACHE_PREFIXES.some((prefix) => requestUrl.startsWith(prefix));
    if (!isTargetResource) {
        return false;
    }

    return CACHEABLE_RESOURCE_PATTERN.test(requestUrl)
        || requestUrl.includes('images')
        || requestUrl.includes('emotion')
        || requestUrl.includes('lottie');
}

function createCacheKey(request) {
    const url = new URL(request.url);
    url.search = '';
    url.hash = '';

    return new Request(url.toString(), {
        method: 'GET',
        mode: 'no-cors',
        credentials: 'omit'
    });
}

async function trimCache(cache) {
    const keys = await cache.keys();
    const overflow = keys.length - MAX_CACHE_ENTRIES;

    if (overflow <= 0) {
        return;
    }

    await Promise.all(
        keys.slice(0, overflow).map((key) => cache.delete(key))
    );
}

self.addEventListener('install', (event) => {
    self.skipWaiting();

    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }

                    return Promise.resolve(false);
                })
            ))
            .then(async () => {
                const cache = await caches.open(CACHE_NAME);
                await trimCache(cache);
                return self.clients.claim();
            })
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    const requestUrl = event.request.url;
    if (!shouldHandleRequest(requestUrl)) {
        return;
    }

    const cacheKey = createCacheKey(event.request);

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cachedResponse = await cache.match(cacheKey);
            if (cachedResponse) {
                return cachedResponse;
            }

            try {
                const response = await fetch(event.request, {
                    mode: 'no-cors',
                    credentials: 'omit'
                });

                const responseToCache = response.clone();
                event.waitUntil(
                    cache.put(cacheKey, responseToCache)
                        .then(() => trimCache(cache))
                        .catch((error) => {
                            console.warn('[SW] cache put failed:', error);
                        })
                );

                return response;
            } catch (error) {
                console.error('[SW] asset fetch failed:', error);

                const placeholder = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
                return fetch(placeholder);
            }
        })
    );
});
