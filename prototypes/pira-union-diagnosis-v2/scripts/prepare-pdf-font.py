"""Development-only: python scripts/prepare-pdf-font.py PATH_TO_NOTO_SANS_JP_VF_TTF.

Requires fonttools. Never runs in the end-user app. Keep the upstream OFL with outputs.
"""
from pathlib import Path
import sys,json,base64
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

root=Path(__file__).resolve().parents[1]
source=Path(sys.argv[1]);font=instantiateVariableFont(TTFont(source),{'wght':400},inplace=True)
text=''.join(p.read_text(encoding='utf8') for p in root.glob('*.js'))+''.join(chr(i) for i in range(32,127))
options=subset.Options();options.name_IDs=['*'];selector=subset.Subsetter(options=options);selector.populate(text=text);selector.subset(font)
target=root/'vendor/PiraNotoSansJP.ttf';font.save(target)
widths={};mapping=bytearray(65536*2);upm=font['head'].unitsPerEm
for cp,glyph in font.getBestCmap().items():
    if cp<65536:
        mapping[cp*2:cp*2+2]=font.getGlyphID(glyph).to_bytes(2,'big');widths[cp]=round(font['hmtx'][glyph][0]/upm*1000)
data=dict(data=base64.b64encode(target.read_bytes()).decode(),cidMap=base64.b64encode(mapping).decode(),widths=widths,bbox=[-1000,-1048,2928,1808])
(root/'vendor/pdf-font.js').write_text('globalThis.PiraPdfFont='+json.dumps(data,separators=(',',':'))+';\n',encoding='utf8')
print('Regenerated PDF font. Run diagnosis, browser and PDF checks before committing.')
