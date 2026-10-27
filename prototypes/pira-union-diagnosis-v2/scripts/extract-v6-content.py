from pathlib import Path
import re,json,hashlib
p=Path(__file__).resolve().parents[1]
original=(p/'spec/PIRA_knowledge_first_spec_v6_approved.md').read_text(encoding='utf8')
spec=(p/'spec/PIRA_knowledge_first_spec_v6_approved.md').read_text(encoding='utf8')
questions=[]
qpart=original.split('## 汎用8問と回答選択肢')[1].split('## C方式')[0]
rows={}
for line in original.splitlines():
    if re.match(r'^\| T\d\d_A\d \|',line):
        cols=[x.strip() for x in line.strip('|').split('|')]
        rows[cols[0]]=dict(id=cols[0],label=cols[1],state=cols[2],intro=cols[3],check=cols[4])
commonpart=original.split('## 共通解説・固定原稿')[1].split('## 回答別導入')[0]
themes={m.group(1):dict(id=m.group(1),title=m.group(2).strip(),common=m.group(3).strip()) for m in re.finditer(r'### (T\d\d) ([^\n]+)\n(.*?)(?=\n### |\Z)',commonpart,re.S)}
for line in qpart.splitlines():
    if not re.match(r'^\| T\d\d \|',line):continue
    cols=[x.strip() for x in line.strip('|').split('|')]
    options=[rows[cols[0]+'_A'+str(i+1)] for i in range(len(cols[2].split('／')))]
    assert [x['label'] for x in options]==cols[2].split('／')
    questions.append(dict(id=cols[0],text=cols[1],options=options))
summary={}
for line in original.splitlines():
    if re.match(r'^\| S[123] \|',line):
        cols=[x.strip() for x in line.strip('|').split('|')];summary[cols[0]]=cols[2]
first=original.split('## 確定済み実務資料5種類｜紹介文（統括レーンで承認済み）')[1].split('## 05の掲載方法')[0]
second=original.split('## 確定済み実務資料5種類｜紹介文（統括レーンで承認済み）')[2].split('## 03 固定総括')[0]
assert first.strip()==second.strip()
materials=[]
ids=['MAIL','ACCOUNT','INCIDENT','EDUCATION','CALENDAR']
for i,m in enumerate(re.finditer(r'### ([①②③④⑤]) ([^\n]+)\n(.*?)(?=\n### |\Z)',first,re.S)):
    materials.append(dict(id=ids[i],title=m.group(2).strip(),description=m.group(3).strip()))
dns=(p/'DECISION_ENTERPRISE_DNS_EDUCATION_20261021.md').read_text(encoding='utf8').split('### 危険なサイトへの接続を防ぐ仕組み\n')[1].split('## 表示仕様')[0].strip()
# Markdown strong markers are presentation only. Text is otherwise byte-for-byte.
dns=re.sub(r'\*\*(.*?)\*\*',r'\1',dns)
contact=dict(title='情報セキュリティについて相談したい方へ',paragraphs=['今回の解説を読んで、自社の対策について確認したいことや、改善を検討したいことがありましたら、atLIBにご相談ください。','実際の業務環境や現在の対策を確認したうえで、必要な対応を一緒に整理します。'],label='相談する（任意）')
obj=dict(versions=dict(answer='PIRA-A-6.0.0',rule='PIRA-CSELECT-6.0.0',content='PIRA-KNOWLEDGE-6.0.0',report='PIRA-REPORT-6.0.0',renderer='PIRA-HTMLPDF-6.0.0'),sourceSha256='0d33e2f5cc48a811b1b598c1787796e2d4222babdac54a5710cae8b492234514',amendedSha256=hashlib.sha256(spec.encode()).hexdigest(),questions=questions,themes=themes,summary=summary,materials=materials,dns=dict(title='危険なサイトへの接続を防ぐ仕組み',paragraphs=dns.split('\n\n')),contact=contact,order=['T06','T02','T08','T04','T03','T01','T05','T07'])
assert len(questions)==8 and len(rows)==38 and len(themes)==8 and len(materials)==5
(p/'v6-content.js').write_text("(function(r,f){if(typeof module==='object'&&module.exports)module.exports=f();else r.PiraV6Content=f();})(globalThis,function(){return "+json.dumps(obj,ensure_ascii=False,indent=2)+";});\n",encoding='utf8')
print('Extracted exact approved 8 questions / 38 answers / 8 common texts / 5 complete material descriptions.')
