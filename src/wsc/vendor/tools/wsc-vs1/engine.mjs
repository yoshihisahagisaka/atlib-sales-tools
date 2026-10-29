import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const assetCache = new Map();
const embeddedAsset = (name, mime) => {
  if (!assetCache.has(name)) assetCache.set(name, `data:${mime};base64,${fs.readFileSync(path.join(MODULE_ROOT, 'assets', name)).toString('base64')}`);
  return assetCache.get(name);
};

// The v7 introduction is approved source copy. It is intentionally emitted verbatim.
export const APPROVED_INTRO = `<p>会社のWebサイトのURLは、誰でも見ることができる情報です。</p><p>実は、このURLを手がかりに、インターネット上に公開されているさまざまな設定情報を調べることができます。</p><p>例えば、次のようなことです。</p><h3>Webサイトの通信が暗号化されているか</h3><p>お客様がWebサイトを閲覧する際の通信を守る仕組みについて、外部から確認できます。</p><h3>Webサイトにどのような保護設定があるか</h3><p>不正なプログラムの動作や、他サイトによる画面の悪用を抑えるための公開設定を確認できます。</p><h3>会社を装った偽メールへの対策</h3><p>対象ドメインに公開されているメール認証の設定から、なりすまし対策の方針を確認できます。</p><h3>特別な社内情報を調べているわけではありません</h3><p>今回の診断では、社内のパソコンや業務システムにログインしたり、機密情報を取得したりすることはありません。</p><p>インターネット上に公開されている情報を確認し、その意味を分かりやすく整理しています。</p><h3>大切なのは、結果を知ることから</h3><p>近年、企業や団体への不正アクセスや情報漏えいが相次いで報じられています。こうした被害は、事業の継続や取引先との信頼にも関わる問題です。</p><p>対策の第一歩は、まず自社の現状を知ることです。今回の診断で分かった公開設定を手がかりに、すでに行われている対策と、これから確認しておきたいことを整理してみましょう。</p><p class="intro-news-source">参考：IPA「不正アクセスによる漏えい等の事案を踏まえ、速やかに実施すべき対策等について」（2026年10月9日） <a href="https://www.ipa.go.jp/security/security-alert/2026/alert20261009.html">公的な注意喚起を見る</a></p><h3>このレポートが、自社のセキュリティについて考えるきっかけになれば幸いです。</h3>`;

