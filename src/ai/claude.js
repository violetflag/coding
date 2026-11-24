// Claude API 호출. 사용자의 키로 이 컴퓨터에서 api.anthropic.com 에 바로 보낸다(다른 곳으로는 보내지 않는다).
// 이 파일은 그림을 만들거나 설정에서 모델 목록을 볼 때만 불러온다(처음 켤 때의 묶음에는 들어가지 않는다).
import Anthropic from '@anthropic-ai/sdk';
import { getKey, aiPrefs } from './prefs.js';
import { DIAGRAM_SCHEMA, KINDS, normalizeDiagram } from './convert.js';

// 쉬운 말로 된 오류. code: nokey, nomodel, auth, model, rate, billing, server, network, timeout, refusal, cut, parse, abort, other
export class AiError extends Error { constructor(code, message) { super(message); this.code = code; } }

const client = (key) => new Anthropic({ apiKey: key, baseURL: 'https://api.anthropic.com', dangerouslyAllowBrowser: true, maxRetries: 2 });

// SDK 오류를 쉬운 말로. 좁은 것부터 차례로 본다(연결 오류는 APIError 의 한 갈래라 먼저 본다).
export function explain(e) {
  if (e instanceof AiError) return e;
  if (e instanceof Anthropic.APIUserAbortError) return new AiError('abort', '취소했습니다.');
  if (e instanceof Anthropic.AuthenticationError) return new AiError('auth', 'API 키가 맞지 않습니다. 설정의 "AI" 탭에서 키를 다시 넣어 주세요.');
  if (e instanceof Anthropic.PermissionDeniedError) return new AiError('auth', '이 키로는 이 모델이나 기능을 쓸 수 없습니다. 키의 권한을 확인해 주세요.');
  if (e instanceof Anthropic.NotFoundError) return new AiError('model', '고른 모델을 찾을 수 없습니다. 설정의 "AI" 탭에서 모델을 다시 골라 주세요.');
  if (e instanceof Anthropic.RateLimitError) return new AiError('rate', '요청이 너무 잦거나 계정의 사용 한도에 닿았습니다. 잠시 뒤에 다시 해 보세요.');
  if (e instanceof Anthropic.PaymentRequiredError) return new AiError('billing', '계정의 결제 정보나 남은 크레딧을 확인해 주세요 (console.anthropic.com).');
  if (e instanceof Anthropic.ContentTooLargeError) return new AiError('other', '메모가 너무 깁니다. 메모를 나눠서 해 보세요.');
  if (e instanceof Anthropic.BadRequestError) return new AiError('other', '요청이 받아들여지지 않았습니다: ' + short(e));
  if (e instanceof Anthropic.InternalServerError) return new AiError('server', 'Claude 쪽 서버가 바쁘거나 문제가 있습니다. 잠시 뒤에 다시 해 보세요.');
  if (e instanceof Anthropic.APIConnectionTimeoutError) return new AiError('timeout', '응답이 너무 오래 걸려 멈췄습니다. 잠시 뒤에 다시 해 보세요.');
  if (e instanceof Anthropic.APIConnectionError) return new AiError('network', 'api.anthropic.com 에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.');
  if (e instanceof Anthropic.APIError) return new AiError('other', `Claude API 오류 (${e.status ?? '?'}): ` + short(e));
  return new AiError('other', '알 수 없는 문제로 멈췄습니다: ' + (e?.message || e));
}
const short = (e) => String(e?.error?.error?.message || e?.message || '').slice(0, 160);

// 모델 목록(최신이 앞). 목록을 못 받으면 오류를 던진다.
export async function listModels(key = getKey()) {
  if (!key) throw new AiError('nokey', 'API 키를 먼저 넣어 주세요.');
  const out = [];
  try { for await (const m of client(key).models.list()) out.push(m); } catch (e) { throw explain(e); }
  return out.sort((a, b) => Date.parse(b.created_at || 0) - Date.parse(a.created_at || 0));
}

// 기본 모델: 목록에서 가장 새 Opus, 없으면 가장 새 모델
export function pickDefault(models) {
  const opus = models.filter((m) => /opus/i.test(`${m.display_name} ${m.id}`));
  return (opus[0] || models[0]) ?? null;
}

// 연결 시험: 고른 모델의 정보를 받아 본다(요금이 들지 않는다)
export async function testConnection(model, key = getKey()) {
  if (!key) throw new AiError('nokey', 'API 키를 먼저 넣어 주세요.');
  if (!model) throw new AiError('nomodel', '모델을 먼저 골라 주세요.');
  try { return await client(key).models.retrieve(model); } catch (e) { throw explain(e); }
}

const SYSTEM = `당신은 독서 메모를 한눈에 이해되는 그림(개념도)으로 바꿔 주는 도우미입니다.
사용자가 책을 읽으며 마크다운으로 적은 메모와 책 정보를 받습니다. 메모에 담긴 생각을, 이 책을 읽는 사람이 쉽게 이해하도록 상자와 화살표로 정리합니다.

규칙
- 모든 글은 한국어로 씁니다. 책 제목, 사람 이름 같은 고유명사는 원래대로 둡니다.
- 사용자가 쓴 말을 되도록 그대로 살립니다. 메모에 없는 사실을 지어내지 않습니다. 이해를 돕는 짧은 풀이는 괜찮습니다.
- 상자 글(label)은 짧게 씁니다: 한 줄에 20자 안팎, 많아야 두 줄.
- kind 는 다음 가운데 하나입니다.
  main: 메모 전체의 중심 생각 (꼭 1개)
  concept: 핵심 개념이나 주장
  example: 예시, 인용, 책 속 장면
  question: 사용자가 품은 질문이나 더 생각해 볼 점
  insight: 결론, 깨달음, 내 생각
- edges 는 from 에서 to 로 가는 화살표입니다. 중심 생각에서 바깥으로(큰 생각에서 구체적인 것으로) 향하게 합니다.
  label 은 관계를 2~6자로 씁니다 (예: 예를 들면, 그래서, 왜냐하면, 반대로, 포함). 필요 없으면 빈 문자열입니다.
- 모든 상자는 적어도 하나의 화살표로 이어집니다. 화살표가 서로 엉키지 않게, 하나의 상자에서 나가는 화살표는 5개 이하로 합니다.
- group 은 같은 장이나 같은 주제로 묶이는 상자에 같은 짧은 이름을 줍니다. 묶을 것이 없으면 빈 문자열입니다.
- id 는 n1, n2 처럼 짧고 서로 다르게 씁니다.
- title 은 그림의 제목(20자 안팎), summary 는 메모 전체를 2~3문장의 쉬운 말로 요약한 것입니다.
- 메모가 짧으면 상자도 적게 만듭니다. 상자를 채우려고 내용을 늘리지 않습니다.`;

