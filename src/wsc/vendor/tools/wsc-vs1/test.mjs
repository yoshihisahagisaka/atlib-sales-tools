import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { APPROVED_INTRO, assertUrlMatch, evaluate, render } from './engine.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
const json = (name) => JSON.parse(fs.readFileSync(path.join(root, 'fixtures', name), 'utf8').replace(/^\uFEFF/, ''));
const opts = { rulesPath: path.join(root, 'rules.json'), explanationsPath: path.join(root, 'explanations.json') };
const ids = (input) => evaluate(input, opts).findings.map(f => f.id);
const expected = JSON.parse(fs.readFileSync(path.join(root, 'expected-atlib.json'), 'utf8'));
assert.deepEqual(ids(json('atlib-security-check-v2.json')), expected.expectedFindingIds, 'atLIB regression');
assert.deepEqual(ids(json('synthetic-protected.json')), ['TLS_VALID','HSTS_ENABLED','CSP_HEADER_PRESENT','NOSNIFF_ENABLED','SPF_PRESENT','DMARC_ENFORCING'], 'protected synthetic');
assert.deepEqual(ids(json('synthetic-gaps.json')), ['TLS_INVALID','HSTS_DISABLED','CSP_HEADER_ABSENT','FRAME_HEADER_ABSENT','DMARC_ABSENT'], 'gap synthetic');
const unavailable = evaluate(json('synthetic-unavailable.json'), opts);
assert.equal(unavailable.findings.length, 0, 'failure never becomes a user finding');
assert.ok(unavailable.internalOnly.length >= 4, 'failure retained internally');
const company = {name:'<企業 & 会社>', headOffice:'A & B', url:'https://example-gaps.test/?x=<tag>'};
const first = render(evaluate(json('synthetic-gaps.json'), opts), company);
const second = render(evaluate(json('synthetic-gaps.json'), opts), company);
assert.equal(first, second, 'same input produces byte-identical HTML');
assert.ok(first.includes('&lt;企業 &amp; 会社&gt;') && !first.includes('<企業 & 会社>'), 'HTML escaping');
assert.ok(first.includes('<strong>&lt;企業 &amp; 会社&gt; 御中</strong>'), 'cover adds recipient suffix without changing source name');
assert.ok(first.includes('調査対象URL：https://example-gaps.test/?x=&lt;tag&gt;'), 'cover labels company URL');
assert.equal(company.name, '<企業 & 会社>', 'source company name remains unchanged');
const alreadyRecipient = render(evaluate(json('synthetic-gaps.json'), opts), { name:'既に御中 御中', url:'https://example-gaps.test/?x=<tag>' });
assert.ok(alreadyRecipient.includes('<strong>既に御中 御中</strong>') && !alreadyRecipient.includes('<strong>既に御中 御中 御中</strong>'), 'cover does not duplicate recipient suffix');
assert.ok(first.includes('WebサイトのURLだけで、ここまで分かることをご存じですか？'), 'v7 introduction title');
assert.equal(APPROVED_INTRO, fs.readFileSync(path.join(root, 'approved-introduction-v7.html'), 'utf8').replace(/\r\n/g, '\n').trimEnd(), 'v7 approved introduction is exact');
assert.match(first, /@media print/, 'print stylesheet is included');
assert.match(first, /window\.print\(\)/, 'browser print control is included');
assert.match(first, /\.report-section:not\(\.cover\)\{break-before:page/, 'print section starts');
assert.match(first, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\)!important/, 'print overview two columns');
assert.match(first, /\.finding\{break-inside:avoid/, 'print card protection');
assert.match(first, /PUBLIC WEBSITE &amp; EMAIL SECURITY REVIEW/, 'v7 cover is included');
for (const approved of ['通信の暗号化ができています','暗号化通信を継続する設定があります','ファイルの誤った取り扱いを抑える設定があります','プログラムの読み込み制限について確認をおすすめします','他サイトへの画面表示の制限について確認をおすすめします','メールの送信元を示す設定があります','偽メールの隔離・拒否を求める設定にはなっていません']) assert.ok(render(evaluate(json('atlib-security-check-v2.json'), opts), json('atlib-company.json')).includes(approved), `approved atLIB FV: ${approved}`);
const protectedCompany = {name:'別企業', headOffice:'大阪府大阪市', url:'https://example-protected.test/'};
const protectedHtml = render(evaluate(json('synthetic-protected.json'), opts), protectedCompany);
const noAddressHtml = render(evaluate(json('synthetic-protected.json'), opts), { name:'所在地なし検証', url:'https://example-protected.test/' });
assert.ok(!noAddressHtml.includes('本店所在地'), 'head office is not rendered and is not required');
assert.ok(protectedHtml.includes('認証に失敗したメールへの対応方針が公開されています。'), 'unapproved FV IDs retain fixed observation');
assert.ok(!protectedHtml.includes('偽メールの隔離・拒否を求める設定にはなっていません'), 'absent finding is not rendered');
assert.ok(!protectedHtml.includes('<svg'), 'detail SVG illustrations removed');
assert.match(protectedHtml, /data:image\/png;base64,/, 'FV icons embedded');
assert.match(protectedHtml, /data:image\/jpeg;base64,/, 'cover image embedded');
const atlibReport = evaluate(json('atlib-security-check-v2.json'), opts);
const atlibHtml = render(atlibReport, json('atlib-company.json'));
for (const approvedCopy of [
  'Webサイトのアドレスが「https://」で始まっているのを見たことがあると思います。これは、Webサイトと利用者の間でやり取りする情報を暗号化し、第三者に盗み見られたり、途中で書き換えられたりすることを防ぐための仕組みです。',
  'HSTSは、ブラウザに対して、次回以降も暗号化されたHTTPS通信を使うよう指示する仕組みです。暗号化されていない通信へ戻ってしまう危険を減らします。',
  'CSPは、こうしたプログラムをどこから読み込んでよいかなどを制限する仕組みです。万が一、不正なプログラムが入り込んだ場合でも、勝手な動作や情報の持ち出しを抑えるために役立ちます。',
  '画面埋め込み制御は、自社のWebページが他のサイト内に勝手に組み込まれることを制限する仕組みです。悪意のあるサイトに自社の画面を利用され、利用者が気づかないうちに意図しない操作をさせられる攻撃を防ぐために役立ちます。',
  'NOSNIFFは、ブラウザがファイルの種類を勝手に判断して、想定外の方法で扱うことを防ぐための仕組みです。',
  'SPFは、その会社のドメインからメールを送信してよいサーバーをあらかじめ登録しておく仕組みです。受信側が送信元を確認する際の手がかりになり、なりすましメールを見分けるために役立ちます。',
  'DMARCは、自社を装ったメールが認証に失敗した場合、受信側に対して隔離や拒否などの対応方針を伝える仕組みです。自社の名前を悪用した偽メールが取引先などに届く危険を減らすために役立ちます。'
]) assert.ok(atlibHtml.includes(approvedCopy), `approved customer copy: ${approvedCopy}`);
assert.match(atlibHtml, /どのような対策なのか/, 'protection explanation heading');
assert.match(atlibHtml, /対策が不十分だと、どうなるのか/, 'customer impact heading');
assert.match(atlibHtml, /warning-icon/, 'review findings use the warning triangle');
assert.ok(!atlibHtml.includes('原値：') && !atlibHtml.includes('RFC 8446') && !atlibHtml.includes('MDN CSP'), 'customer HTML excludes raw values and technical references');
assert.ok(!atlibHtml.includes('data-finding-id') && !atlibHtml.includes('ルール版：'), 'customer HTML excludes internal identifiers and versions');
assert.ok(atlibReport.findings.find((finding) => finding.id === 'TLS_VALID').details.some((detail) => detail.raw === 'Tls13'), 'raw protocol remains in the internal report');
assert.match(atlibHtml, /診断結果を、これからの対策につなげるために/, 'approved customer closing');
assert.equal(assertUrlMatch('https://EXAMPLE.test:443/', 'https://example.test/'), 'https://example.test/', 'presentation-only URL difference');
assert.throws(() => assertUrlMatch('https://example.test/', 'https://www.example.test/'), /一致しない/, 'different host rejected');
assert.throws(() => assertUrlMatch('http://example.test/', 'https://example.test/'), /一致しない/, 'redirect is not assumed');
console.log('WSC VS1 tests: PASS');