const read = (path) => JSON.parse(fs.readFileSync(path, 'utf8').replace(/^\uFEFF/, ''));
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = (value) => typeof value === 'string' ? value : null;
const html = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const evidence = (label, value, display = value) => ({ label, raw: value, display: display === null ? '（値なし）' : display });
const japaneseDate = (value) => {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return value;
  return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(value));
};
const tlsProtocol = (value) => value === 'Tls13' ? 'TLS 1.3' : value;
export function normalizeDiagnosisUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error('企業URLまたは診断対象URLが有効な絶対URLではありません。'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('企業URLまたは診断対象URLは認証情報なしのHTTP(S) URLである必要があります。');
  const port = (url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80') ? '' : url.port;
  const pathname = url.pathname === '/' ? '/' : url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.hostname.toLowerCase()}${port ? `:${port}` : ''}${pathname}${url.search}`;
}
export function assertUrlMatch(companyUrl, targetUrl) {
  const company = normalizeDiagnosisUrl(companyUrl);
  const target = normalizeDiagnosisUrl(targetUrl);
  if (company !== target) throw new Error(`企業URLと診断対象URLが一致しないため生成を停止しました。企業URL: ${company} / 診断対象URL: ${target}。リダイレクトや別ドメインは推測で同一視しません。`);
  return company;
}
const FV_COPY = Object.freeze({
  TLS_VALID: '通信の暗号化ができています', HSTS_ENABLED: '暗号化通信を継続する設定があります', NOSNIFF_ENABLED: 'ファイルの誤った取り扱いを抑える設定があります', CSP_HEADER_ABSENT: 'プログラムの読み込み制限について確認をおすすめします', FRAME_HEADER_ABSENT: '他サイトへの画面表示の制限について確認をおすすめします', SPF_PRESENT: 'メールの送信元を示す設定があります', DMARC_NONE: '偽メールの隔離・拒否を求める設定にはなっていません'
});
const IMPACT_COPY = Object.freeze({
  TLS_VALID: 'Webサイトでやり取りする情報を第三者に盗み見られたり、通信内容を改ざんされたりするおそれがあります。',
  TLS_EXPIRING: 'Webサイトでやり取りする情報を第三者に盗み見られたり、通信内容を改ざんされたりするおそれがあります。',
  TLS_INVALID: 'Webサイトでやり取りする情報を第三者に盗み見られたり、通信内容を改ざんされたりするおそれがあります。',
  HSTS_ENABLED: '利用者が暗号化されていない通信へ誘導され、通信内容の盗聴や改ざんにつながるおそれがあります。',
  HSTS_DISABLED: '利用者が暗号化されていない通信へ誘導され、通信内容の盗聴や改ざんにつながるおそれがあります。',
  NOSNIFF_ENABLED: 'Webサイトのファイルが悪用され、閲覧した人のパソコンで不正なプログラムが動いたり、情報を盗まれたりするおそれがあります。',
  CSP_HEADER_ABSENT: 'Webサイトに不正なプログラムが入り込んだ場合、利用者の情報が盗まれたり、不正なサイトへ誘導されたりする被害を抑えにくくなります。',
  CSP_HEADER_PRESENT: 'Webサイトに不正なプログラムが入り込んだ場合、利用者の情報が盗まれたり、不正なサイトへ誘導されたりする被害を抑えにくくなります。',
  FRAME_HEADER_ABSENT: '偽装された画面を使い、利用者が気づかないうちに意図しない操作をさせられるおそれがあります。',
  SPF_PRESENT: '自社を装った偽メールが取引先に届き、偽の請求書や振込先変更の案内による詐欺被害につながるおそれがあります。',
  SPF_MULTIPLE: '自社を装った偽メールが取引先に届き、偽の請求書や振込先変更の案内による詐欺被害につながるおそれがあります。',
  DMARC_NONE: '自社を装った偽メールによって取引先に金銭被害や情報漏えいが発生し、自社の信用低下や取引停止につながりかねません。',
  DMARC_ENFORCING: '自社を装った偽メールによって取引先に金銭被害や情報漏えいが発生し、自社の信用低下や取引停止につながりかねません。',
  DMARC_ABSENT: '自社を装った偽メールによって取引先に金銭被害や情報漏えいが発生し、自社の信用低下や取引停止につながりかねません。'
});
const PROTECTION_COPY = Object.freeze({
  TLS: ['Webサイトのアドレスが「https://」で始まっているのを見たことがあると思います。これは、Webサイトと利用者の間でやり取りする情報を暗号化し、第三者に盗み見られたり、途中で書き換えられたりすることを防ぐための仕組みです。', 'また、Webサイトの証明書は、接続先が正しい相手であることを確認するために使われます。ブラウザで「この接続ではプライバシーが保護されません」といった警告が表示される場合、証明書に問題があることなどが考えられます。'],
  HSTS: ['Webサイトのアドレスに「http://」と入力しても、自動的に「https://」へ切り替わることがあります。', 'HSTSは、ブラウザに対して、次回以降も暗号化されたHTTPS通信を使うよう指示する仕組みです。暗号化されていない通信へ戻ってしまう危険を減らします。'],
  CSP: ['Webサイトには、メニューを開いたり、入力内容を確認したりするためのプログラムが使われています。', 'CSPは、こうしたプログラムをどこから読み込んでよいかなどを制限する仕組みです。万が一、不正なプログラムが入り込んだ場合でも、勝手な動作や情報の持ち出しを抑えるために役立ちます。'],
  FRAME: ['Webサイトの一部が、別のWebサイトの中に表示されているのを見たことがあるかもしれません。', '画面埋め込み制御は、自社のWebページが他のサイト内に勝手に組み込まれることを制限する仕組みです。悪意のあるサイトに自社の画面を利用され、利用者が気づかないうちに意図しない操作をさせられる攻撃を防ぐために役立ちます。'],
  NOSNIFF: ['Webサイトでは、画像や文章、プログラムなど、さまざまな種類のファイルが使われています。', 'NOSNIFFは、ブラウザがファイルの種類を勝手に判断して、想定外の方法で扱うことを防ぐための仕組みです。', '例えば、本来はデータとして扱うべきファイルが、プログラムとして動いてしまうような危険を減らします。'],
  SPF: ['普段、会社のメールアドレスから取引先へメールを送ると思います。しかし、メールの差出人は偽装されることがあります。', 'SPFは、その会社のドメインからメールを送信してよいサーバーをあらかじめ登録しておく仕組みです。受信側が送信元を確認する際の手がかりになり、なりすましメールを見分けるために役立ちます。'],
  DMARC: ['迷惑メールフォルダに、不審なメールが自動的に振り分けられた経験があると思います。', 'DMARCは、自社を装ったメールが認証に失敗した場合、受信側に対して隔離や拒否などの対応方針を伝える仕組みです。自社の名前を悪用した偽メールが取引先などに届く危険を減らすために役立ちます。']
});
const IMPACT_DETAIL_COPY = Object.freeze({
  TLS: ['暗号化されていない通信に第三者が介入すると、送信した情報を盗み見られたり、表示内容を書き換えられたりするおそれがあります。', '例えば、お問い合わせフォームに入力した氏名やメールアドレスなどが漏えいすれば、お客様への被害だけでなく、企業の信用問題にもつながりかねません。'],
  HSTS: ['利用者が暗号化されていない通信を使った隙に、第三者が通信へ介入し、偽のWebページへ誘導したり、通信内容を盗み見たりするおそれがあります。', '例えば、外出先のネットワークなどを利用している際に、通信を悪用される可能性があります。'],
  CSP: ['正規のショッピングサイトに不正なプログラムが仕込まれると、本物の決済画面に見せかけた入力欄から、クレジットカード番号などを盗まれるおそれがあります。', '利用者は正規のサイトを使っているつもりなので、不正に気づきにくいことがあります。こうした被害が発生すれば、お客様の金銭被害だけでなく、企業の信用低下や取引停止にもつながりかねません。'],
  FRAME: ['例えば、悪意のあるサイトが正規のWebサイトの画面を重ねて表示し、利用者に別のボタンを押していると思わせながら、実際には正規サイト上の操作をさせることがあります。', 'こうした手口によって、利用者が意図しない設定変更や情報の送信などを行ってしまうおそれがあります。'],
  NOSNIFF: ['Webサイトに置かれた画像や文章などのファイルが、ブラウザに誤ってプログラムとして扱われることがあります。', 'これを悪用されると、利用者が普通にWebサイトを見ているだけで、不正なプログラムが動き、情報を盗まれるおそれがあります。', 'こうした被害は、利用者の安全だけでなく、Webサイトを運営する企業への信頼にも影響する可能性があります。'],
  SPF: ['自社を装った偽メールが取引先に届き、偽の請求書や振込先変更の案内による詐欺被害につながるおそれがあります。', '例えば、普段から取引している会社の名前で振込先変更のメールが届けば、担当者が本物と信じて送金してしまう可能性があります。', '取引先が被害を受ければ、自社の信用にも影響しかねません。'],
  DMARC: ['自社を装った偽メールによって取引先に金銭被害や情報漏えいが発生し、自社の信用低下や取引停止につながりかねません。', '特に、取引先が自社からの正式な連絡だと思い込み、偽の請求書への支払いや機密情報の送信を行ってしまうことが考えられます。', '被害が広がれば、取引先との信頼関係の修復に長い時間を要する可能性もあります。']
});
const SOURCES = Object.freeze({
  TLS_VALID: [['RFC 8446', 'https://www.rfc-editor.org/rfc/rfc8446']], TLS_EXPIRING: [['RFC 8446', 'https://www.rfc-editor.org/rfc/rfc8446']], TLS_INVALID: [['RFC 8446', 'https://www.rfc-editor.org/rfc/rfc8446']],
  HSTS_ENABLED: [['RFC 6797', 'https://www.rfc-editor.org/rfc/rfc6797']], HSTS_DISABLED: [['RFC 6797', 'https://www.rfc-editor.org/rfc/rfc6797']],
  CSP_HEADER_ABSENT: [['MDN CSP', 'https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/Content-Security-Policy']], CSP_HEADER_PRESENT: [['MDN CSP', 'https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/Content-Security-Policy']],
  FRAME_HEADER_ABSENT: [['MDN X-Frame-Options', 'https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/X-Frame-Options'], ['MDN CSP frame-ancestors', 'https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/Content-Security-Policy']],
  NOSNIFF_ENABLED: [['MDN X-Content-Type-Options', 'https://developer.mozilla.org/ja/docs/Web/HTTP/Reference/Headers/X-Content-Type-Options']], SPF_PRESENT: [['RFC 7208', 'https://www.rfc-editor.org/rfc/rfc7208']], SPF_MULTIPLE: [['RFC 7208', 'https://www.rfc-editor.org/rfc/rfc7208']],
  DMARC_NONE: [['DMARC specification', 'https://www.rfc-editor.org/rfc/rfc7489']], DMARC_ENFORCING: [['DMARC specification', 'https://www.rfc-editor.org/rfc/rfc7489']], DMARC_ABSENT: [['DMARC specification', 'https://www.rfc-editor.org/rfc/rfc7489']]
});

export function evaluate(input, { rulesPath, explanationsPath } = {}) {
  if (!isObject(input)) throw new Error('入力JSONはオブジェクトである必要があります。');
  const rules = rulesPath ? read(rulesPath) : { ruleVersion: 'WSC-R-1.0.0-draft' };
  const explanations = explanationsPath ? read(explanationsPath).entries : null;
  if (!explanations) throw new Error('固定解説ファイルが必要です。');
  const findings = [];
  const internalOnly = [];
  const add = (id, status, details) => {
    if (!explanations[id]) throw new Error(`固定解説が未定義です: ${id}`);
    findings.push({ id, status, ...explanations[id], details });
  };
  const http = isObject(input.http) ? input.http : null;
  const headers = http && isObject(http.headers) ? http.headers : null;
  const tls = isObject(input.tls) ? input.tls : null;
  const dns = isObject(input.dns) ? input.dns : null;
  const spf = dns && isObject(dns.spf) ? dns.spf : null;
  const dmarc = dns && isObject(dns.dmarc) ? dns.dmarc : null;

  if (tls && tls.status === 'VALIDATED' && tls.policyErrors === 'None') {
    add('TLS_VALID', '設定確認済み', [evidence('証明書検証', tls.status, '成功'), evidence('検証エラー', tls.policyErrors, 'なし'), evidence('通信方式', text(tls.negotiatedProtocol), tlsProtocol(text(tls.negotiatedProtocol))), evidence('証明書の期限', text(tls.notAfter), japaneseDate(text(tls.notAfter)))]);
    if (Number.isInteger(tls.daysRemaining) && tls.daysRemaining >= 0 && tls.daysRemaining <= 30) add('TLS_EXPIRING', '追加確認推奨', [evidence('残日数', tls.daysRemaining), evidence('証明書の期限', text(tls.notAfter), japaneseDate(text(tls.notAfter)))]);
  } else if (tls && tls.status === 'VALIDATION_FAILED' && typeof tls.policyErrors === 'string' && tls.policyErrors !== 'None') {
    add('TLS_INVALID', '追加確認推奨', [evidence('検証状態', tls.status), evidence('検証エラー', tls.policyErrors)]);
  } else if (tls) internalOnly.push('TLS: 未定義または判定不能のTLS状態');

  if (http && http.status === 'OK' && headers) {
    const hsts = text(headers['Strict-Transport-Security']);
    const match = hsts && /(?:^|;)\s*max-age\s*=\s*(\d+)/i.exec(hsts);
    if (match && Number(match[1]) > 0) add('HSTS_ENABLED', '設定確認済み', [evidence('Strict-Transport-Security', hsts)]);
    else if (hsts === null || (match && Number(match[1]) === 0)) add('HSTS_DISABLED', '追加確認推奨', [evidence('Strict-Transport-Security', hsts)]);
    else internalOnly.push('HSTS: max-ageを判定できない形式');
    const csp = text(headers['Content-Security-Policy']);
    if (csp === null) add('CSP_HEADER_ABSENT', '追加確認推奨', [evidence('Content-Security-Policy', null, '今回のHTTP応答にCSPヘッダーなし')]);
    else if (csp.trim()) add('CSP_HEADER_PRESENT', '設定確認済み', [evidence('Content-Security-Policy', csp)]);
    else internalOnly.push('CSP: 空文字は未定義');
    if (text(headers['X-Frame-Options']) === null && csp === null) add('FRAME_HEADER_ABSENT', '追加確認推奨', [evidence('X-Frame-Options', null, '今回のHTTP応答にX-Frame-Optionsヘッダーなし'), evidence('Content-Security-Policy', null, '今回のHTTP応答にCSPヘッダーなし')]);
    if (text(headers['X-Content-Type-Options'])?.toLowerCase() === 'nosniff') add('NOSNIFF_ENABLED', '設定確認済み', [evidence('X-Content-Type-Options', headers['X-Content-Type-Options'])]);
  } else if (http) internalOnly.push('HTTP: OK応答ではないためヘッダー不在を判定しない');

  if (spf && spf.lookupStatus === 'FOUND' && Array.isArray(spf.records) && Number.isInteger(spf.recordCount) && spf.recordCount === spf.records.length) {
    if (spf.recordCount === 1 && typeof spf.records[0] === 'string' && /^v=spf1(?:\s|$)/i.test(spf.records[0])) add('SPF_PRESENT', '設定確認済み', [evidence('SPFレコード', spf.records[0]), evidence('レコード数', spf.recordCount)]);
    else if (spf.recordCount > 1) add('SPF_MULTIPLE', '追加確認推奨', [evidence('レコード数', spf.recordCount)]);
    else internalOnly.push('SPF: 形式が未定義');
  } else if (spf) internalOnly.push('SPF: DNS取得状態またはレコード型が判定不能');

  const p = dmarc && isObject(dmarc.tags) ? text(dmarc.tags.p)?.toLowerCase() : null;
  if (dmarc && dmarc.lookupStatus === 'FOUND' && Array.isArray(dmarc.records) && dmarc.recordCount === 1) {
    if (p === 'none') add('DMARC_NONE', '追加確認推奨', [evidence('DMARCレコード', dmarc.records.join(' ')), evidence('p値', p)]);
    else if (p === 'quarantine' || p === 'reject') add('DMARC_ENFORCING', '設定確認済み', [evidence('p値', p)]);
    else internalOnly.push('DMARC: p値が未定義');
  } else if (dmarc && dmarc.lookupStatus === 'NO_RECORD') add('DMARC_ABSENT', '追加確認推奨', [evidence('DNS取得状態', dmarc.lookupStatus)]);
  else if (dmarc) internalOnly.push('DMARC: DNS取得状態またはレコード型が判定不能');

  return { ruleVersion: rules.ruleVersion, contentVersion: read(explanationsPath).contentVersion, checkedAt: text(input.checkedAt), targetUrl: text(input.targetUrl), findings, internalOnly };
}

export function render(report, company) {
  for (const key of ['name', 'url']) if (!text(company?.[key])) throw new Error(`企業情報 ${key} が必要です。`);
  if (!report.checkedAt || !report.targetUrl) throw new Error('checkedAt と targetUrl が必要です。');
  assertUrlMatch(company.url, report.targetUrl);
  const assets = { cover: embeddedAsset('wsc-cover-network.jpg', 'image/jpeg'), globe: embeddedAsset('globe-lock.png', 'image/png'), mail: embeddedAsset('mail-check.png', 'image/png'), shield: embeddedAsset('shield-check.png', 'image/png'), warning: embeddedAsset('message-circle-warning.png', 'image/png') };
  const sectionOf = (id) => /^(TLS|HSTS)/.test(id) ? 'https' : /^(CSP|FRAME|NOSNIFF)/.test(id) ? 'web' : 'email';
  const groups = { https: report.findings.filter(f => sectionOf(f.id) === 'https'), web: report.findings.filter(f => sectionOf(f.id) === 'web'), email: report.findings.filter(f => sectionOf(f.id) === 'email') };
  const evidenceList = (f) => f.details.map(d => `<li><b>${html(d.label)}：</b><span class="value">${html(d.display)}</span>${d.raw !== d.display ? `<small class="raw">原値：${html(d.raw === null ? 'null' : d.raw)}</small>` : ''}</li>`).join('');
  const icon = (id) => /^(TLS|HSTS)/.test(id) ? assets.globe : /^(CSP|FRAME|NOSNIFF)/.test(id) ? assets.shield : id.startsWith('SPF') ? assets.mail : assets.warning;
  const summary = (items) => items.map(f => `<div class="ov-item"><img class="fv-icon" src="${icon(f.id)}" alt=""><div><b>${html(FV_COPY[f.id] || f.observation)}</b><small>${html(f.details[0]?.display || f.title)}</small></div><span class="ov-status ${f.status === '追加確認推奨' ? 'review' : ''}">${html(f.status)}</span></div>`).join('');
  const source = (f) => (SOURCES[f.id] || []).map(([name, url]) => `<a href="${url}">${html(name)}</a>`).join(' ／ ') || (f.reference ? html(f.reference) : '');
  const finding = (f) => `<article class="finding ${f.status === '追加確認推奨' ? 'review' : ''}" data-finding-id="${html(f.id)}"><span class="tag">${html(f.status)}</span><h3>${html(f.title)}</h3><h4>今回の診断結果</h4><p>${html(f.observation)}</p><div class="evidence"><h4>そう判断した根拠</h4><ul>${evidenceList(f)}</ul><p>${html(f.evidenceExplanation)}</p></div><h4>なぜ大切なのか</h4><p>${html(f.knowledge)}</p><div class="action"><h4>次に確認すること</h4><p>${html(f.nextAction)}</p></div>${source(f) ? `<p class="source">技術的な参考資料：${source(f)}</p>` : ''}</article>`;
  const detail = (id, title, lead, items) => !items.length ? '' : `<section class="detail report-section" id="${id}"><h2>${title}</h2><p class="lead">${lead}</p>${items.map(finding).join('')}</section>`;
  const review = report.findings.filter(f => f.status === '追加確認推奨');
  const date = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(report.checkedAt));
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${html(company.name)}｜Webセキュリティ診断レポート</title><style>:root{--navy:#1F3556;--orange:#F28C38;--green:#2DBE9D;--off:#F8FAFC;--line:#DCE5F0}*{box-sizing:border-box}html{background:var(--off);scroll-behavior:smooth}body{margin:0;color:var(--navy);font-family:"Yu Gothic","Meiryo",sans-serif;line-height:1.75}.topnav{position:sticky;top:0;z-index:3;background:#fffffff5;border-bottom:1px solid var(--line)}.nav-inner{max-width:1100px;min-height:68px;margin:auto;padding:10px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px}.brand{font-weight:800;font-size:18px}.nav-links{display:flex;gap:18px}.nav-links a{color:var(--navy);font-weight:700;text-decoration:none;font-size:13px}.print-button{border:0;border-radius:9px;background:var(--navy);color:#fff;padding:11px 16px;font:700 13px inherit;cursor:pointer}.review-banner{text-align:center;background:#F7CA91;font-size:11px;font-weight:bold;padding:7px}.report-section{width:min(100% - 32px,1050px);margin:26px auto;padding:65px 68px;background:var(--off);border-radius:16px;box-shadow:0 8px 36px #15324512}.cover{min-height:690px;color:#fff;overflow:hidden;background:radial-gradient(circle at 80% 40%,#287F78 0%,#1F3556 44%,#152743 85%)}.cover-kicker{margin-top:115px;color:#91E6D2;font-size:13px;letter-spacing:.12em}.cover h1{font-size:clamp(36px,5vw,56px);line-height:1.4;letter-spacing:-.06em}.cover-sub{font-size:13px;letter-spacing:.16em;color:#D6E4F2}.cover-bottom{margin-top:120px;padding-top:32px;border-top:1px solid #7E99B2}.company span,.cover-details{display:block;color:#C1D0E2}.company strong{font-size:25px}.cover-details{display:flex;justify-content:space-between;margin-top:25px}.intro h2,.detail h2{font-size:30px;line-height:1.4}.intro-copy{font-size:15px}.intro-copy h3{color:#207B71;font-size:17px;margin:23px 0 3px}.intro-news-source,.source{font-size:11px;color:#60728A}.overview h2{font-size:35px;line-height:1.3}.overview h2 em{font-style:normal;color:#218D7B}.overview-main{display:grid;grid-template-columns:1fr 1fr;gap:18px}.overview-card,.finding{border:1px solid var(--line);border-radius:13px;background:#fff;overflow:hidden}.ov-head{padding:20px;background:#EDF8F5}.ov-head h3{margin:0;font-size:20px}.ov-list{padding:14px 18px}.ov-item{display:flex;justify-content:space-between;gap:9px;padding:15px 0;border-bottom:1px solid #E8EDF4}.ov-item:last-child{border:0}.ov-item b,.ov-item small{display:block}.ov-item small{font-size:12px;color:#657995}.ov-status,.tag{display:inline-block;align-self:flex-start;padding:3px 10px;border-radius:100px;font-size:11px;font-weight:750;background:#E6F7F2;color:#176F5C;white-space:nowrap}.ov-status.review,.finding.review .tag{background:#FFF2E6;color:#98501B}.attention,.action{background:#FFF2E6;border-radius:12px;padding:20px;margin-top:22px}.attention h3{margin:0}.attention li{margin:8px 0}.lead{color:#60728A}.illustration{background:#EAF6F3;border:1px solid #CBE9E0;border-radius:14px;padding:20px;margin:20px 0 28px}.illustration svg{width:100%;height:110px;fill:none;stroke:#2DBE9D;stroke-width:4}.finding{border-left:5px solid var(--green);padding:24px 28px;margin:22px 0;break-inside:avoid}.finding.review{border-left-color:var(--orange)}.finding h3{font-size:21px;margin:10px 0}.finding h4{font-size:14px;color:#187E73;margin:18px 0 5px}.evidence{background:var(--off);border-radius:8px;padding:14px 18px;margin:14px 0}.evidence ul{margin:0;padding-left:18px}.evidence p{margin:7px 0 0}.action h4{color:#9D541C;margin:0 0 5px}.action p{margin:0}.final-card,.final-note{background:#EAF6F3;border-radius:12px;padding:24px;margin:18px 0}.final-card{background:#FFF2E6}@media(max-width:800px){.nav-inner{flex-wrap:wrap}.nav-links{order:3;width:100%;justify-content:space-between}.report-section{width:calc(100% - 16px);padding:36px 22px;margin:12px auto}.cover{min-height:580px}.cover-kicker{margin-top:90px}.cover-bottom{margin-top:105px}.cover-details{flex-wrap:wrap;gap:12px}.overview-main{grid-template-columns:1fr}.finding{padding:18px}.ov-item{flex-direction:column}}@media print{@page{size:A4;margin:15mm 13mm}.topnav,.review-banner{display:none!important}html,body{background:#fff}.report-section{width:100%;margin:0;padding:10mm 0;box-shadow:none;border-radius:0}.cover{min-height:245mm;padding:16mm;break-after:page}.finding,.overview-card,.attention,.final-card,.final-note{break-inside:avoid}.cover-bottom{margin-top:75mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><nav class="topnav"><div class="nav-inner"><span class="brand">atLIB <small>WEB SECURITY REPORT</small></span><div class="nav-links"><a href="#overview">診断概要</a><a href="#https">Webサイト</a><a href="#email">メール</a><a href="#next-steps">確認事項</a></div><button class="print-button" aria-label="印刷またはPDFで保存" onclick="window.print()">▣ PDFで保存・印刷</button></div></nav><div class="review-banner">内部デザインレビュー用｜対外配布不可</div><section class="cover report-section"><div class="cover-kicker">公開情報から見える、会社のセキュリティ</div><h1>Webセキュリティ<br>診断レポート</h1><div class="cover-sub">PUBLIC WEBSITE &amp; EMAIL SECURITY REVIEW</div><div class="cover-bottom"><div class="company"><span>診断対象企業</span><strong>${html(company.name)}</strong></div><div class="cover-details"><span>${html(company.url)}</span><span>${html(date)}</span></div></div></section><section class="intro report-section"><h2>WebサイトのURLだけで、ここまで分かることをご存じですか？</h2><div class="intro-copy">${APPROVED_INTRO}</div></section><section class="overview report-section" id="overview"><h2>今回の診断で<br><em>分かったこと</em></h2><p>対象URL：${html(report.targetUrl)} ／ 診断日時：${html(report.checkedAt)}</p><div class="overview-main"><div class="overview-card"><div class="ov-head"><small>CHECK AREA</small><h3>Webサイト</h3></div><div class="ov-list">${summary([...groups.https,...groups.web]) || '<p>表示対象の結果はありません。</p>'}</div></div><div class="overview-card"><div class="ov-head"><small>CHECK AREA</small><h3>メール</h3></div><div class="ov-list">${summary(groups.email) || '<p>表示対象の結果はありません。</p>'}</div></div></div>${review.length ? `<div class="attention"><h3>今回、確認をおすすめすること</h3><ol>${review.map(f => `<li>${html(f.title)}</li>`).join('')}</ol></div>` : ''}</section>${detail('https','Webサイトの通信を守る仕組み','暗号化通信と証明書について、今回の確認結果をご案内します。',groups.https)}${detail('web','Webサイトの表示・動作を守る設定','公開されている設定から、管理担当者への確認をおすすめする内容です。',groups.web)}${detail('email','自社を装った偽メールへの対策','対象メールドメインの公開DNS設定に基づく説明です。',groups.email)}<section class="detail report-section" id="next-steps"><h2>次に確認しておくとよいこと</h2><p class="lead">管理担当者や保守会社へ、以下の内容を確認する際にお役立てください。</p>${review.map(f => `<div class="final-card"><h3>${html(f.title)}</h3><p>${html(f.nextAction)}</p></div>`).join('')}<div class="final-note"><b>診断の範囲について</b><p>本診断はインターネット上に公開されているWebサイトやメールの設定を確認したものであり、企業全体のセキュリティ対策や安全性を評価するものではありません。</p><p>「追加確認推奨」は管理担当者や保守会社への確認をおすすめするものであり、atLIBによる追加調査を約束するものではありません。</p><p>ルール版：${html(report.ruleVersion)} ／ 解説版：${html(report.contentVersion)}</p></div></section></body></html>`;
}

