from pathlib import Path
import json,re
from pypdf import PdfReader
p=Path(__file__).resolve().parents[1]/'evidence/v6-20261025'
norm=lambda s:re.sub(r'\s+','',s)
results=[]
for f in sorted(p.glob('*.pdf')):
    model=json.loads(f.with_suffix('.json').read_text(encoding='utf8'))
    r=PdfReader(f);text=''.join(re.sub(r'atLIB \| \d+ / \d+','',page.extract_text()) for page in r.pages)
    expected=model['title']+model['intro']+model['disclaimer']+''.join(str(i+1).zfill(2)+s['title']+''.join(b['text'] for b in s['blocks']) for i,s in enumerate(model['sections']))+''.join(s['title']+''.join(b['text'] for b in s['blocks']) for s in model['supplements'])+model['versionText']
    assert norm(text)==norm(expected),(f.name,'complete text parity')
    assert 'DNSFilter' not in text
    if model['audience']=='PIRA_UNION':assert 'Secure Guard' not in text and '相談する' not in text
    else:assert 'atLIB Secure Guard' in text and '相談する（任意）' in text
    for page in r.pages:
        assert abs(float(page.mediabox.width)-595.28)<.1
        def visit(t,cm,tm,font,size):
            if t.strip():assert 20<=tm[5]<=800,(f.name,t,tm)
        page.extract_text(visitor_text=visit)
    results.append(dict(file=f.name,pages=len(r.pages),fullBodyAndVersions='EXACT_MATCH',audience=model['audience']))
assert len(results)==27
(p/'pdf-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(dict(pdfs=len(results),pages=sum(r['pages'] for r in results),passed=len(results)),indent=2))
