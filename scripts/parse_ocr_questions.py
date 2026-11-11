import re, json, os, sys

DEV = re.compile(r'[\u0900-\u097F]')
DEV_RUN = re.compile(r'[\u0900-\u097F]+')
ANS_RE = re.compile(r'\bAns\s*[.:\-]?\s*\(?([1-4a-dA-D])\)?', re.I)
Q_RE = re.compile(r'^\s*(\d{1,3})[\.\)]\s*(.*)$')
OPT_RE = re.compile(r'^\s*\(?\s*([1-9a-dA-D])\s*[\.\)]\s*(.*)$')
PAGE_NUM = re.compile(r'^\s*\d{1,4}\s*$')
HEADER_HINTS = re.compile(r'^\s*(CHAPTER|UNIT|CTET|SUCCESS|SOLVED|PAPER)\b', re.I)
LETTERS = {'a': 1, 'b': 2, 'c': 3, 'd': 4}


def to_index(tok):
    tok = tok.lower()
    return int(tok) if tok.isdigit() else LETTERS.get(tok)


def norm(s):
    s = s.replace('\u2019', "'").replace('\u2018', "'")
    s = s.replace('\u201c', '"').replace('\u201d', '"')
    s = s.replace('\xad', '')
    s = re.sub(r'[ \t]+', ' ', s)
    return s.strip()


def strip_hindi(line):
    """Keep the English part of a bilingual line."""
    if not DEV.search(line):
        return line.strip()
    runs = list(DEV_RUN.finditer(line))
    prefix = line[:runs[0].start()].rstrip(' /-|')
    suffix = line[runs[-1].end():].strip(' /-|')
    if suffix and re.search(r'[A-Za-z]{3,}', suffix) and not re.search(r'[.!?:;]$', prefix):
        return (prefix + ' ' + suffix).strip()
    return prefix.strip()


