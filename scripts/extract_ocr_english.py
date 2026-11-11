import re, json, os, sys

def is_english_line(line):
    s = line.strip()
    if not s:
        return False
    dev = sum(1 for c in s if '\u0900' <= c <= '\u097F')
    if dev > 1:
        return False
    ascii_n = sum(1 for c in s if c.isascii())
    if ascii_n / len(s) < 0.7:
        return False
    # drop obvious hindi transliteration tokens
    low = s.lower()
    hindi_tokens = ['frp', 'fare', 'aet', 'ata', 'ara', 'tata', 'sata', 'weta', 'heta', 'cata', 'aefa', 'aefa', 'tata', 'aafa']
    # require at least one common english word or ascii letter run
    if not re.search(r'[a-zA-Z]{3,}', s):
        return False
    return True

def col_split_text(text, col=60):
    out = []
    for line in text.splitlines():
        out.append(line[:col])
    return '\n'.join(out)

def parse_mcqs(text):
    text = re.sub(r'\r', '\n', text)
    lines = text.splitlines()
    records = []
    i = 0
    n = len(lines)
    while i < n:
        m = re.match(r'^\s*(\d{1,4})[\.\)]\s*(.*)', lines[i])
        if not m:
            i += 1
            continue
        qno = int(m.group(1))
        stem_parts = [m.group(2).strip()]
        i += 1
        opts = {}
        cur_opt = None
        ans = None
        while i < n:
            line = lines[i].strip()
            if re.match(r'Ans\s*[:.]\s*\(?[1-4]\)?', line, re.I):
                am = re.search(r'Ans\s*[:.]\s*\(?([1-4])\)?', line, re.I)
                if am:
                    ans = int(am.group(1))
                i += 1
                break
            nm = re.match(r'^\s*(\d{1,4})[\.\)]\s', lines[i])
            om = re.match(r'^\(?([1-4])\)?[\.\)]\s*(.*)', line)
            if nm and not om:
                break
            if om:
                k = int(om.group(1))
                val = om.group(2).strip()
                cur_opt = k
                opts[k] = val
                i += 1
                continue
            if line == '':
                i += 1
                continue
            if cur_opt is not None:
                opts[cur_opt] = (opts.get(cur_opt, '') + ' ' + line).strip()
            else:
                stem_parts.append(line)
            i += 1
        stem = ' '.join(p for p in stem_parts if p).strip()
        stem = re.sub(r'\s+', ' ', stem)
        opts = {k: re.sub(r'\s+', ' ', v).strip() for k, v in opts.items()}
        if stem and len(opts) >= 2 and ans is not None:
            if sum(1 for c in stem if c.isascii()) / max(1, len(stem)) < 0.7:
                i += 1
                continue
            records.append({'qno': qno, 'question': stem,
                            'options': [opts.get(k, '') for k in (1,2,3,4)],
                            'answer': ans})
        i += 1
    return records

if __name__ == '__main__':
    inp = sys.argv[1]
    outp = sys.argv[2]
    book = sys.argv[3] if len(sys.argv) > 3 else 'OCR Book'
    col = int(sys.argv[4]) if len(sys.argv) > 4 else 60
    raw = open(inp, encoding='utf-8').read()
    # process page by page
    all_recs = []
    pages = raw.split('===== PAGE')
    for pg in pages[1:]:
        # pg starts with " N =====\n..."
        header_end = pg.find('=====')
        # extract page number
        pno_str = pg[:header_end].strip() if header_end != -1 else ''
        body = pg[header_end+5:] if header_end != -1 else pg
        # column split
        left_text = col_split_text(body, col)
        # filter english
        eng = '\n'.join(l for l in left_text.splitlines() if is_english_line(l))
        recs = parse_mcqs(eng)
        for r in recs:
            r['page'] = pno_str.strip()
            r['book'] = book
        all_recs.extend(recs)
    json.dump(all_recs, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('Parsed MCQs:', len(all_recs))
    if all_recs:
        print(json.dumps(all_recs[0], ensure_ascii=False, indent=1)[:1200])
