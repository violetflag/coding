// 개발용 화면 캡처: GPU에서 픽셀을 직접 읽어 방 + 불을 합성한 PNG(data URL)를 만든다.
// 헤드리스 Chromium(소프트웨어 WebGPU)은 WebGPU 캔버스를 화면에 합성하지 못해 일반 스크린샷이 검게 나오므로,
// tools/shot.mjs는 이 경로를 쓴다. 실제 화면 출력의 톤 매핑(ACES)을 근사한다.
import * as THREE from 'three/webgpu';

const aces = (x) => { x *= 0.6; return Math.max(0, Math.min(1, (x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14))); };
const srgb = (x) => (x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

export async function capture({ renderer, scene, camera, fire }, w = 1280, h = 720) {
  const rt = new THREE.RenderTarget(w, h, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(prev);
  const px = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
  rt.dispose();
  const half = px instanceof Uint16Array;
  const h2f = (v) => { const e = (v >> 10) & 31, m = v & 1023, s = v >> 15 ? -1 : 1; return s * (e === 0 ? m * 2 ** -24 : e === 31 ? 65504 : (1 + m / 1024) * 2 ** (e - 15)); };
  const val = (i) => (half ? h2f(px[i]) : px[i]);
  let fp = null, fw = 0, fh = 0;
  const cr = fire?.crop;
  if (fire && cr && !fire.hidden) ({ data: fp, w: fw, h: fh } = await fire.readPixels());
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c2 = cv.getContext('2d'), img = c2.createImageData(w, h), o = img.data;
  const ex = renderer.toneMappingExposure;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, a = Math.max(0, Math.min(1, val(i + 3)));
    let fr = 0, fg = 0, fb = 0;
    if (fp && a < 1) {
      // 불은 구멍 영역(crop)만 그려져 있다: 화면 좌표를 그 영역 안의 좌표로 바꿔 읽는다
      const u = ((x + 0.5) / w - cr.u0) / (cr.u1 - cr.u0), v = ((y + 0.5) / h - cr.v0) / (cr.v1 - cr.v0);
      if (u >= 0 && u < 1 && v >= 0 && v < 1) { const j = (Math.floor(v * fh) * fw + Math.floor(u * fw)) * 4; fr = fp[j]; fg = fp[j + 1]; fb = fp[j + 2]; }
    }
    o[i] = 255 * srgb(aces(val(i) * ex)) * a + fr * (1 - a);
    o[i + 1] = 255 * srgb(aces(val(i + 1) * ex)) * a + fg * (1 - a);
    o[i + 2] = 255 * srgb(aces(val(i + 2) * ex)) * a + fb * (1 - a);
    o[i + 3] = 255;
  }
  c2.putImageData(img, 0, 0);
  return cv.toDataURL('image/png');
}
