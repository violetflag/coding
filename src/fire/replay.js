// 불 기록 재생: 책을 읽는 동안 불이 화면에 보이면, 불 캔버스를 1분쯤 동영상으로 기록해 두었다가
// 불 계산을 멈추고 그 동영상을 되풀이해 보여 준다(동영상 재생은 불 계산보다 GPU를 훨씬 덜 쓴다).
// 시선이 멈춰 있을 때만 쓸 수 있다: 시선이 바뀌면 불이 보이는 자리와 모양이 달라지므로 기록을 버리고 다시 계산한다.
// 이어 붙는 곳이 튀지 않게 동영상 둘을 겹쳐 끝과 처음을 서서히 바꾼다.
const FADE = 0.8;      // 끝과 처음을 겹치는 시간(초)

export class FireReplay {
  constructor(canvas) {
    this.canvas = canvas; this.state = 'idle'; this.url = null; this.dur = 0; this.videos = []; this.cur = 0; this.error = null; this.startedAt = 0;
    this.supported = typeof MediaRecorder !== 'undefined' && !!canvas.captureStream;
    this.mime = this.supported ? ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4'].find((m) => MediaRecorder.isTypeSupported(m)) || '' : '';
    if (!this.mime) this.supported = false;
  }

  // 기록 시작(seconds초). 끝나면 state = 'ready'
  record(seconds) {
    if (!this.supported || this.state === 'recording') return;
    this.discard();
    try {
      const stream = this.canvas.captureStream(30), chunks = [];
      const mr = (this.rec = new MediaRecorder(stream, { mimeType: this.mime, videoBitsPerSecond: 16e6 }));
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onerror = (e) => { this.error = String(e.error || e); this._stopStream(stream); this.state = 'idle'; };
      mr.onstop = () => {
        this._stopStream(stream); clearTimeout(this._timer);
        if (this.state !== 'recording' || mr !== this.rec || this._cancel) { this._cancel = false; if (this.state === 'recording') this.state = 'idle'; return; }
        this.dur = (performance.now() - this.startedAt) / 1000;
        this.url = URL.createObjectURL(new Blob(chunks, { type: this.mime.split(';')[0] }));
        this._load();
      };
      this.state = 'recording'; this.startedAt = performance.now(); this._cancel = false; mr.start(1000);
      this._timer = setTimeout(() => { if (mr.state !== 'inactive') mr.stop(); }, seconds * 1000);
    } catch (e) { this.error = String(e); this.state = 'idle'; this.supported = false; }
  }
  _stopStream(stream) { for (const t of stream.getTracks()) t.stop(); }

  // 동영상 둘을 불 캔버스와 같은 자리에 숨겨 두고 재생 준비를 한다
  _load() {
    const cs = this.canvas.style; let ready = 0;
    this.videos = [0, 1].map(() => {
      const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = this.url;
      Object.assign(v.style, { position: 'fixed', left: cs.left, top: cs.top, width: cs.width, height: cs.height, zIndex: 0, objectFit: 'fill', opacity: 0, pointerEvents: 'none', visibility: 'hidden', background: '#000' });
      v.addEventListener('loadeddata', () => { if (++ready === 2 && this.state === 'recording') { this.state = 'ready'; } }, { once: true });
      v.addEventListener('error', () => { this.error = '동영상을 읽지 못했습니다'; this.discard(); }, { once: true });
      return v;
    });
    this.canvas.after(this.videos[1], this.videos[0]);   // 문서 순서: 불 캔버스, 둘째, 첫째(첫째가 위)
  }

  get progress() { return this.state === 'recording' ? Math.min(1, (performance.now() - this.startedAt) / 1000 / Math.max(1, this.want || 60)) : this.state === 'idle' ? 0 : 1; }
  // 지금 보여 주는 곳의 시각(초): 불빛 기록을 같은 곳에서 읽는 데 쓴다
  get time() { const v = this.videos[this.cur]; return v ? v.currentTime : 0; }

  play() {
    if (this.state !== 'ready') return false;
    this.state = 'playing'; this.cur = 0;
    const [a, b] = this.videos; for (const v of this.videos) v.style.visibility = 'visible';
    a.currentTime = 0; a.style.opacity = 1; b.style.opacity = 0; b.pause(); a.play().catch((e) => { this.error = String(e); this.discard(); });
    return true;
  }
  // 매 프레임: 끝이 가까우면 다른 동영상을 처음부터 틀어 서서히 바꾼다
  tick() {
    if (this.state !== 'playing') return;
    const v = this.videos[this.cur], o = this.videos[1 - this.cur], end = Math.max(FADE * 2, (isFinite(v.duration) && v.duration > 0 ? v.duration : this.dur) - 0.15), left = end - v.currentTime;
    if (left <= FADE) {
      if (o.paused) { o.currentTime = 0; o.play().catch(() => {}); }
      // videos[0]이 늘 위에 놓인다: 위쪽이 나가는 동영상이면 옅어지며 아래쪽을 드러내고, 들어오는 동영상이면 짙어지며 아래쪽을 덮는다
      const k = Math.min(1, Math.max(0, 1 - left / FADE));
      if (this.cur === 0) { o.style.opacity = 1; v.style.opacity = 1 - k; } else o.style.opacity = k;
      if (left <= 0 || v.ended) { v.pause(); o.style.opacity = 1; v.style.opacity = 0; this.cur = 1 - this.cur; }
    }
  }
  // 재생을 멈추고 기록을 버린다
  discard() {
    if (this.rec && this.rec.state !== 'inactive') { this._cancel = true; try { this.rec.stop(); } catch { /* 이미 멈춤 */ } }
    clearTimeout(this._timer);
    for (const v of this.videos) { v.pause(); v.removeAttribute('src'); v.load(); v.remove(); }
    this.videos = []; if (this.url) URL.revokeObjectURL(this.url); this.url = null; this.state = 'idle';
  }
}
