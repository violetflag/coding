// 사진 촬영과 시험에 쓰는 견본 EPUB을 만든다 (books/sample.epub). 글은 이 저장소를 위해 새로 쓴 것이라 저작권 걱정이 없다.
import { zipSync, strToU8 } from 'fflate';
import fs from 'node:fs';

const P = [
  '첫눈이 오던 날 저녁, 나는 오두막의 문을 닫고 벽난로 앞에 앉았다. 장작은 가을 내내 처마 밑에서 말린 참나무였고, 불쏘시개로 쓸 자작나무 껍질은 바구니에 넉넉했다.',
  '불은 서두르는 사람을 좋아하지 않는다. 성냥을 긋고, 작은 불씨가 껍질을 타고 오르기를 기다리고, 가는 가지가 소리를 내며 붙기를 기다린다. 그제야 굵은 장작 하나를 비스듬히 얹는다.',
  '방은 천천히 따뜻해졌다. 창밖의 소나무는 눈을 이고 서 있었고, 유리에는 김이 서렸다. 주전자에서 물 끓는 소리가 나기 시작하자 나는 찻잔을 꺼내 탁자 위에 놓았다.',
  '책장에서 오래 미뤄 둔 책을 한 권 뽑았다. 가죽 등에는 금박 글씨가 반쯤 닳아 있었다. 무릎에 담요를 덮고 책을 펼치니, 종이에서 마른 풀 같은 냄새가 났다.',
  '읽는다는 것은 남의 불가에 잠시 앉았다 가는 일이라고, 누군가 말한 적이 있다. 쓴 사람은 오래전에 자리를 떴어도 불은 여전히 타고 있고, 우리는 그 온기에 손을 쬔다.',
  '밤이 깊어지자 불꽃은 낮아지고 숯은 붉게 익었다. 나는 부지깽이로 재를 헤치고 장작 하나를 더 넣었다. 나무는 잠깐 망설이다가, 이내 환하게 타올랐다.',
  '시계가 열한 시를 쳤다. 책갈피를 끼우고 책을 덮었다. 내일도 눈은 올 것이고, 장작은 충분하며, 읽을 책은 아직 많이 남아 있다. 그것으로 넉넉한 겨울이었다.',
];
const TITLES = ['첫눈', '불 피우기', '창가', '오래된 책', '남의 불가', '깊은 밤', '열한 시', '아침'];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const chapter = (i) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko"><head><title>${TITLES[i]}</title></head><body>
<h1>${i + 1}. ${TITLES[i]}</h1>
${Array.from({ length: 14 }, (_, k) => `<p>${esc(P[(i * 3 + k) % P.length])}</p>`).join('\n')}
</body></html>`;
const n = TITLES.length, ids = [...Array(n).keys()];
const files = {
  mimetype: [strToU8('application/epub+zip'), { level: 0 }],
  'META-INF/container.xml': strToU8(`<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`),
  'OEBPS/content.opf': strToU8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="id">nanro-sample</dc:identifier><dc:title>겨울 난롯가에서</dc:title><dc:creator>난로 견본</dc:creator><dc:language>ko</dc:language></metadata>
<manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>${ids.map((i) => `<item id="c${i}" href="c${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}</manifest>
<spine>${ids.map((i) => `<itemref idref="c${i}"/>`).join('')}</spine></package>`),
  'OEBPS/nav.xhtml': strToU8(`<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>차례</title></head><body><nav epub:type="toc"><ol>${ids.map((i) => `<li><a href="c${i}.xhtml">${TITLES[i]}</a></li>`).join('')}</ol></nav></body></html>`),
};
for (const i of ids) files[`OEBPS/c${i}.xhtml`] = strToU8(chapter(i));
fs.mkdirSync('books', { recursive: true });
fs.writeFileSync('books/sample.epub', zipSync(files));
console.log('books/sample.epub');
