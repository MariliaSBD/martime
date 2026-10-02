# Lists translation keys used in src/ that are missing from pt-PT.json
import json, re, pathlib
pt = json.load(open('src/i18n/pt-PT.json'))
def has(d, k):
    for p in k.split('.'):
        if not isinstance(d, dict) or p not in d: return False
        d = d[p]
    return True
def has_plural(d, k):
    return has(d, k + '_one') or has(d, k + '_other')
keys = set()
for f in pathlib.Path('src').rglob('*.ts*'):
    for m in re.finditer(r"\bt\(\s*'([a-zA-Z0-9_.]+)'", f.read_text()):
        keys.add(m.group(1))
missing = sorted(k for k in keys if not has(pt, k) and not has_plural(pt, k))
print('\n'.join(missing))