const LEVEL = {
  easy: '설명 수준: 쉽게. 중학생도 바로 이해할 쉬운 말로 씁니다. 상자는 많아야 12개입니다.',
  detail: '설명 수준: 자세히. 개념 사이의 이유와 근거도 화살표로 보여 줍니다. 상자는 많아야 18개입니다.',
};

const META_NAMES = { title: '제목', author: '지은이', position: '읽은 곳', chapter: '장', page: '쪽', progress: '진도', date: '날짜', tags: '태그' };
function metaText(meta = {}) {
  const lines = [];
  for (const [k, v] of Object.entries(meta || {})) {
    if (v == null || v === '' || typeof v === 'object' && !Array.isArray(v)) continue;
    lines.push(`${META_NAMES[k] || k}: ${Array.isArray(v) ? v.join(', ') : v}`);
  }
  return lines.join('\n') || '(책 정보 없음)';
}

// 메모를 그림 자료로: { title, summary, nodes: [{ id, label, kind, group }], edges: [{ from, to, label }] }
// onStatus(글): 진행 상황. signal: 취소.
export async function requestDiagram({ markdown, meta, level, signal, onStatus = () => {} }) {
  const key = getKey(), p = aiPrefs();
  if (!key) throw new AiError('nokey', 'API 키가 없습니다. 설정의 "AI" 탭에서 키를 넣어 주세요.');
  if (!p.model) throw new AiError('nomodel', '모델을 고르지 않았습니다. 설정의 "AI" 탭에서 모델을 골라 주세요.');
  const c = client(key);
  try {
    onStatus('모델 정보를 확인하는 중…');
    // 모델이 할 수 있는 것(생각하기, 노력 정도, 형식 맞춘 출력)을 목록에서 읽고 그에 맞춰 요청한다
    const info = await c.models.retrieve(p.model, null, { signal });
    const caps = info.capabilities || {};
    const lv = level || p.level || 'easy';
    const params = {
      model: p.model,
      max_tokens: Math.min(info.max_tokens || 16000, 64000),
      system: SYSTEM + '\n\n' + (LEVEL[lv] || LEVEL.easy),
      messages: [{ role: 'user', content: `책 정보\n${metaText(meta)}\n\n<memo>\n${markdown || ''}\n</memo>\n\n이 메모를 그림으로 정리해 주세요.` }],
    };
    if (caps.thinking?.types?.adaptive?.supported) params.thinking = { type: 'adaptive' };
    const oc = {}, effort = lv === 'detail' ? 'high' : 'medium';
    if (caps.effort?.supported && caps.effort[effort]?.supported) oc.effort = effort;
    const structured = !!caps.structured_outputs?.supported;
    if (structured) oc.format = { type: 'json_schema', schema: DIAGRAM_SCHEMA };
    else params.system += `\n\n답은 다른 말 없이 JSON 하나로만 씁니다. 형식: ${JSON.stringify(DIAGRAM_SCHEMA)}`;
    if (Object.keys(oc).length) params.output_config = oc;

    onStatus('메모를 읽고 생각하는 중…');
    const stream = c.messages.stream(params, { signal });
    let chars = 0, last = 0;
    for await (const ev of stream) {
      if (ev.type === 'content_block_start' && ev.content_block.type === 'text') onStatus('그림을 짜는 중…');
      else if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
        chars += ev.delta.text.length;
        if (chars - last > 200) { last = chars; onStatus(`그림을 짜는 중… (${chars}자)`); }
      }
    }
    const msg = await stream.finalMessage();
    if (msg.stop_reason === 'refusal') throw new AiError('refusal', '이 메모는 AI가 안전 기준 때문에 설명하지 않았습니다. 내용을 조금 바꿔서 다시 해 보세요.');
    if (msg.stop_reason === 'max_tokens') throw new AiError('cut', '답이 너무 길어 중간에 끊겼습니다. 메모를 나눠서 하거나 설명 수준을 "쉽게"로 바꿔 보세요.');
    const text = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return parseDiagram(text, structured);
  } catch (e) { throw explain(e); }
}

function parseDiagram(text, structured) {
  let raw = text.trim();
  if (!structured) { const a = raw.indexOf('{'), b = raw.lastIndexOf('}'); if (a >= 0 && b > a) raw = raw.slice(a, b + 1); }
  let d; try { d = JSON.parse(raw); } catch { throw new AiError('parse', 'AI의 답을 그림으로 읽지 못했습니다. 다시 해 보세요.'); }
  const n = normalizeDiagram(d);
  if (!n.nodes.length) throw new AiError('parse', 'AI가 그릴 내용을 찾지 못했습니다. 메모에 내용을 조금 더 적어 보세요.');
  return n;
}

export { KINDS };
