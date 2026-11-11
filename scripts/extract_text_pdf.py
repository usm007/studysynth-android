"""Extract MCQs from text-based (non-scanned) CTET PDFs.

Handles the common Indian-exam layouts:
  * question stems   "12. Some question"
  * options          "(a) text" / "(1) text", inline or stacked
  * answers          "Ans. (b)" inline, or an "ANSWER KEYS" block "1. (b)"
"""
import json, os, re, sys
import pymupdf

LETTERS = {'a': 1, 'b': 2, 'c': 3, 'd': 4}
ANS_RE = re.compile(r'\bAns(?:wer)?\s*[:.]?\s*\(?([1-4a-dA-D])\)?')
KEY_RE = re.compile(r'^\s*(\d{1,3})\s*[\.\)]\s*\(?([1-4a-dA-D])\)?\s*$')
KEY_PAIR_RE = re.compile(r'(\d{1,3})\s*[\.\)]\s*\(?\s*([1-4a-dA-D])\s*\)')
STEM_RE = re.compile(r'^\s*(\d{1,3})\s*[\.\)]\s+(\S.*)$')
STEM_ONLY_RE = re.compile(r'^\s*(\d{1,3})\s*[\.\)]\s*$')
OPT_RE = re.compile(r'^\s*\(?([1-4a-dA-D])\)\s*(.*)$')
INLINE_OPT_RE = re.compile(r'\(?\b([a-d])\)\s')
NOISE_RE = re.compile(
    r'^\s*(?:CHAPTER|UNIT|CTET|YCT|SUCCESS|SOLVED|PAPER|ANSWER\s*KEY|'
    r'\d{1,4}\s*\|?\s*$|\|?\s*\d{1,4}\s*$)', re.I)
DEV_RE = re.compile(r'[\u0900-\u097F]')
# glyphs that only appear when Hindi is typeset in a legacy ASCII font
FOREIGN_CHARS = set('§∑⁄‡ˇÕ¸•ÒËÁÍ¬˝ÊÙ˜')
FURNITURE_RE = re.compile(r'^(?:P-I{1,3}|!?[A-Z]{2,5}-\d+[A-Z0-9-]*!?|M\s*\d{1,3})$')


def to_index(tok):
    tok = tok.strip().lower()
    return int(tok) if tok.isdigit() else LETTERS.get(tok)


def is_junk_token(tok):
    if any(c in FOREIGN_CHARS for c in tok):
        return True
    latin1 = sum(1 for c in tok if '\u00c0' <= c <= '\u00ff' and c not in '×÷')
    return latin1 >= 0.5 * len(tok)


def norm(s):
    s = s.replace('\u2019', "'").replace('\u2018', "'")
    s = s.replace('\u201c', '"').replace('\u201d', '"')
    s = s.replace('\xad', '').replace('\u00a0', ' ')
    s = re.sub(r'Join Telegram.*$', '', s, flags=re.I)
    s = re.sub(r'@\w+', '', s)
    s = re.sub(r'(?i)\b(?:For|Join)\s+(?:kvs|nvs|dsssb|ctet)\b.*$', '', s)
    s = ' '.join(t for t in s.split(' ') if t and not is_junk_token(t)
                 and not FURNITURE_RE.match(t))
    return re.sub(r'[ \t]+', ' ', s).strip(' ,;|-')


def squash(s):
    return re.sub(r'\s+', ' ', s).strip()


HINDI_FONT_SIG = re.compile(
    r'\b(?:keâ|ceW|nw|leLee|Deew|Je=#|Ùee|keâes|hejer#ee|meceepe|Goenj|ef[^\s]{0,4})\b')


def looks_indian_font_gibberish(text):
    """Detect Hindi written in a legacy ASCII font (renders as nonsense Latin)."""
    if DEV_RE.search(text):
        return True
    if '\ufffd' in text:
        # the text layer of these books decodes legacy Hindi to replacement chars
        return True
    if not text.strip():
        return False
    non_ascii_chars = sum(1 for c in text if ord(c) > 126)
    if non_ascii_chars / len(text) > 0.10:
        return True
    toks = text.split()
    non_ascii = sum(1 for t in toks if any(ord(c) > 127 for c in t))
    if toks and non_ascii / len(toks) > 0.15:
        return True
    return len(HINDI_FONT_SIG.findall(text)) >= 2


def is_foreign_line(text):
    """True for a single line of the Hindi half of a bilingual paper.

    Looser than the record-level check, because a short English line may carry a
    symbol or two (pi, degree, multiplication sign) without being Hindi.
    """
    if DEV_RE.search(text) or '\ufffd' in text:
        return True
    n = sum(1 for c in text if ord(c) > 126)
    if len(text) >= 8 and n / len(text) > 0.20:
        return True
    return len(HINDI_FONT_SIG.findall(text)) >= 2


def join_frag(a, b):
    """Join a wrapped line, repairing words broken with a trailing hyphen."""
    if not a:
        return b
    if a.endswith('-') and b[:1].islower():
        return a[:-1] + b
    return a + ' ' + b


def split_inline_options(text):
    """'(a) x (b) y (c) z (d) w' -> [(1,'x'),(2,'y'),(3,'z'),(4,'w')]."""
    marks = list(INLINE_OPT_RE.finditer(text))
    if len(marks) < 2:
        return None
    out = []
    for i, m in enumerate(marks):
        k = to_index(m.group(1))
        end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
        val = text[m.end():end].strip(' .,;:|-')
        out.append((k, val))
    return out


