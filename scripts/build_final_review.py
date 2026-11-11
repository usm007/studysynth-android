"""Merge every extracted CTET question set into one review file.

Sources (whichever exist)
  1. Success Master solved papers + practice sets (text PDF)
  2. CDP scanned book (OCR)              cdp_part.json
  3. SST scanned book (OCR)              sst_part.json
  4. Team Prabhat 10 practice sets (OCR) prabhat_part.json
  5. Booster CTET (OCR)                  booster_part.json
  6. Complete Resource: CDP / SST / English (text PDFs)
  7. CTET 2021 Solved Papers All Shifts (text PDF)

Output: output/ctet_english_questions_all.json / .csv + output/EXTRACTION_REPORT.md
"""
import json, csv, os, re
from collections import Counter, defaultdict

ROOT = r'C:\Users\Admin\Desktop\NET Ed'
OUT = os.path.join(ROOT, 'output')
TMP = r'C:\Users\Admin\AppData\Local\Temp\opencode'

SOURCES = [
    # (path, book label or None when the file is already normalised)
    (os.path.join(OUT, 'ctet_english_questions.json'), None),
    (os.path.join(TMP, 'cdp_part.json'), 'CTET CDP (Child Development & Pedagogy)'),
    (os.path.join(TMP, 'sst_part.json'), 'CTET Social Studies (SST)'),
    (os.path.join(TMP, 'booster_part.json'), 'Booster CTET (Prateek Shivalik)'),
    (os.path.join(TMP, 'res_cdp.json'), 'Complete Resource: CDP (Sandeep Kumar)'),
    (os.path.join(TMP, 'res_sst.json'), 'Complete Resource: Social Science (Sandeep Kumar)'),
    (os.path.join(TMP, 'res_eng.json'), 'Complete Resource: English (Geeta Sanhi)'),
    (os.path.join(TMP, 'yct2021.json'), 'CTET 2021 Solved Papers (YCT Expert Team)'),
    (os.path.join(TMP, 'practice_primary.json'), 'CTET Practice Book Primary Level (Class I-V)'),
    (os.path.join(TMP, 'paper2_2023.json'), 'CTET Paper 2 Aug 2023'),
    (os.path.join(TMP, 'paper2_2018dec.json'), 'CTET Paper 2 Dec 2018'),
    (os.path.join(TMP, 'paper2_2019jul.json'), 'CTET Paper 2 Jul 2019'),
    (os.path.join(TMP, 'paper2_2019dec.json'), 'CTET Paper 2 Dec 2019'),
    (os.path.join(TMP, 'paper2_2021.json'), 'CTET Paper 2 2021'),
    (os.path.join(TMP, 'paper2_2024jan.json'), 'CTET Paper 2 Jan 2024'),
    (os.path.join(TMP, 'sm_exercises.json'), 'CTET Success Master (chapter exercises)'),
    (os.path.join(TMP, 'sst_yct_extracted.json'), 'CTET & UPTET Social Studies (YCT Expert Team)'),
]


def with_quality(rec):
    """Normalise the quality tier."""
    opts = rec.get('options') or ['', '', '', '']
    n = sum(1 for o in opts if o)
    answer = rec.get('answer')
    shortest = min([len(o) for o in opts if o] or [0])
    if n == 4 and answer and shortest >= 3:
        rec['quality'] = 'complete'
    elif n == 4:
        rec['quality'] = 'questions_only'
    else:
        rec['quality'] = 'partial'
    rec.setdefault('language', 'en')
    rec.setdefault('page', None)
    return rec


