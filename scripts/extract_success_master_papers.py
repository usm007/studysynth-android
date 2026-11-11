import re, json, os, csv
import fitz

PDF = r'C:\Users\Admin\Downloads\CTET Success Master Social Science and Studies Paper-2 (Class 6-8).pdf'
OUT_JSON = r'C:\Users\Admin\Desktop\NET Ed\output\ctet_success_master_all.json'
OUT_CSV  = r'C:\Users\Admin\Desktop\NET Ed\output\ctet_success_master_all.csv'

BOOK = 'CTET Success Master Social Science and Studies Paper-2 (Class 6-8)'
doc = fitz.open(PDF)

HEADER_PATTERNS = [
    r'^\s*CTET\s+\d{4}.*SOLVED\s*PAPER',
    r'^\s*SOLVED\s+PAPER\s+\d{4}',
    r'^\s*Central\s*Teacher',
    r'^\s*CTET\s+SUCCESS\s+MASTER',
    r'^\s*SUCCESS\s+MASTER',
    r'^\s*SOLVED\s*$',
    r'^\s*PAPER\s*$',
    r'^\s*\d{1,3}\s*$',
    r'^\s*PART\s+(I|II|III|IV)\b',
    r'^\s*Directions\s*\(Q',
    r'^\s*This\s+[Qq]uestion\s+paper',
    r'^\s*Each\s+question\s+carries',
    r'^\s*This\s+paper\s+has',
    r'^\s*CTET\s*$',
    r'^\s*SUCCESS\s+MASTER\s*$',
    r'^\s*\d{1,2}\s+[A-Z]{2,}',
]
HEADER_RE = [re.compile(p) for p in HEADER_PATTERNS]

SKIP_STEM_PREFIX = (
    'this question paper', 'each question carries', 'this paper has',
    'directions', 'part i', 'part ii',
)


def is_header(line):
    return any(r.search(line) for r in HEADER_RE)


def block_lines(block_text):
    return [ln for ln in block_text.splitlines() if ln.strip()]


def page_text(page):
    """Return reading-order text using text blocks and column detection."""
    blocks = page.get_text('blocks')
    if not blocks:
        return ''
    width = page.rect.width
    mid = width / 2
    left = [b for b in blocks if b[0] < mid - 4]
    right = [b for b in blocks if b[0] >= mid - 4]
    lanes = [left] if len(right) < 3 else [left, right]

    out = []
    for lane in lanes:
        for b in sorted(lane, key=lambda b: b[1]):
            for ln in block_lines(b[4]):
                if is_header(ln):
                    continue
                out.append(ln)
    return '\n'.join(out)


