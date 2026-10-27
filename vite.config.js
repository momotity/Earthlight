import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * 两种产物：
 *   npm run dev    → 本地开发服务器（热更新）
 *   npm run build  → 单文件 HTML，双击即可打开，无需服务器
 *
 * 单文件模式把 JS / CSS / 贴图全部内联进 index.html，
 * 所以 assetsInlineLimit 要放大到能装下三张 webp（约 480 KB → base64 后 640 KB）。
 */
export default defineConfig(({ command }) => ({
  base: './',
  build: {
    target: 'es2019',
    assetsInlineLimit: 4 * 1024 * 1024,
    cssCodeSplit: false,
    outDir: 'dist',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'app.js',
        assetFileNames: 'app.[ext]'
      }
    }
  },
  plugins: command === 'build'
    ? [viteSingleFile({ removeViteModuleLoader: true })]
    : [],
  server: {
    host: '127.0.0.1',
    port: 5173
  }
}));
