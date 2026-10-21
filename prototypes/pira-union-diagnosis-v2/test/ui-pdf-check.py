"""Compare printed report text with PR16's original evidence; UI must not change content."""
from pathlib import Path
from pypdf import PdfReader
import hashlib, json

root=Path(__file__).resolve().parents[1]
out=root/'evidence'/'ui-20261019'
results=[]
for name in ['workforce','purchasing','membership']:
    original=PdfReader(root/'evidence'/(name+'-report.pdf'))
    current=PdfReader(out/'regression'/(name+'-report.pdf'))
    original_text=[p.extract_text() for p in original.pages]
    current_text=[p.extract_text() for p in current.pages]
    assert current_text==original_text, name+' printed content changed'
    assert len(current.pages)==4
    assert all(abs(float(p.mediabox.width)-595.28)<2 and abs(float(p.mediabox.height)-841.89)<2 for p in current.pages)
    results.append({'file':name+'-report.pdf','pages':4,'a4':True,'originalTextExactMatch':True,'textSha256':hashlib.sha256('\n'.join(current_text).encode()).hexdigest(),'status':'PASS'})
(out/'pdf-results.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print(json.dumps(results,indent=2))