def clean_text(s):
    s = re.split(r'\s*>>.*$', s)[0]
    s = re.sub(r'\s+(?:Hea|Sol|Ana|Hee)\b.*$', '', s)
    s = re.sub(r'[_\s]*\bUNIT\s*[-–]?\s*\d+\b.*$', '', s, flags=re.I)
    s = re.sub(r'[_\s]*\bCHAPTER\s*[-–]?\s*\d+\b.*$', '', s, flags=re.I)
    s = re.sub(r'\s*\bpage\s*\d+\b.*$', '', s, flags=re.I)
    s = re.sub(r'\s+\S*0\d{2,3}:.*$', '', s)
    s = re.sub(r'\s*[|<>]+\s*$', '', s)
    s = re.sub(r'\s*[-–]\s*\d{1,3}\s*$', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip(' .,;:_-')


def split_option_line(line):
    """Split '(1) Physical (2) Spiritual' into [(1, 'Physical'), (2, 'Spiritual')]."""
    m = re.match(r'^\s*\(?\s*([1-4a-dA-D])\s*[\.\)]\s*(.*)$', line)
    if not m:
        return None
    first = to_index(m.group(1))
    if first is None:
        return None
    rest = m.group(2)
    parts = re.split(r'\s+\(?([1-4a-dA-D])\)\s+', rest)
    out = [(first, parts[0].strip())]
    for i in range(1, len(parts) - 1, 2):
        k = to_index(parts[i])
        if k:
            out.append((k, parts[i + 1].strip()))
    return out


def parse_pages(raw):
    pages = []
    for m in re.finditer(r'===== PAGE (\d+) =====\n(.*?)(?=\n===== PAGE |\Z)', raw, re.S):
        pages.append((int(m.group(1)), m.group(2).split('---COL---')))
    if not pages and raw.strip():
        pages.append((1, raw.split('---COL---')))
    return pages


def last_unanswered(questions):
    for q in reversed(questions):
        if q['answer'] is None:
            return q
    return None


def assign_answer(value, cur, questions):
    if value is None:
        return
    if cur is not None and any(cur['options']) and cur['answer'] is None:
        cur['answer'] = value
        return
    target = last_unanswered(questions)
    if target is not None:
        target['answer'] = value


def parse_column(lines, page_no, questions):
    cur = None
    last_qno = None

    def finalize():
        nonlocal cur
        if cur and cur['question'] and len([o for o in cur['options'] if o]) >= 2:
            questions.append(cur)
        cur = None

    for raw_line in lines:
        line = norm(strip_hindi(norm(raw_line)))
        if not line:
            continue

        if PAGE_NUM.match(line) or HEADER_HINTS.match(line):
            continue

        ans_m = ANS_RE.search(line)
        if ans_m and len(line) < 60:
            assign_answer(to_index(ans_m.group(1)), cur, questions)
            continue

        qm = Q_RE.match(line)
        if qm:
            qno = int(qm.group(1))
            filled = sum(1 for o in cur['options'] if o) if cur else 0
            next_expected = filled + 1
            # A following question number is taken as a new question when it is
            # the next integer and the current question is already fully optioned.
            new_question = (
                cur is None
                or cur['answer'] is not None
                or all(cur['options'])
                or qno == (last_qno or 0) + 1 and not any(cur['options'])
                or not (1 <= qno <= 4)
            )
            if not new_question:
                # treat as an option marker written as "1)" / "2)" etc.
                cur['options'][qno - 1] = (cur['options'][qno - 1] + ' ' + qm.group(2)).strip()
                continue
            finalize()
            cur = {'page': page_no, 'qno': qno, 'question': qm.group(2).strip(),
                   'options': ['', '', '', ''], 'answer': None}
            last_qno = qno
            continue

        om = OPT_RE.match(line)
        if om and cur is not None:
            segs = split_option_line(line) or [(to_index(om.group(1)), om.group(2).strip())]
            filled = sum(1 for o in cur['options'] if o)
            for k, val in segs:
                if k is None or k > 4 or (cur['options'][k - 1] and filled < 4):
                    # OCR often misreads (b)/(c)/(d); fall back to the next free slot
                    free = [i for i in range(4) if not cur['options'][i]]
                    k = free[0] + 1 if free else k
                if k is None or not (1 <= k <= 4):
                    continue
                cur['options'][k - 1] = (cur['options'][k - 1] + ' ' + val).strip() if cur['options'][k - 1] else val
                filled = sum(1 for o in cur['options'] if o)
            continue

        if cur is None:
            continue

        if any(cur['options']):
            for k in (4, 3, 2, 1):
                if cur['options'][k - 1]:
                    cur['options'][k - 1] = (cur['options'][k - 1] + ' ' + line).strip()
                    break
        else:
            cur['question'] = (cur['question'] + ' ' + line).strip()

    finalize()


def parse_file(path, book):
    raw = open(path, encoding='utf-8').read()
    questions = []
    for pno, cols in parse_pages(raw):
        for col in cols:
            parse_column(col.splitlines(), pno, questions)

    cleaned = []
    for r in questions:
        r['question'] = clean_text(re.sub(r'\s+', ' ', r['question']).strip())
        r['options'] = [clean_text(re.sub(r'\s+', ' ', o).strip()) for o in r['options']]
        r['book'] = book
        low = r['question'].lower()
        if len(r['question']) < 8 or sum(1 for c in r['question'] if c.isalpha()) < 5:
            continue
        if low.startswith(('this question paper', 'each question carries', 'directions')):
            continue
        n_opts = sum(1 for o in r['options'] if o)
        shortest = min([len(o) for o in r['options'] if o] or [0])
        if n_opts == 4 and r['answer'] and shortest >= 3 and len(r['question']) >= 15:
            r['quality'] = 'complete'
        elif n_opts == 4 and shortest >= 2:
            r['quality'] = 'questions_only'
        else:
            r['quality'] = 'partial'
        cleaned.append(r)
    return cleaned


if __name__ == '__main__':
    path = sys.argv[1]
    out_path = sys.argv[2]
    book = sys.argv[3] if len(sys.argv) > 3 else os.path.basename(path)
    recs = parse_file(path, book)
    json.dump(recs, open(out_path, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('questions:', len(recs))
    print('4 options:', sum(1 for r in recs if all(r['options'])))
    print('with answer:', sum(1 for r in recs if r['answer']))
    print('complete:', sum(1 for r in recs if r['quality'] == 'complete'))
    print('partial:', sum(1 for r in recs if r['quality'] == 'partial'))
    if recs:
        for r in recs[:2]:
            print(json.dumps(r, ensure_ascii=False, indent=1)[:700])
