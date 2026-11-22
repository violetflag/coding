// Excalidraw 그림판. 이 파일과 Excalidraw·React 는 그림 창을 처음 열 때만 따로 불러온다(처음 켤 때 묶음에는 없다).
// 글꼴은 인터넷이 아니라 /excalidraw/fonts 에서 읽는다(window.EXCALIDRAW_ASSET_PATH 는 이 파일을 부르기 전에 정한다).
import React from 'react';
import { createRoot } from 'react-dom/client';
import { Excalidraw, MainMenu, convertToExcalidrawElements, exportToBlob, serializeAsJSON, restore, hashElementsVersion, CaptureUpdateAction } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import { toSkeleton } from './convert.js';

const BG = '#fffdf8';

// 자료 → 장면
export function sceneFromDiagram(diagram, meta) {
  const elements = convertToExcalidrawElements(toSkeleton(diagram, meta), { regenerateIds: false });
  return { elements, appState: { viewBackgroundColor: BG, currentItemFontFamily: 5 }, files: {} };
}
// 저장해 둔 .excalidraw 글 → 장면 (읽을 수 없으면 null)
export function sceneFromJSON(text) {
  try {
    const data = JSON.parse(text); if (data?.type !== 'excalidraw' || !Array.isArray(data.elements)) return null;
    const r = restore(data, null, null);
    return { elements: r.elements, appState: { ...r.appState, viewBackgroundColor: r.appState.viewBackgroundColor || BG }, files: r.files || {} };
  } catch { return null; }
}

// host 에 그림판을 띄운다. 돌려주는 것: { replace(scene), json(), png(), version(), count(), destroy() }
export function mountView(host, scene) {
  return new Promise((resolve) => {
    const root = createRoot(host), h = React.createElement;
    let done = false;
    // 그림 전체가 화면에 들어오게 맞춘다. 너무 작아지면(글이 안 읽히면) 반 크기에서 멈추고 위쪽부터 보여 준다.
    // 위의 도구 막대와 아래 단추 자리는 비워 둔다. Excalidraw 의 화면 좌표 = (장면 좌표 + scroll) × zoom
    const fitView = (a) => {
      const els = a.getSceneElements(); if (!els.length) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const e of els) { x0 = Math.min(x0, e.x, e.x + e.width); y0 = Math.min(y0, e.y, e.y + e.height); x1 = Math.max(x1, e.x, e.x + e.width); y1 = Math.max(y1, e.y, e.y + e.height); }
      const { width: vw, height: vh } = a.getAppState(), top = 140, room = vh - top - 70, w = x1 - x0, h = y1 - y0;
      const z = Math.max(0.5, Math.min(1.1, (vw * 0.92) / w, room / h));
      const scrollY = h * z <= room ? (top + room / 2) / z - (y0 + h / 2) : top / z - y0;
      a.updateScene({ appState: { zoom: { value: z }, scrollX: vw / (2 * z) - (x0 + w / 2), scrollY } });
    };
    // 그림판이 자리를 잡고(크기, 글꼴) 나서 맞춘다
    const settle = (a) => new Promise((ok) => {
      let n = 0;
      const go = () => {
        const s = a.getAppState();
        if ((s.isLoading || !s.width) && n++ < 100) return setTimeout(go, 50);
        document.fonts.ready.then(() => setTimeout(() => { fitView(a); ok(); }, 60));
      };
      setTimeout(go, 0);
    });
    const menu = h(MainMenu, null, h(MainMenu.DefaultItems.ClearCanvas), h(MainMenu.DefaultItems.ChangeCanvasBackground), h(MainMenu.DefaultItems.ToggleTheme), h(MainMenu.DefaultItems.Help));
    root.render(h(Excalidraw, {
      langCode: 'ko-KR',
      autoFocus: true,
      initialData: { elements: scene.elements, appState: scene.appState, files: scene.files },
      UIOptions: { canvasActions: { loadScene: false, saveToActiveFile: false, export: false, saveAsImage: false } },
      excalidrawAPI: (a) => {
        if (done || !a) return; done = true;
        settle(a).then(() => resolve({
          async replace(s) { a.updateScene({ elements: s.elements, appState: s.appState, captureUpdate: CaptureUpdateAction.IMMEDIATELY }); if (s.files && Object.keys(s.files).length) a.addFiles(Object.values(s.files)); await settle(a); },
          json: () => serializeAsJSON(a.getSceneElements(), a.getAppState(), a.getFiles(), 'local'),
          png: () => exportToBlob({ elements: a.getSceneElements(), appState: { ...a.getAppState(), exportBackground: true }, files: a.getFiles(), mimeType: 'image/png', exportPadding: 32, getDimensions: (w, h) => ({ width: w * 2, height: h * 2, scale: 2 }) }),   // 두 배 크기로 또렷하게
          version: () => hashElementsVersion(a.getSceneElements()),
          count: () => a.getSceneElements().length,
          destroy: () => root.unmount(),
        }));
      },
    }, menu));
  });
}
