"""Compose already-rendered PDF QA pages; no diagnosis logic."""
from pathlib import Path
from PIL import Image, ImageOps, ImageDraw

out = Path(__file__).resolve().parents[1] / 'evidence'
groups = [('workforce-print-final', 'workforce'), ('purchasing-final', 'purchasing'), ('membership-final', 'membership')]
sheet = Image.new('RGB', (1800, 1935), '#dfe5ec')
draw = ImageDraw.Draw(sheet)
for row, (prefix, title) in enumerate(groups):
    for col, file in enumerate([out / (prefix + '-' + str(i) + '.png') for i in range(1, 5)]):
        im = Image.open(file).convert('RGB')
        im.thumbnail((432, 610))
        x, y = 9 + col * 450, 26 + row * 645
        sheet.paste(im, (x, y))
        draw.text((x, y - 18), f'{title} / page {col + 1}', fill='#233348')
sheet.save(out / 'print-qa-contact.jpg', quality=88)
