import { defineConfig } from 'vite';
import { excalidrawAssets } from './tools/excalidraw-assets.mjs';

export default defineConfig({
  plugins: [excalidrawAssets()], // 메모 그림판(Excalidraw)의 글꼴을 오프라인으로
  server: { host: '127.0.0.1', port: 5320 },
  preview: { host: '127.0.0.1', port: 5321 },
  build: { target: 'es2022', chunkSizeWarningLimit: 2000 },
  worker: { format: 'es' }, // 불 소리 워크릿을 ES 모듈 한 파일로 묶는다
});
