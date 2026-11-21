// 설정창: 불 그래픽 옵션(프리셋 + 항목별 값)과 소리 볼륨. O 키 또는 시작 화면의 "설정" 버튼으로 연다.
import { FIRE_FIELDS, FIRE_PRESETS, clampField, saveFireConfig } from './fireConfig.js';

const CSS = `
#settings { position: fixed; inset: 0; z-index: 6; display: none; place-items: center; background: rgba(5,3,2,.78); font-family: "Malgun Gothic", "Apple SD Gothic Neo", sans-serif; }
#settings.open { display: grid; }
#settings .box { width: min(760px, 94vw); max-height: 90vh; overflow: auto; background: #17110c; border: 1px solid #4a3a28; border-radius: 10px; padding: 20px 24px; color: #e9dcc6; font-size: 13px; }
#settings h2 { margin: 0 0 4px; font-size: 18px; font-weight: 600; }
#settings h3 { margin: 18px 0 8px; font-size: 14px; font-weight: 600; color: #f0c98a; border-bottom: 1px solid #3a2c1e; padding-bottom: 4px; }
#settings .note { opacity: .7; font-size: 12px; line-height: 1.6; margin: 2px 0 8px; }
#settings .row { display: grid; grid-template-columns: 210px 1fr 84px 96px; gap: 10px; align-items: center; padding: 5px 0; }
#settings .row .hint { grid-column: 1 / -1; opacity: .55; font-size: 11.5px; margin-top: -3px; }
#settings .row .rng { opacity: .6; font-size: 11.5px; text-align: right; white-space: nowrap; }
#settings .tag { font-size: 10.5px; border: 1px solid #5c4a33; border-radius: 3px; padding: 0 4px; margin-left: 6px; opacity: .75; }
#settings input[type=range] { width: 100%; accent-color: #e0933c; }
#settings input[type=number], #settings select { width: 100%; box-sizing: border-box; background: #0e0a07; color: inherit; border: 1px solid #4a3a28; border-radius: 4px; padding: 4px 6px; font: inherit; }
#settings .btns { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; flex-wrap: wrap; }
#settings button { background: #2a1f15; color: inherit; border: 1px solid #5c4a33; border-radius: 5px; padding: 7px 14px; font: inherit; cursor: pointer; }
#settings button.primary { background: #a8621f; border-color: #d98a3a; color: #fff; }
#settings button:hover { filter: brightness(1.2); }
#settings .tabs { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 6px; }
#settings .row.wide { grid-template-columns: 210px 1fr; }
#settings input[type=text] { width: 100%; box-sizing: border-box; background: #0e0a07; color: inherit; border: 1px solid #4a3a28; border-radius: 4px; padding: 6px 8px; font: inherit; }
#settings .state { margin-right: auto; align-self: center; opacity: .8; font-size: 12px; }
`;

