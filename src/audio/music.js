// 배경 음악: 유튜브 링크를 넣으면 유튜브의 공식 삽입 플레이어로 재생한다 (영상 파일을 내려받지 않는다).
// 소리는 Web Audio를 거치지 않으므로 볼륨은 음악 볼륨 × 전체 볼륨을 플레이어에 직접 넣는다.
// 삽입을 막아 둔 영상은 재생되지 않는다. 인터넷 연결이 필요하다.
const KEY = 'nanro.music';
export function parseYouTube(url) {
  try {
    const u = new URL(url.trim()); let v = null; const list = u.searchParams.get('list');
    if (u.hostname === 'youtu.be') v = u.pathname.slice(1).split('/')[0];
    else if (/youtube(-nocookie)?\.com$/.test(u.hostname.replace(/^(www|m|music)\./, ''))) { if (u.pathname === '/watch') v = u.searchParams.get('v'); else { const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]{6,})/); if (m) v = m[2]; } }
    if (v && !/^[\w-]{6,20}$/.test(v)) v = null;
    return v || list ? { v, list } : null;
  } catch { return /^[\w-]{11}$/.test(url.trim()) ? { v: url.trim(), list: null } : null; }
}

export class Music {
  constructor(mixer) {
    this.mixer = mixer; this.state = { url: '', loop: true, auto: false }; this.player = null; this.status = '링크를 넣고 재생을 누르세요'; this.playing = false; this.duck = 1; this.fade = 1;
    try { Object.assign(this.state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* 기본값 */ }
    const box = (this.box = document.createElement('div')); box.id = 'ytbox'; box.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;z-index:8;border:1px solid #5c4a33;border-radius:6px;overflow:hidden;background:#000';
    box.innerHTML = '<div id="ytplayer"></div>'; document.body.appendChild(box);
  }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* 무시 */ } }
  // 설정창이 열려 있을 때만 플레이어를 화면 안에 보인다
  dock(el) { const r = el?.getBoundingClientRect(); if (r && r.width > 0) { this.box.style.left = r.left + 'px'; this.box.style.top = r.top + 'px'; } else this.box.style.left = '-9999px'; }
  _api() {
    if (window.YT?.Player) return Promise.resolve();
    return (this._apiP = this._apiP || new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { this._apiP = null; rej(new Error('유튜브에 연결하지 못했습니다')); }; const prev = window.onYouTubeIframeAPIReady; window.onYouTubeIframeAPIReady = () => { prev?.(); res(); }; document.head.appendChild(s); }));
  }
  async play(url = this.state.url) {
    const id = parseYouTube(url); if (!id) { this.status = '유튜브 링크를 알아볼 수 없습니다'; this.onChange?.(); return false; }
    this.state.url = url.trim(); this.state.auto = true; this.save(); this.status = '불러오는 중…'; this.onChange?.();
    try { await this._api(); } catch (e) { this.status = e.message; this.onChange?.(); return false; }
    const vars = { autoplay: 1, controls: 1, playsinline: 1, rel: 0, ...(id.list ? { listType: 'playlist', list: id.list } : {}), ...(this.state.loop && id.v && !id.list ? { loop: 1, playlist: id.v } : {}) };
    if (this.player) { try { this.player.destroy(); } catch { /* 무시 */ } this.box.innerHTML = '<div id="ytplayer"></div>'; }
    this.player = new window.YT.Player('ytplayer', { width: 320, height: 180, videoId: id.v || undefined, playerVars: vars, host: 'https://www.youtube-nocookie.com', events: {
      onReady: (e) => { this.applyVolume(); e.target.playVideo(); },
      onStateChange: (e) => { this.playing = e.data === 1; this.status = e.data === 1 ? '재생 중: ' + (this.player.getVideoData?.().title || '') : e.data === 2 ? '일시 정지' : e.data === 0 ? '끝' : e.data === 3 ? '버퍼링…' : this.status; if (e.data === 0 && this.state.loop && !id.list) this.player.playVideo(); this.onChange?.(); },
      onError: (e) => { this.playing = false; this.status = e.data === 101 || e.data === 150 ? '이 영상은 다른 사이트에서 재생할 수 없게 설정되어 있습니다' : e.data === 100 ? '영상을 찾을 수 없습니다' : '재생할 수 없습니다 (오류 ' + e.data + ')'; this.onChange?.(); },
    } });
    return true;
  }
  toggle() { if (!this.player?.getPlayerState) return this.play(); if (this.player.getPlayerState() === 1) { this.player.pauseVideo(); this.state.auto = false; } else { this.player.playVideo(); this.state.auto = true; } this.save(); }
  stop() { try { this.player?.stopVideo(); } catch { /* 무시 */ } this.playing = false; this.state.auto = false; this.save(); this.status = '멈춤'; this.onChange?.(); }
  applyVolume() { try { this.player?.setVolume?.(Math.round(100 * this.mixer.volume('music') * this.mixer.volume('master') * this.duck * this.fade)); } catch { /* 준비 전 */ } }
}