// The assets are embedded as data URLs after the common template is rendered so
// a generated HTML file remains self-contained for local viewing and printing.
const baseRender = render;
render = (report, company) => {
  const cover = embeddedAsset('wsc-cover-network.jpg', 'image/jpeg');
  return baseRender(report, company).replace('</style>', `.fv-icon{width:32px;height:32px;object-fit:contain;flex:none}.ov-item{align-items:flex-start}.cover{background-image:linear-gradient(90deg,#152743e8,#1F3556bf 48%,#287F7866),url('${cover}')!important;background-size:cover!important;background-position:center!important}@media print{.report-section:not(.cover){break-before:page;page-break-before:always}.cover{break-before:auto;page-break-before:auto;background-position:center!important}.overview{padding:4mm 0!important}.overview h2{font-size:23pt;margin:0 0 2mm}.overview>p{font-size:9pt;margin:0 0 3mm}.overview-main{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr)!important;gap:5mm!important}.overview-card{min-width:0;break-inside:auto;page-break-inside:auto}.ov-head{padding:3mm}.ov-head h3{font-size:13pt}.ov-list{padding:1mm 3mm}.ov-item{min-width:0;overflow-wrap:anywhere;padding:2mm 0;gap:2mm}.ov-item b{font-size:9.5pt;line-height:1.35}.ov-item small{font-size:7.5pt;line-height:1.3}.ov-status{font-size:7pt;padding:1px 5px}.fv-icon{width:6mm;height:6mm}.ov-item b,.ov-item small,.value,.raw{overflow-wrap:anywhere;word-break:break-word}.attention{break-inside:avoid;page-break-inside:avoid;margin-top:3mm;padding:3mm 4mm}.attention h3{font-size:12pt}.attention li{font-size:9pt;margin:1mm 0}.intro-copy{font-size:10.5pt;line-height:1.55}.intro-copy h3,.detail h2,.finding h3,.finding h4{break-after:avoid;page-break-after:avoid}.finding{break-inside:avoid;page-break-inside:avoid;padding:3mm 4mm;margin:3mm 0}.finding+.finding{break-inside:auto;page-break-inside:auto;padding-bottom:2mm}.finding.long{break-inside:avoid!important;page-break-inside:avoid!important}.finding+.finding .source{font-size:6.5pt;margin:0!important}.finding h3{font-size:13pt;margin:2mm 0}.finding h4{font-size:9pt;margin:2mm 0 1mm}.finding p{font-size:9.5pt;line-height:1.5;margin:0 0 1.5mm}.tag{font-size:7pt;padding:1px 5px}.evidence{padding:2.5mm 3mm;margin:2mm 0}.evidence li{font-size:8.5pt;line-height:1.4}.action{padding:2.5mm 3mm;margin-top:2mm}.source{font-size:7pt}.report-section{overflow:visible!important}.detail{padding:5mm 0!important}.detail h2{margin-top:0;font-size:20pt}.lead{font-size:9.5pt;margin:0 0 3mm}.cover-bottom{margin-top:75mm}}</style>`);
};