def parse_pdf(path, book, start=None, end=None, digits_only=False):
    doc = pymupdf.open(path)
    lo = start or 0
    hi = min(end or doc.page_count, doc.page_count)

    questions = []
    cur = None
    block = 0
    last_qno = None
    in_key = False

    def finalize():
        nonlocal cur
        if cur and cur['question'] and sum(1 for o in cur['options'] if o) >= 2:
            questions.append(cur)
        cur = None

    for pno in range(lo, hi):
        text = doc[pno].get_text()
        for raw in text.splitlines():
            line = norm(raw)
            if not line:
                continue
            if DEV_RE.search(line):
                # bilingual line: keep the English half only
                line = norm(DEV_RE.sub(' ', line))
                if not line:
                    continue
            if is_foreign_line(line):
                # the Hindi half of a bilingual paper, in a legacy font
                continue

            def apply_key_pairs(text):
                for qs, ans in KEY_PAIR_RE.findall(text):
                    qno = int(qs)
                    val = to_index(ans)
                    if not val:
                        continue
                    for q in reversed(questions):
                        if q['qno'] == qno and q['answer'] is None:
                            q['answer'] = val
                            break

            key_head = re.search(r'ANSWER\s*KEY', line, re.I)
            if key_head:
                finalize()
                in_key = True
                apply_key_pairs(line[key_head.end():])
                continue

            if in_key:
                if KEY_PAIR_RE.search(line):
                    apply_key_pairs(line)
                    continue
                if STEM_RE.match(line) or STEM_ONLY_RE.match(line):
                    in_key = False
                else:
                    continue

            # degenerate key rows "1. (b) 2. (c) 3. (a)" scattered outside a header
            if len(KEY_PAIR_RE.findall(line)) >= 2:
                apply_key_pairs(line)
                continue

            # answer-key rows: "1. (b)"
            km = KEY_RE.match(line)
            if km and not questions:
                apply_key_pairs(line)
                continue

            am = ANS_RE.search(line)
            if am:
                val = to_index(am.group(1))
                if val:
                    if cur is not None and any(cur['options']) and cur['answer'] is None:
                        cur['answer'] = val
                        cur['_answered'] = True
                    elif questions and questions[-1]['answer'] is None:
                        questions[-1]['answer'] = val
                    # everything after the marker is the printed explanation
                    line = line[:am.start()].strip()
                    if not line:
                        continue

            if in_key and not STEM_RE.match(line):
                continue

            sm = STEM_RE.match(line)
            only = STEM_ONLY_RE.match(line) if not sm else None
            if sm or only:
                qno = int((sm or only).group(1))
                stem0 = sm.group(2).strip() if sm else ''
                # a new exercise restarts numbering at 1
                if last_qno is not None and qno <= last_qno:
                    finalize()
                    block += 1
                    in_key = False
                elif cur is not None and all(cur['options']):
                    finalize()
                elif cur is not None and cur['answer'] is not None:
                    finalize()
                cur = {'page': pno + 1, 'block': block, 'qno': qno,
                       'question': stem0,
                       'options': ['', '', '', ''], 'answer': None,
                       '_answered': False}
                last_qno = qno
                in_key = False
                continue

            if cur is None:
                continue

            # text after the printed answer is explanation, not question content
            if cur.get('_answered'):
                continue

            # options, either "(a) text" / "(1) text" stacked or several on one line
            om = OPT_RE.match(line)
            if om:
                k0 = to_index(om.group(1))
                if k0 and 1 <= k0 <= 4:
                    segs = split_inline_options(line) or [(k0, om.group(2))]
                    wrote = False
                    for k, val in segs:
                        if k and 1 <= k <= 4:
                            if val:
                                wrote = True
                            cur['options'][k - 1] = join_frag(cur['options'][k - 1], val)
                    # a marker printed on its own line: the text follows below
                    cur['_pending'] = None if wrote else k0
                    continue

            # text belonging to a marker that had no text of its own
            if cur.get('_pending'):
                k = cur['_pending'] - 1
                cur['options'][k] = join_frag(cur['options'][k], line)
                continue

            # continuation text
            if any(cur['options']):
                for k in (4, 3, 2, 1):
                    if cur['options'][k - 1]:
                        cur['options'][k - 1] = join_frag(cur['options'][k - 1], line)
                        break
            else:
                cur['question'] = join_frag(cur['question'], line)

    finalize()

    cleaned = []
    for r in questions:
        q = squash(r['question'])
        opts = [squash(o) for o in r['options']]
        if len(q) < 10 or sum(1 for c in q if c.isalpha()) < 8:
            continue
        if looks_indian_font_gibberish(q):
            continue
        if any(looks_indian_font_gibberish(o) for o in opts if o):
            continue
        if re.match(r'^(answers?|options?|directions?)\b', q, re.I):
            continue
        n = sum(1 for o in opts if o)
        if n == 4 and r['answer']:
            quality = 'complete'
        elif n == 4:
            quality = 'questions_only'
        else:
            quality = 'partial'
        cleaned.append({
            'source_book': book,
            'section': f"p.{r['page']}",
            'page': r['page'],
            'block': r['block'],
            'qno': r['qno'],
            'question': q,
            'options': opts,
            'answer': r['answer'],
            'quality': quality,
            'language': 'en',
        })
    return cleaned


if __name__ == '__main__':
    path, out, book = sys.argv[1], sys.argv[2], sys.argv[3]
    start = int(sys.argv[4]) if len(sys.argv) > 4 else None
    end = int(sys.argv[5]) if len(sys.argv) > 5 else None
    recs = parse_pdf(path, book, start, end)
    json.dump(recs, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    complete = sum(1 for r in recs if r['quality'] == 'complete')
    print(f'{book}: {len(recs)} questions | complete {complete} | partial {len(recs)-complete}')
    for r in recs[:2]:
        print(json.dumps(r, ensure_ascii=False, indent=1)[:500])
