// 방 화면의 후처리: 구석과 맞닿은 곳의 음영(GTAO)과 밝은 빛의 번짐(bloom).
// 벽난로 구멍의 알파(0)는 그대로 내보내야 뒤의 불 캔버스가 비쳐 보인다.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, vec4, uniform } from 'three/tsl';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

export function setupPost(renderer, scene, camera) {
  const post = new THREE.RenderPipeline(renderer);
  const sp = pass(scene, camera);   // 법선은 따로 그리지 않고 깊이에서 되살린다(추가 렌더 타깃을 아낀다)
  const col = sp.getTextureNode('output'), depth = sp.getTextureNode('depth');
  const aoPass = ao(depth, null, camera); aoPass.resolutionScale = 0.5; aoPass.radius.value = 0.32; aoPass.samples.value = 8; aoPass.distanceFallOff.value = 1; aoPass.thickness.value = 1.2;
  const aoSoft = gaussianBlur(aoPass.getTextureNode(), 1.5, 3);
  const aoAmt = uniform(0.85), bloomAmt = uniform(0.22);
  const occ = aoSoft.r.oneMinus().mul(aoAmt).oneMinus();
  const lit = col.rgb.mul(occ);
  const bl = bloom(vec4(lit, 1), 1, 0.6, 1.1);
  post.outputNode = vec4(lit.add(bl.rgb.mul(bloomAmt)), col.a);
  return { post, aoAmt, bloomAmt, aoPass, render() { post.render(); },
    // 개발용 캡처: 톤 매핑 전의 선형 값을 지정한 렌더 타깃에 그린다
    renderLinear(rt) { const prev = renderer.getRenderTarget(); post.outputColorTransform = false; post.needsUpdate = true; renderer.setRenderTarget(rt); post.render(); renderer.setRenderTarget(prev); post.outputColorTransform = true; post.needsUpdate = true; } };
}
