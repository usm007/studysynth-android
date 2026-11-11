import fitz, re, json, os

PDF = r'C:\Users\Admin\Downloads\CTET Success Master Social Science and Studies Paper-2 (Class 6-8).pdf'
LAYOUT = r'C:\Users\Admin\AppData\Local\Temp\opencode\sm_full.txt'
OUT_JSON = r'C:\Users\Admin\Desktop\NET Ed\output\ctet_success_master_mcqs.json'
OUT_CSV  = r'C:\Users\Admin\Desktop\NET Ed\output\ctet_success_master_mcqs.csv'

doc = fitz.open(PDF)
layout = open(LAYOUT, encoding='utf-8').read()
layout_pages = layout.split('\f')

# Locate practice set page ranges (0-based) via PyMuPDF text
set1_start = set2_start = None
for pno in range(doc.page_count):
    t = doc[pno].get_text()
    if set1_start is None and 'PRACTICE SET 1' in t and 'INSTRUCTIONS' in t:
        set1_start = pno
    if set1_start is not None and set2_start is None and pno > set1_start and 'PRACTICE SET 2' in t and 'INSTRUCTIONS' in t:
        set2_start = pno
        break
ranges = [(1, set1_start, set2_start), (2, set2_start, doc.page_count)]

COL_SPLIT = 65
def unwrap_column(lines):
    out = []
    for ln in lines:
        s = ln.rstrip()
        if s.strip() == '':
            if out and out[-1] != '':
                out.append('')
            continue
        if re.match(r'^\s*\d{1,4}\.\s', s) or re.match(r'^\s*\([1-4]\)', s):
            out.append(s.strip())
        else:
            if out and out[-1] != '':
                out[-1] = out[-1] + ' ' + s.strip()
            else:
                out.append(s.strip())
    return [l for l in out if l.strip() != '']

# Build clean stem lookup from layout file
clean_stems = {}
SKIP_PREFIXES = ('this question paper', 'each question carries', 'this paper has', 'select the correct', 'directions')
for (set_no, pstart, pend) in ranges:
    for pno in range(pstart, pend):
        page = layout_pages[pno]
        for col_lines in ([ln[:COL_SPLIT] for ln in page.splitlines()], [ln[COL_SPLIT:] for ln in page.splitlines()]):
            logical = unwrap_column(col_lines)
            for line in logical:
                m = re.match(r'^\s*(\d{1,4})\.\s+(.+)$', line)
                if not m:
                    continue
                qno = int(m.group(1))
                stem = m.group(2).strip()
                if any(stem.lower().startswith(p) for p in SKIP_PREFIXES):
                    continue
                if not (1 <= qno <= 150):
                    continue
                stem = re.split(r'\s*\(\d\)\s', stem)[0].strip()
                if stem and (set_no, qno) not in clean_stems:
                    clean_stems[(set_no, qno)] = stem

# Parse answer keys from layout file: last two large answer blocks
parts = layout.split('Answers')
large = []
for p in parts[1:]:
    m = re.findall(r'\b(\d{1,4})\s*\(([1-4])\)', p[:3000])
    if len(m) >= 100:
        large.append(m)
large = large[-2:]
answer_keys = []
for block in large:
    d = {}
    for q, a in block:
        d[int(q)] = int(a)
    answer_keys.append(d)

def parse_options(body):
    opts = {}
    for k in (1,2,3,4):
        m = re.search(r'\(' + str(k) + r'\)\s*(.*?)(?=\([1-4]\)|$)', body, re.S)
        if m:
            opts[k] = re.sub(r'\s+', ' ', m.group(1)).strip()
    return opts

records = []
for i,(set_no, pstart, pend) in enumerate(ranges):
    answers = answer_keys[i] if i < len(answer_keys) else {}
    # Use default PyMuPDF text (preserves line breaks & spaces for most)
    for pno in range(pstart, pend):
        text = doc[pno].get_text()
        q_matches = list(re.finditer(r'(?:^|\n)\s*(\d{1,4})\.\s+(.*?)(?=(?:^|\n)\s*\d{1,4}\.\s+|\Z)', text, re.S))
        for m in q_matches:
            qnum = int(m.group(1))
            body = m.group(2).strip()
            opt_pos = body.find('(1)')
            if opt_pos == -1:
                stem, opts = body, {}
            else:
                stem = body[:opt_pos].strip()
                opts = parse_options(body[opt_pos:])
            stem = re.sub(r'\s+', ' ', stem).strip()
            if (set_no, qnum) in clean_stems:
                stem = clean_stems[(set_no, qnum)]
            if not stem or len(opts) < 2:
                continue
            # skip instruction lines that slipped through
            if any(stem.lower().startswith(p) for p in ('this question paper', 'each question carries', 'this paper has', 'select the correct')):
                continue
            # skip Hindi section (Q. 61-90) — English-only output
            if 61 <= qnum <= 90:
                continue
            records.append({
                'book': 'CTET Success Master Social Science and Studies Paper-2 (Class 6-8)',
                'set': set_no,
                'qno': qnum,
                'question': stem,
                'options': [opts.get(k, '') for k in (1,2,3,4)],
                'answer': answers.get(qnum),
                'has_answer': qnum in answers,
            })

os.makedirs(os.path.dirname(OUT_JSON), exist_ok=True)
with open(OUT_JSON, 'w', encoding='utf-8') as f:
    json.dump(records, f, ensure_ascii=False, indent=1)

import csv
with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['book','set','qno','question','opt1','opt2','opt3','opt4','answer'])
    for r in records:
        w.writerow([r['book'], r['set'], r['qno'], r['question']] + r['options'] + [r['answer'] if r['answer'] is not None else ''])

print('clean_stems count:', len(clean_stems))
print('Total MCQs extracted:', len(records))
print('With answer:', sum(1 for r in records if r['has_answer']))
print('Without answer:', sum(1 for r in records if not r['has_answer']))
from collections import Counter
print('Per set:', dict(Counter(r['set'] for r in records)))
for r in records:
    if 'Pakhi' in r['question']:
        print('\nPAKHI:', json.dumps(r, ensure_ascii=False)[:700]); break
if records:
    print('\n--- SAMPLE 1 ---')
    print(json.dumps(records[0], ensure_ascii=False, indent=1)[:1200])
# check for any remaining spaceless stems
bad = [r for r in records if re.search(r'[a-z]{6,}[A-Z]', r['question'])]
print('\nStems with possible missing spaces:', len(bad))
if bad:
    print('Example:', bad[0]['question'][:120])
