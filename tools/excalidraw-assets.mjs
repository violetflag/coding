// Excalidraw 글꼴을 인터넷(CDN) 대신 이 프로그램에서 내준다. 프로그램이 오프라인이어도 그림판 글자가 나오게.
//   개발 서버: /excalidraw/fonts/* 를 node_modules 에서 바로 읽어 준다.
//   빌드: dist/excalidraw/fonts 로 복사한다(저장소에는 넣지 않는다).
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('node_modules/@excalidraw/excalidraw/dist/prod/fonts');

export function excalidrawAssets() {
  let outDir = 'dist';
  return {
    name: 'nanro-excalidraw-assets',
    configResolved(c) { outDir = path.resolve(c.root, c.build.outDir); },
    configureServer(server) {
      server.middlewares.use('/excalidraw/fonts', (req, res, next) => {
        const f = path.join(SRC, decodeURIComponent((req.url || '').split('?')[0]));
        if (!f.startsWith(SRC + path.sep) || !fs.existsSync(f) || !fs.statSync(f).isFile()) return next();
        res.setHeader('Content-Type', f.endsWith('.woff2') ? 'font/woff2' : 'application/octet-stream');
        res.setHeader('Cache-Control', 'max-age=86400');
        fs.createReadStream(f).pipe(res);
      });
    },
    writeBundle() { if (fs.existsSync(SRC)) fs.cpSync(SRC, path.join(outDir, 'excalidraw', 'fonts'), { recursive: true }); },
  };
}
