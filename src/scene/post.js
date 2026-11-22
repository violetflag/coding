// 방 화면의 후처리: 구석과 맞닿은 곳의 음영(GTAO)과 밝은 빛의 번짐(bloom).
// 벽난로 구멍의 알파(0)는 그대로 내보내야 뒤의 불 캔버스가 비쳐 보인다.
import * as THREE from 'three/webgpu';
import { pass, mrt, output, normalView, vec4, uniform, renderOutput } from 'three/tsl';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';
import { ao } from 'three/addons/tsl/display/GTAONode.js';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { gaussianBlur } from 'three/addons/tsl/display/GaussianBlurNode.js';

// aa = 'fxaa': 장면을 여러 번 표본으로 찍는 계단 방지(MSAA) 대신, 다 그린 화면에서 가장자리만 다듬는다(내장 GPU에서 훨씬 가볍다)
export function setupPost(renderer, scene, camera, { aa = 'msaa' } = {}) {
  const post = new THREE.RenderPipeline(renderer);
  const sp = pass(scene, camera); sp.setMRT(mrt({ output, normal: normalView }));   // 법선을 함께 그린다(깊이에서 되살리면 창살 같은 가는 물체에서 음영이 떨린다)
  const col = sp.getTextureNode('output'), nrm = sp.getTextureNode('normal'), depth = sp.getTextureNode('depth');
  const aoPass = ao(depth, nrm, camera); aoPass.resolutionScale = 0.5; aoPass.radius.value = 0.32; aoPass.samples.value = 8; aoPass.distanceFallOff.value = 1; aoPass.thickness.value = 1.2;
  const aoSoft = gaussianBlur(aoPass.getTextureNode(), 1.5, 3);
  const aoAmt = uniform(0.85), bloomAmt = uniform(0.22);
  const occ = aoSoft.r.oneMinus().mul(aoAmt).oneMinus();
  const lit = col.rgb.mul(occ);
  const bl = bloom(vec4(lit, 1), 1, 0.6, 1.1);
  const linear = vec4(lit.add(bl.rgb.mul(bloomAmt)), col.a), useFxaa = aa === 'fxaa';
  const final = useFxaa ? fxaa(renderOutput(linear)) : linear;        // FXAA는 톤 매핑을 마친 색에서 가장자리를 찾는다
  post.outputNode = final; if (useFxaa) post.outputColorTransform = false;
  return { post, aoAmt, bloomAmt, aoPass, render() { post.render(); },
    // 개발용 캡처: 톤 매핑 전의 선형 값을 지정한 렌더 타깃에 그린다
    renderLinear(rt) { const prev = renderer.getRenderTarget(); post.outputNode = linear; post.outputColorTransform = false; post.needsUpdate = true; renderer.setRenderTarget(rt); post.render(); renderer.setRenderTarget(prev); post.outputNode = final; post.outputColorTransform = !useFxaa; post.needsUpdate = true; } };
}
