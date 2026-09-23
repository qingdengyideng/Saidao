import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 测试前设置环境变量（config.ts 启动校验需要）
  define: {
    'process.env.NEXT_PUBLIC_API_BASE': JSON.stringify('https://api.saidao.cc'),
    'process.env.NEXT_PUBLIC_N8N_BASE': JSON.stringify('https://n8n.saidao.cc'),
    'process.env.NEXT_PUBLIC_WS_BASE': JSON.stringify('wss://api.saidao.cc'),
    'process.env.NEXT_PUBLIC_IMAGE_HOSTS': JSON.stringify(
      'rustfs.saidao.cc,ali2.a.yximgs.com,cdnl.iconscout.com',
    ),
    'process.env.NEXT_PUBLIC_ENABLE_VIDEO_REQUEST': JSON.stringify('false'),
    'process.env.NEXT_PUBLIC_CHAT_VIRTUALIZE_THRESHOLD': JSON.stringify('50'),
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
