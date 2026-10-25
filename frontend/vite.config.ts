import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      // 编辑器/工具原子写入会产生临时目录，避免 Vite 监听它们导致 EBUSY 崩溃。
      ignored: ['**/*.tmpdir/**', '**/.*.tmpdir/**'],
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 4096,
    cssCodeSplit: false,
    sourcemap: false,
  },
});
