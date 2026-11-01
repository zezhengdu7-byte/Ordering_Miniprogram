"""Compress generated originals into mini-program assets; requires macOS sips."""
import json
import pathlib
import subprocess

root = pathlib.Path(__file__).resolve().parents[1]
manifest = json.loads((root / 'scripts/generated-images.json').read_text())
out = root / 'miniprogram/assets/menu'
for item in manifest:
    target = out / (item['id'] + '-menu.jpg')
    subprocess.run(['sips', '-s', 'format', 'jpeg', '-s', 'formatOptions', '35',
                    '-Z', '320', item['source'], '--out', str(target)],
                   check=True, capture_output=True)
print(f'Prepared {len(manifest)} menu images')
print(f'Menu assets: {sum(p.stat().st_size for p in out.glob("*.jpg")) / 1024:.0f} KiB')