const assetDecoratedRender = render;
render = (report, company) => {
  const originalName = text(company?.name) || '';
  const coverName = /御中\s*$/u.test(originalName) ? originalName.trimEnd() : `${originalName} 御中`;
  return assetDecoratedRender(report, company)
    .replace(`<strong>${html(originalName)}</strong>`, `<strong>${html(coverName)}</strong>`)
    .replace(`<span>${html(company.url)}</span><span>`, `<span>調査対象URL：${html(company.url)}</span><span>`);
};

// The customer-facing report deliberately exposes only the approved result and
// impact copy. Raw evidence, rule IDs, and technical references remain in the
// evaluated report object for internal use, but are not rendered into this HTML.
const customerFacingRender = render;
render = (report, company) => {
  const findingById = new Map(report.findings.map((finding) => [finding.id, finding]));
  const category = (id) => id.startsWith('TLS') ? 'TLS' : id.startsWith('HSTS') ? 'HSTS' : id.startsWith('CSP') ? 'CSP' : id.startsWith('FRAME') ? 'FRAME' : id.startsWith('NOSNIFF') ? 'NOSNIFF' : id.startsWith('SPF') ? 'SPF' : 'DMARC';
  const paragraphs = (items) => (items || []).map((item) => `<p>${html(item)}</p>`).join('');
  const status = (finding) => {
    const review = finding.status === '追加確認推奨';
    return `<span class="tag${review ? ' review' : ''}">${review ? '<span class="warning-icon" aria-hidden="true">⚠</span>' : ''}${html(finding.status)}</span>`;
  };
  const customerFinding = (finding) => { const key = category(finding.id); const protection = PROTECTION_COPY[key] || []; const impact = IMPACT_DETAIL_COPY[key] || [IMPACT_COPY[finding.id] || finding.knowledge]; const long = protection.length + impact.length >= 6; return `<article class="finding${finding.status === '追加確認推奨' ? ' review' : ''}${long ? ' long' : ''}">${status(finding)}<h3>${html(finding.title)}</h3><h4>今回の診断結果</h4><p>${html(finding.observation)}</p><h4>どのような対策なのか</h4>${paragraphs(protection)}<h4>対策が不十分だと、どうなるのか</h4>${paragraphs(impact)}</article>`; };
  const closing = `<section class="detail report-section" id="next-steps"><h2>診断結果を、これからの対策につなげるために</h2><p>今回の診断では、Webサイトやメールに関する公開設定を確認しました。</p><p>「追加確認推奨」となった項目については、現在の管理状況や他の対策の有無も含め、Webサイトの制作会社、保守会社、メール管理担当者などに確認することをおすすめします。</p><p>セキュリティ対策は、自社だけの問題ではありません。</p><p>自社のWebサイトやメールが悪用されれば、お客様や取引先にも被害が及び、信用問題や取引関係への影響につながりかねません。</p><p>今回の結果を、必要な対策を見直すきっかけとしてお役立てください。</p><div class="final-note"><b>診断の範囲について</b><p>本診断はインターネット上に公開されているWebサイトやメールの設定を確認したものであり、企業全体のセキュリティ対策や安全性を評価するものではありません。</p><p>「追加確認推奨」は管理担当者や保守会社への確認をおすすめするものであり、atLIBによる追加調査を約束するものではありません。</p></div></section>`;
  return customerFacingRender(report, company)
    .replace(/<div class="ov-item">([\s\S]*?)<small>[\s\S]*?<\/small>/g, '<div class="ov-item">$1')
    .replace(/<span class="ov-status review">/g, '<span class="ov-status review"><span class="warning-icon" aria-hidden="true">⚠</span>')
    .replace(/<article class="finding[^>]*data-finding-id="([^"]+)"[^>]*>[\s\S]*?<\/article>/g, (original, id) => {
      const finding = findingById.get(id);
      return finding ? customerFinding(finding) : original;
    })
    .replace(/<section class="detail report-section" id="next-steps">[\s\S]*?<\/section><\/body>/, `${closing}</body>`)
    .replace('</style>', '.warning-icon{color:#D39A00;font-size:1.05em;margin-right:3px}body{font-family:"Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif!important}</style>');
};

function main() {
  const [inputPath, companyPath, outputPath, resultPath] = process.argv.slice(2);
  if (!inputPath || !companyPath || !outputPath) throw new Error('使い方: node engine.mjs input.json company.json output.html');
  const root = path.dirname(fileURLToPath(import.meta.url));
  const report = evaluate(read(inputPath), { rulesPath: path.join(root, 'rules.json'), explanationsPath: path.join(root, 'explanations.json') });
  fs.writeFileSync(outputPath, render(report, read(companyPath)), 'utf8');
  if (resultPath) fs.writeFileSync(resultPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ findingIds: report.findings.map(f => f.id), internalOnly: report.internalOnly }, null, 2));
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
