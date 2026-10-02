# Merges translation pairs into src/i18n/pt-PT.json and en.json.
# Usage: python3 scripts/i18n.py <file.json> where the file holds {"key.path": ["pt", "en"], ...}
import json, sys
def load(p):
    try: return json.load(open(p, encoding='utf-8'))
    except FileNotFoundError: return {}
def setp(d, path, v):
    ks = path.split('.')
    for k in ks[:-1]: d = d.setdefault(k, {})
    d[ks[-1]] = v
pairs = json.load(open(sys.argv[1], encoding='utf-8'))
pt = load('src/i18n/pt-PT.json'); en = load('src/i18n/en.json')
for k, (a, b) in pairs.items():
    setp(pt, k, a); setp(en, k, b)
for p, d in (('src/i18n/pt-PT.json', pt), ('src/i18n/en.json', en)):
    json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=2); open(p, 'a').write('\n')
print(len(pairs), 'keys merged')
