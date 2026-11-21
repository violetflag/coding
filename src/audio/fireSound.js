// 불 소리: procedural-fire의 FireAudio(물리 기반 장작불 소리)를 불 시뮬레이션에 연결한다.
// 세기와 열 방출 변화(불빛 신호), 듣는 사람의 거리와 방향을 매 프레임 넘기고,
// 소리 엔진이 스스로 낸 "탁" 소리에는 같은 순간에 불티를 튀긴다.
import { FireAudio } from '../fire/vendor/audio/engine.js';

export class FireSound {
  static async create(mixer, fire) {
    const audio = await FireAudio.create(mixer.ctx, { connect: false, volume: 1 });
    audio.output.connect(mixer.channel('fire'));
    await audio.start();
    return new FireSound(audio, fire);
  }
  constructor(audio, fire) {
    this.audio = audio; this.fire = fire; this.prevH = 1; this.prevT = 0; this.dhrr = 0;
    if (fire) {
      fire.popsFromAudio = true; // 불 쪽의 임의 불티는 끄고 소리에 맞춘다
      audio.onEvent((ev) => {
        const delay = Math.max(0, (ev.contextTime ?? audio.ctx.currentTime) - audio.ctx.currentTime) * 1000;
        setTimeout(() => fire.event({ type: ev.type === 'log-shift' ? 'log-shift' : 'pop', strength: ev.strength ?? 0.5 }), delay);
      });
    }
  }
  // camPos: 불 좌표계에서의 카메라 위치 [x, y, z] (FireLayer._cam과 같은 좌표)
  update(power, level, camPos) {
    const now = performance.now(), dt = this.prevT ? Math.max((now - this.prevT) / 1000, 1e-3) : 0;
    if (dt > 0.03) { this.dhrr = Math.max(-20, Math.min(20, (level - this.prevH) / dt)); this.prevH = level; this.prevT = now; }
    else if (!this.prevT) this.prevT = now;
    this.audio.update({ intensity: power, hrr: level, dhrr: this.dhrr, camDist: Math.hypot(camPos[0], camPos[1] - 0.35, camPos[2]), camAz: Math.atan2(camPos[0], camPos[2]) });
  }
  trigger(type, strength = 1, pan = 0) { try { this.audio.trigger({ type, strength, pan }); } catch { /* 알 수 없는 종류 */ } }
}
