from pathlib import Path
import json,re
from pypdf import PdfReader
p=Path(__file__).resolve().parents[1]/'evidence/phase3-20261021'
results=[]
norm=lambda s:re.sub(r'\s+','',s)
for id in ['F01','F02','F03','F04','F05','F06']:
    reader=PdfReader(p/(id+'.pdf'));model=json.loads((p/(id+'-report.json')).read_text(encoding='utf8'))
    texts=[x.extract_text() for x in reader.pages]
    joined=norm(''.join(re.sub(r'atLIB \| \d+ / \d+','',t) for t in texts))
    expected=model['title']+model['intro']+model['disclaimer']+''.join(str(i+1).zfill(2)+s['title']+''.join(b['text'] for b in s['blocks']) for i,s in enumerate(model['sections']))+model['versionText']
    assert joined==norm(expected),(id,'complete PDF body differs')
    for s in model['sections']:
        assert norm(s['title']) in joined,(id,s['title'])
        for b in s['blocks']:assert norm(b['text']) in joined,(id,b['id'])
    assert norm(model['versionText']) in joined,id
    assert norm(model['intro']) in joined and norm(model['disclaimer']) in joined
    for page in reader.pages:assert abs(float(page.mediabox.width)-595.28)<.1 and abs(float(page.mediabox.height)-841.89)<.1
    # Extract every text span and check it remains inside printable area (footer excepted).
    positions=[]
    for page in reader.pages:
        def visit(text,cm,tm,font,size):
            if text.strip():positions.append((text,tm[4],tm[5],size))
        page.extract_text(visitor_text=visit)
    assert all(20<=y<=800 for text,x,y,size in positions),(id,'text bounds')
    results.append(dict(case=id,pages=len(reader.pages),bodyAndVersion='EXACT_BLOCK_MATCH',searchableJapanese=True,pageSize='A4',textBounds='PASS'))
(p/'pdf-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(results,ensure_ascii=False,indent=2))
