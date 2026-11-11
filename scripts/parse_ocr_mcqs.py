import re, json, os, sys

ENGLISH_WORDS = set("""which what following correct statement statements assertion reason
not except of the is are was were a an in to for by with on at from as
and or but if then when where how why who whom whose this that these those
true false option options choose given below above period development
childhood adolescence adulthood stage stages question questions answer
principle principles learning teacher student students class classes
growth emotional cognitive social personality individual differences
understanding means means of called known as per according""".split())

def is_english_line(line):
    s = line.strip()
    if not s:
        return False
    dev = sum(1 for c in s if '\u0900' <= c <= '\u097F')
    if dev > 1:
        return False
    # common english word check
    low = s.lower()
    words = re.findall(r"[a-zA-Z']+", low)
    if not words:
        return False
    eng_hits = sum(1 for w in words if w in ENGLISH_WORDS)
    if eng_hits == 0 and len(words) > 3:
        return False
    ascii_n = sum(1 for c in s if c.isascii())
    if ascii_n / len(s) < 0.6:
        return False
    return True

def filter_english(text):
    out = []
    for l in text.splitlines():
        if is_english_line(l):
            out.append(l)
    return '\n'.join(out)

def parse_mcqs(text):
    text = filter_english(text)
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
                # next question
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
            # quality check: stem should have english words
            if sum(1 for c in stem if c.isascii()) / max(1, len(stem)) < 0.7:
                i += 1
                continue
            records.append({'qno': qno, 'question': stem,
                            'options': [opts.get(k, '') for k in (1,2,3,4)],
                            'answer': ans})
        i += 1  # avoid infinite loop; safe
    return records

if __name__ == '__main__':
    inp = sys.argv[1]
    outp = sys.argv[2]
    text = open(inp, encoding='utf-8').read()
    recs = parse_mcqs(text)
    json.dump(recs, open(outp, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('Parsed MCQs:', len(recs))
    if recs:
        print(json.dumps(recs[0], ensure_ascii=False, indent=1)[:1200])