def norm_ws(s):
    s = s.replace('\u2019', "'").replace('\u2018', "'")
    s = s.replace('\u201c', '"').replace('\u201d', '"')
    s = s.replace('\xad', '')
    s = re.sub(r'\((l|I)\)', '(1)', s)
    s = re.sub(r'[ \t]+', ' ', s)
    s = re.sub(r'\s*\n\s*', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    # cut off content from the following Hindi section
    s = re.split(r'\s*(?:PART\s+IV\b|Language\s+II\s*\[?\s*Hindi)', s)[0].strip()
    return s


def parse_options(block):
    idx = block.find('(1)')
    if idx == -1:
        return block.strip(), ['', '', '', '']
    stem = block[:idx].strip()
    body = block[idx:]
    found = {}
    cur = 0
    for k in (1, 2, 3, 4):
        m = re.search(r'\(' + str(k) + r'\)', body[cur:])
        if not m:
            break
        found[k] = cur + m.start()
        cur = cur + m.end()
    if len(found) < 2:
        return stem, ['', '', '', '']
    opts = ['', '', '', '']
    keys = sorted(found)
    for i, k in enumerate(keys):
        start = found[k] + 3
        end = found[keys[i + 1]] if i + 1 < len(keys) else len(body)
        opts[k - 1] = body[start:end].strip()
    return stem, opts


def parse_questions(texts):
    text = '\n'.join(texts)
    matches = list(re.finditer(r'(?m)^\s*(\d{1,3})\.\s', text))
    out = []
    for i, m in enumerate(matches):
        qno = int(m.group(1))
        end = matches[i + 1].start() if i + 1 < len(matches) else len(text)
        block = text[m.end():end]
        stem, opts = parse_options(block)
        stem = norm_ws(stem)
        lb = stem.lower()
        if not stem or any(lb.startswith(p) for p in SKIP_STEM_PREFIX):
            continue
        out.append({'qno': qno, 'stem': stem, 'options': [norm_ws(o) for o in opts]})
    return out


def parse_key(text):
    d = {}
    for m in re.finditer(r'\b(\d{1,3})\s*\(\s*([1-4])\s*\)', text):
        q = int(m.group(1))
        if q not in d:
            d[q] = int(m.group(2))
    return d


def parse_explanations(texts):
    d = {}
    letters = {'a': 1, 'b': 2, 'c': 3, 'd': 4}
    for t in texts:
        for m in re.finditer(r'\b(\d{1,3})\.\s*\(\s*([1-4a-dA-D])\s*\)', t):
            q = int(m.group(1))
            tok = m.group(2).lower()
            val = int(tok) if tok.isdigit() else letters[tok]
            if 1 <= q <= 150 and q not in d:
                d[q] = val
    return d


PAPERS = [
    ('CTET 2019 Dec Paper II', list(range(7, 18)), [18], 'key'),
    ('CTET 2019 Jul Paper II', list(range(25, 36)), [36], 'key'),
    ('CTET 2018 Dec Paper II', list(range(43, 52)), list(range(52, 57)), 'expl'),
    ('CTET 2016 Sep Paper II', list(range(57, 69)), list(range(69, 73)), 'expl'),
]

records = []
for name, qpages, apages, mode in PAPERS:
    parsed = parse_questions([page_text(doc[i]) for i in qpages])
    if mode == 'key':
        answers = {}
        for i in apages:
            answers.update(parse_key(doc[i].get_text()))
    else:
        answers = parse_explanations([doc[i].get_text() for i in apages])

    seen = {}
    for p in parsed:
        q = p['qno']
        if not (1 <= q <= 150):
            continue
        good = bool(p['stem']) and sum(1 for o in p['options'] if o) == 4
        if q in seen and (seen[q]['_good'] or not good):
            continue
        p['_good'] = good
        seen[q] = p

    for q in sorted(seen):
        p = seen[q]
        if 121 <= q <= 150:
            continue
        records.append({
            'book': BOOK, 'paper': name, 'qno': q,
            'question': p['stem'], 'options': p['options'],
            'answer': answers.get(q), 'has_answer': q in answers,
        })

for name, *_ in PAPERS:
    rs = [r for r in records if r['paper'] == name]
    print(f'{name}: {len(rs)} q, answers {sum(1 for r in rs if r["has_answer"])}, '
          f'4opts {sum(1 for r in rs if all(r["options"]))}, '
          f'missing {sorted(set(range(1,121)) - {r["qno"] for r in rs})}')
print('TOTAL:', len(records), '| 4opts:', sum(1 for r in records if all(r['options'])),
      '| answers:', sum(1 for r in records if r['has_answer']))

os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
json.dump(records, open(OUT_JSON, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['book', 'paper', 'qno', 'question', 'opt1', 'opt2', 'opt3', 'opt4', 'answer'])
    for r in records:
        w.writerow([r['book'], r['paper'], r['qno'], r['question']] + r['options'] + [r['answer'] if r['answer'] else ''])

print('\n--- samples ---')
for r in records[:2] + [r for r in records if r['paper'].startswith('CTET 2018')][:2]:
    print(json.dumps(r, ensure_ascii=False, indent=1)[:700])
