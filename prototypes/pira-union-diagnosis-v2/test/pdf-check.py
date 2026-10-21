"""Read-only PDF QA. Uses browser-generated PDFs; does not provide a PDF service."""
import json
from pathlib import Path
from pypdf import PdfReader

root = Path(__file__).resolve().parents[1]
checks = []
for kind in ['workforce', 'purchasing', 'membership']:
    target = root / 'evidence' / (kind + '-report.pdf')
    reader = PdfReader(target)
    assert len(reader.pages) == 4, 'Expected four pages including all six sections'
    texts = [page.extract_text() or '' for page in reader.pages]
    text = ''.join(texts)
    compact = ''.join(text.split())
    required = ['最近の事故・統計', '組合の業務と重要情報', '現在の情報管理状況',
                '優先して確認したいテーマ', '実務チェックリスト', '次の取り組み',
                'npa.go.jp', 'saiyou.metro.tokyo.lg.jp', 'web.pref.hyogo.lg.jp',
                'PIRA-C-20261018.1', '9,086', '600', '226', '公表', '担当']
    missing = [value for value in required if value not in compact]
    assert not missing, (target.name, missing)
    assert all(len(t.strip()) > 80 for t in texts), 'Blank or near-blank PDF page'
    assert all(abs(float(p.mediabox.width) - 595.28) < 2 and abs(float(p.mediabox.height) - 841.89) < 2 for p in reader.pages), 'Not A4'
    checks.append({'file':target.name, 'pages':len(reader.pages), 'pageTextLengths':[len(t) for t in texts],
                   'sixSections':True, 'officialUrls':True, 'contentVersion':True, 'countDefinitions':True,
                   'a4':True, 'blankPages':False, 'status':'PASS'})
(root / 'evidence' / 'pdf-results.json').write_text(json.dumps(checks, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(checks, ensure_ascii=True, indent=2))