def main():
    records = []
    for path, book in SOURCES:
        if not os.path.exists(path):
            print(f'skip (missing): {os.path.basename(path)}')
            continue
        recs = json.load(open(path, encoding='utf-8'))
        if book:
            for r in recs:
                r.setdefault('source_book', book)
        recs = [with_quality(r) for r in recs]
        print(f'{os.path.basename(path)}: {len(recs)}')
        records.extend(recs)

    seen, clean = set(), []
    for r in records:
        key = (r.get('source_book'), r.get('section'), r.get('qno'),
               (r.get('question') or '')[:70])
        if key in seen:
            continue
        seen.add(key)
        r.setdefault('section', '')
        clean.append(r)

    # second pass: drop the same question repeated across books, keeping the
    # copy that has an answer key when one exists
    rank = {'complete': 0, 'questions_only': 1, 'partial': 2}
    best = {}
    order = []
    for r in clean:
        stem = re.sub(r'[^a-z0-9]+', ' ', (r.get('question') or '').lower())[:80].strip()
        opts = tuple(re.sub(r'[^a-z0-9]+', ' ', (o or '').lower()).strip()
                     for o in (r.get('options') or ['', '', '', '']))
        key = (stem, opts)
        if key not in best:
            best[key] = r
            order.append(key)
        else:
            if rank[r['quality']] < rank[best[key]['quality']]:
                best[key] = r
    deduped = [best[k] for k in order]
    print(f'dedupe: {len(clean)} -> {len(deduped)}')
    clean = deduped

    json.dump(clean, open(os.path.join(OUT, 'ctet_english_questions_all.json'), 'w',
                          encoding='utf-8'), ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, 'ctet_english_questions_all.csv'), 'w', newline='',
              encoding='utf-8') as f:
        w = csv.writer(f)
        w.writerow(['source_book', 'section', 'page', 'qno', 'question',
                    'opt1', 'opt2', 'opt3', 'opt4', 'answer', 'quality'])
        for r in clean:
            opts = (r.get('options') or ['', '', '', ''])
            w.writerow([r.get('source_book', ''), r.get('section', ''), r.get('page') or '',
                        r.get('qno', ''), r.get('question', '')] + opts +
                       [r.get('answer') or '', r['quality']])

    per_book = defaultdict(Counter)
    for r in clean:
        per_book[r.get('source_book', '?')][r['quality']] += 1

    lines = ['# CTET English Question Extraction', '',
             f'Total questions: **{len(clean)}**', '',
             '| Source | Questions | Complete (4 opts + answer) | Questions only (no key) | Partial (missing option) |',
             '|---|---|---|---|---|']
    for book, c in sorted(per_book.items(), key=lambda kv: -sum(kv[1].values())):
        lines.append(f'| {book} | {sum(c.values())} | {c["complete"]} | '
                     f'{c["questions_only"]} | {c["partial"]} |')
    totals = Counter()
    for c in per_book.values():
        totals.update(c)
    lines.append(f'| **Total** | **{sum(totals.values())}** | **{totals["complete"]}** | '
                 f'**{totals["questions_only"]}** | **{totals["partial"]}** |')
    lines += ['',
              '- **Complete** - question stem, all four options and the printed answer.',
              '- **Questions only** - complete question with four options, no answer key printed in the book.',
              '- **Partial** - at least one option was lost to scan noise or layout; needs a look.',
              '',
              '## Notes',
              '',
              '- **Booster CTET (Prateek Shivalik)** is a scan with a two-column page and a 2x2 '
              'option grid. It was read column by column and the wrapped option text rebuilt '
              'from word positions, so individual options can still carry stray fragments; '
              'these records are all questions-only and are worth a visual check.',
              '- **CTET Paper 2 Aug 2023** ships no printed key with the paper. The separate key '
              'booklet page for Set E (Social Science) stops at question 90 and the paper '
              'numbers its sections independently, so no answers were attached.',
              '',
              '## Books checked that produced nothing usable',
              '',
              '| Book | Reason |',
              '|---|---|',
              '| CTET & All State TET Child Development (YCT) | Hindi only, and the Hindi is set in a legacy font that copies out as gibberish |',
              '| CTET & STETs Child Development (Himanshi Singh) | text is letter-spaced by the scan ("B eh a vi o r is t"), not reliably readable |',
              '| CTET 10 Practice Sets (Team Prabhat) | the file has no page image and its text layer is a scrambled stream (left and right column lines interleaved with no positions), so reading order cannot be recovered |',
              '| Curriculum Studies Handbook, Encyclopedia of Curriculum Studies, '
              'International Handbook of Teacher Education (2 vols), Foundations in Sociology of Education, '
              'History of Education in India, Philosophical Foundations of Education (2 books), TEACHER EDUCATION | '
              'textbooks and handbooks, no objective questions |',
              '']
    open(os.path.join(OUT, 'EXTRACTION_REPORT.md'), 'w', encoding='utf-8').write(
        '\n'.join(lines) + '\n')

    print()
    print('TOTAL:', len(clean), '| complete:', totals['complete'],
          '| questions_only:', totals['questions_only'], '| partial:', totals['partial'])
    for book, c in sorted(per_book.items(), key=lambda kv: -sum(kv[1].values())):
        print(f'  {book}: {sum(c.values())} ({c["complete"]} complete)')


if __name__ == '__main__':
    main()