export class Settings {
  // opts: { cfg (loadFireConfig 결과에 applyUrl 적용), fire, mixer, onOpen, onClose, getStats }
  constructor(opts) {
    Object.assign(this, opts);
    this.applied = { ...this.cfg.values }; // 지금 실제로 돌고 있는 값
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    const el = (this.el = document.createElement('div')); el.id = 'settings';
    el.innerHTML = `<div class="box">
      <h2>설정</h2>
      <div class="tabs" id="setTabs"></div>
      <div data-tab="fire">
      <div class="note" id="setStats"></div>
      <h3>불 그래픽</h3>
      <div class="note">프리셋을 고르거나 항목을 직접 바꿀 수 있습니다. 각 항목은 표시된 최소와 최대 사이에서 입력합니다. <span class="tag">바로 적용</span> 표시가 없는 항목은 "적용"을 누르면 화면을 다시 불러옵니다.</div>
      <div class="row"><label for="setPreset">프리셋</label><select id="setPreset"></select><span></span><span></span></div>
      <div id="setFields"></div>
      <div class="btns"><span class="state" id="setState"></span>
        <button id="setReset">프리셋 값으로 되돌리기</button><button id="setApply" class="primary">적용</button></div>
      </div>
      <div data-tab="sound"><h3>볼륨</h3><div id="setSound"></div></div>
      <div class="btns"><button id="setClose">닫기</button></div>
    </div>`;
    document.body.appendChild(el);
    const $ = (id) => el.querySelector('#' + id);
    this.$ = $;

    const sel = $('setPreset');
    for (const [k, p] of Object.entries(FIRE_PRESETS)) if (!p.hidden) sel.add(new Option(p.name, k));
    sel.add(new Option('사용자 지정', 'custom'));
    sel.addEventListener('change', () => {
      if (sel.value === 'custom') { this.cfg.custom = true; }
      else { this.cfg.preset = sel.value; this.cfg.custom = false; this.cfg.values = { ...FIRE_PRESETS[sel.value].v }; }
      this._fill(); this._live();
    });

    const wrap = $('setFields'); this.inputs = {};
    for (const f of FIRE_FIELDS) {
      const row = document.createElement('div'); row.className = 'row';
      const dec = f.step < 1 ? (String(f.step).split('.')[1] || '').length : 0;
      row.innerHTML = `<label>${f.label}${f.live ? '<span class="tag">바로 적용</span>' : ''}</label>
        <input type="range" min="${f.min}" max="${f.max}" step="${f.step}">
        <input type="number" min="${f.min}" max="${f.max}" step="${f.step}">
        <span class="rng">${f.toggle ? '0 끔 · 1 켬' : f.min + ' ~ ' + f.max}</span>${f.hint ? `<div class="hint">${f.hint}</div>` : ''}`;
      const [range, num] = row.querySelectorAll('input');
      const set = (raw, from) => {
        const x = clampField(f, raw); if (x == null) return;
        this.cfg.values[f.key] = +x.toFixed(4); this.cfg.custom = true;
        if (from !== range) range.value = x; if (from !== num) num.value = x.toFixed(dec);
        sel.value = 'custom'; this._state(); if (f.live) this._live();
      };
      range.addEventListener('input', () => set(range.value, range));
      num.addEventListener('change', () => { set(num.value, null); }); // 범위를 벗어난 입력은 최소/최대로 맞춘다
      this.inputs[f.key] = { range, num, dec };
      wrap.appendChild(row);
    }

    const snd = $('setSound');
    for (const [k, name] of [['master', '전체'], ['fire', '불 소리'], ['ambient', '환경음 (바람, 시계, 새)'], ['effects', '효과음 (책장, 발소리)'], ['music', '음악']]) {
      const row = document.createElement('div'); row.className = 'row';
      row.innerHTML = `<label>${name} 볼륨</label><input type="range" min="0" max="1" step="0.01"><span class="rng" style="text-align:left"></span><span></span>`;
      const r = row.querySelector('input'), t = row.querySelector('.rng');
      const show = () => { r.value = this.mixer.volume(k); t.textContent = Math.round(this.mixer.volume(k) * 100) + '%'; };
      r.addEventListener('input', () => { this.mixer.setVolume(k, r.value); show(); });
      (this._snd = this._snd || []).push(show); snd.appendChild(row);
    }

    // 탭: 불 그래픽, 소리 + 바깥에서 넘긴 구역(sections: [{ key, label, build(el, settings), onShow }])
    const box = el.querySelector('.box'), tabs = $('setTabs'), closeRow = box.lastElementChild;
    this.sectionEls = { fire: box.querySelector('[data-tab=fire]'), sound: box.querySelector('[data-tab=sound]') };
    const order = [['fire', '불 그래픽'], ['sound', '소리']];
    for (const sec of this.sections || []) {
      let d = this.sectionEls[sec.key]; if (!d) { d = document.createElement('div'); d.dataset.tab = sec.key; box.insertBefore(d, closeRow); this.sectionEls[sec.key] = d; order.push([sec.key, sec.label]); }
      sec.build(d, this);
    }
    this.tab = this.sections?.length ? order[2][0] : 'fire';
    for (const [k, label] of order) { const b = document.createElement('button'); b.textContent = label; b.dataset.k = k; b.addEventListener('click', () => this.show(k)); tabs.appendChild(b); }
    $('setApply').addEventListener('click', () => this.apply());
    $('setClose').addEventListener('click', () => this.close());
    $('setReset').addEventListener('click', () => { this.cfg.custom = false; this.cfg.values = { ...FIRE_PRESETS[this.cfg.preset].v }; this._fill(); this._live(); });
    el.addEventListener('click', (e) => { if (e.target === el) this.close(); });
    el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.code === 'Escape') this.close(); }); // 입력 중에 이동 키가 먹지 않게
    this._fill();
  }

  show(k) {
    this.tab = k; for (const [key, d] of Object.entries(this.sectionEls)) d.style.display = key === k ? '' : 'none';
    for (const b of this.$('setTabs').children) b.classList.toggle('primary', b.dataset.k === k);
    for (const s of this._snd || []) s();
    for (const sec of this.sections || []) (sec.key === k ? sec.onShow : sec.onHide)?.call(sec, this.sectionEls[sec.key]);
  }
  get isOpen() { return this.el.classList.contains('open'); }
  open(tab) { this._fill(); this.el.classList.add('open'); this.show(tab || this.tab); this.onOpen?.(); this._tick = setInterval(() => { this.$('setStats').textContent = this.getStats?.() || ''; }, 500); }
  close() { this.el.classList.remove('open'); clearInterval(this._tick); for (const sec of this.sections || []) sec.onHide?.(this.sectionEls[sec.key]); this.onClose?.(); }
  toggle() { this.isOpen ? this.close() : this.open(); }

  _fill() {
    this.$('setPreset').value = this.cfg.custom || this.cfg.fromUrl ? 'custom' : this.cfg.preset;
    for (const f of FIRE_FIELDS) { const i = this.inputs[f.key], v = this.cfg.values[f.key]; i.range.value = v; i.num.value = Number(v).toFixed(i.dec); }
    for (const s of this._snd || []) s();
    this._state();
  }
  // 다시 불러와야 하는 항목이 바뀌었는지
  _needsReload() { return FIRE_FIELDS.some((f) => !f.live && Number(this.cfg.values[f.key]) !== Number(this.applied[f.key])); }
  _state() {
    this.$('setState').textContent = this.cfg.fromUrl ? '주소 옵션으로 덮어쓴 값이 적용 중입니다.' : this._needsReload() ? '바뀐 값은 "적용"을 누르면 반영됩니다(화면을 다시 불러옴).' : '';
    this.$('setApply').textContent = this._needsReload() ? '적용 (다시 불러오기)' : '저장';
  }
  _live() { this.fire?.setLive(this.cfg.values); this._state(); }
  apply() {
    saveFireConfig(this.cfg);
    if (this._needsReload()) {
      // 주소의 측정용 옵션은 지우고 다시 불러온다(저장한 값이 적용되도록)
      const u = new URL(location.href); for (const k of ['q', 'grid', 'density', 'fq', 'rp']) u.searchParams.delete(k);
      location.href = u.toString();
    } else { this.applied = { ...this.cfg.values }; this._state(); this.close(); }
  }
}
