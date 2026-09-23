/* public/service-worker.js
 * workbox 运行时库在 SW 线程执行（浏览器直接从 public/ 加载，不经过 Next 构建）。
 * 策略对齐旧站 service-workV3.js：3 个图片前缀 CacheFirst，160 条，30 天过期。
 */
import { clientsClaim } from "workbox-core";
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute, NavigationRoute } from "workbox-routing";
import { CacheFirst, NetworkFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

self.skipWaiting();
clientsClaim();

// 1. Next.js 构建产物预缓存（原生方案无 GenerateSW 注入，M6 评估是否补齐；当前传空数组）
precacheAndRoute(self.__WB_MANIFEST ?? []);
cleanupOutdatedCaches();

// 2. 图片 CDN 运行时缓存（旧站策略 1:1 保留）
registerRoute(
  ({ url }) =>
    /^https:\/\/(ali2\.a\.yximgs\.com\/bs2\/emotion|cdnl\.iconscout\.com|rustfs\.saidao\.cc\/images)\/.*/i.test(
      url.href,
    ),
  new CacheFirst({
    cacheName: "images",
    plugins: [
      new ExpirationPlugin({
        maxEntries: 160,
        maxAgeSeconds: 60 * 60 * 24 * 30,
      }),
      new CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  }),
);

// 3. 导航请求 NetworkFirst（应用外壳始终取线上最新，离线时回退到已缓存壳）
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: "pages",
      plugins: [
        new ExpirationPlugin({
          maxEntries: 16,
          maxAgeSeconds: 60 * 60 * 24 * 7,
        }),
        new CacheableResponsePlugin({ statuses: [0, 200] }),
      ],
    }),
  ),
);
