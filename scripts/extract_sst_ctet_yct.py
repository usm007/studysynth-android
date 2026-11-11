"""Extract bilingual English MCQs from books/SST CTET YCT.pdf."""
import os
import re
import json
import pymupdf

ROOT = r'C:\Users\Admin\Desktop\NET Ed'
PDF_PATH = os.path.join(ROOT, 'books', 'SST CTET YCT.pdf')
OUT_PATH = r'C:\Users\Admin\AppData\Local\Temp\opencode\sst_yct_extracted.json'

ans_map = {'a': 1, 'b': 2, 'c': 3, 'd': 4}

def is_hindi(line):
    if re.search(r'[\u0900-\u097F]', line):
        return True
    if re.search(r'\b(?:efvecve|keâ|ceW|nw|leLee|Deew|Je=|Ùee|keâes|hejer|meceepe|Gòej|yeÛÛee|Øeefle|jepÙe|Yetefce)\b', line):
        return True
    return False

def clean_stem(lines):
    stem = ' '.join(lines)
    stem = re.sub(r'\s+', ' ', stem).strip()
    # Strip any trailing hindi/legacy font tokens
    words = []
    for w in stem.split(' '):
        if is_hindi(w):
            break
        words.append(w)
    return ' '.join(words).strip(' -/:')

def clean_opt(text):
    text = text.split('/')[0].strip()
    text = re.sub(r'\s+', ' ', text).strip()
    return text

def main():
    doc = pymupdf.open(PDF_PATH)
    total_pages = len(doc)
    records = []

    for p in range(total_pages):
        text = doc[p].get_text()
        lines = text.splitlines()
        state = 'SEEK'
        qno = None
        stem_lines = []
        opts = {}
        ans = None

        i = 0
        while i < len(lines):
            line = lines[i].strip()
            if not line:
                i += 1
                continue

            m_q = re.match(r'^(\d{1,3})\.\s+([A-Z].*)', line)
            if m_q and state != 'OPTIONS':
                qno = int(m_q.group(1))
                stem_lines = [m_q.group(2)]
                opts = {}
                ans = None
                state = 'STEM'
                i += 1
                continue

            if state == 'STEM':
                m_opt = re.match(r'^\(([a-d])\)\s+(.*)', line)
                if m_opt:
                    state = 'OPTIONS'
                    letter = m_opt.group(1).lower()
                    opts[letter] = clean_opt(m_opt.group(2))
                elif is_hindi(line):
                    pass
                elif line.startswith('Ans.'):
                    state = 'SEEK'
                elif not line.isdigit() and 'UPTET' not in line and 'CTET' not in line and 'YCT' not in line:
                    stem_lines.append(line)

            elif state == 'OPTIONS':
                m_opt = re.match(r'^\(([a-d])\)\s+(.*)', line)
                if m_opt:
                    letter = m_opt.group(1).lower()
                    opts[letter] = clean_opt(m_opt.group(2))
                elif line.startswith('Ans.'):
                    m_ans = re.search(r'Ans\.\s*\(([a-d])\)', line, re.I)
                    if m_ans:
                        ans = m_ans.group(1).lower()
                    
                    if len(opts) == 4 and ans and ans in ans_map:
                        full_stem = clean_stem(stem_lines)
                        clean_options = [opts.get(k, '') for k in ['a', 'b', 'c', 'd']]
                        if len(full_stem) > 10 and all(len(o) > 0 for o in clean_options):
                            records.append({
                                'source_book': 'SST CTET YCT',
                                'section': f'p.{p+1}',
                                'page': p + 1,
                                'qno': qno,
                                'question': full_stem,
                                'options': clean_options,
                                'answer': ans_map[ans],
                                'quality': 'complete',
                                'language': 'en'
                            })
                    state = 'SEEK'
            i += 1

    print(f'Extracted {len(records)} verified MCQs from {total_pages} pages.')
    with open(OUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(records, f, ensure_ascii=False, indent=2)

if __name__ == '__main__':
    main()

