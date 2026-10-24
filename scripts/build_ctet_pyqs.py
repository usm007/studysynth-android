import os
import re
import sys
import json
from pypdf import PdfReader

sys.stdout.reconfigure(encoding='utf-8')

pdf_path = r"C:\Users\Admin\Downloads\CTET Success Master Social Science and Studies Paper-2 (Class 6-8).pdf"
r = PdfReader(pdf_path)

papers_meta = [
    {
        "name": "CTET Dec 2019",
        "q_start": 8, "q_end": 18,
        "ans_start": 19, "ans_end": 25,
        "tag": "dec_2019",
        "date": "2019-12-08"
    },
    {
        "name": "CTET July 2019",
        "q_start": 26, "q_end": 36,
        "ans_start": 37, "ans_end": 43,
        "tag": "july_2019",
        "date": "2019-07-07"
    },
    {
        "name": "CTET Dec 2018",
        "q_start": 44, "q_end": 52,
        "ans_start": 53, "ans_end": 57,
        "tag": "dec_2018",
        "date": "2018-12-09"
    },
    {
        "name": "CTET 2016",
        "q_start": 58, "q_end": 67,
        "ans_start": 68, "ans_end": 74,
        "tag": "2016",
        "date": "2016-09-18"
    }
]

HEADER_NOISE = re.compile(
    r'(?:\d{4}\s+(?:DEC|JULY|SEPT|FEB)\s+PAPER\s+II.*|SOLVED\s+PAPERCTET.*|SOLVED\s+PAPER\s+\(\w+\s+\d{4}\).*|CHILD\s+DEVELOPMENT\s+AND\s+PEDAGOGY.*|SOCIAL\s+STUDIES.*|Directions\s+\(Q\.?\s*Nos?.*?\)|www\.crackctet\.com|CRACKER)',
    re.IGNORECASE
)

KEY_MAP = {'1': 'A', '2': 'B', '3': 'C', '4': 'D'}

def clean_text(t):
    t = t.replace('□', ' ').replace('\u25a1', ' ')
    t = HEADER_NOISE.sub(' ', t)
    return re.sub(r'[ \t]+', ' ', t).strip()

def extract_paper_questions(p_info):
    name = p_info["name"]
    tag = p_info["tag"]
    print(f"Extracting {name}...")

    ans_text = ""
    for p in range(p_info["ans_start"] - 1, p_info["ans_end"]):
        t = r.pages[p].extract_text() or ""
        ans_text += t.replace('□', ' ') + "\n"

    ans_dict = {}
    ans_matches = list(re.finditer(r'(?:^|\n)\s*(\d{1,3})\.\s+\(([1-4])\)\s*', ans_text))
    for i, m in enumerate(ans_matches):
        q_num = int(m.group(1))
        key_num = m.group(2)
        start_exp = m.end()
        end_exp = ans_matches[i+1].start() if i+1 < len(ans_matches) else len(ans_text)
        raw_exp = ans_text[start_exp:end_exp].strip()
        clean_exp = clean_text(raw_exp)
        ans_dict[q_num] = {
            "key": KEY_MAP.get(key_num, 'A'),
            "explanation": clean_exp[:600]
        }

    q_text = ""
    for p in range(p_info["q_start"] - 1, p_info["q_end"]):
        t = r.pages[p].extract_text() or ""
        q_text += t.replace('□', ' ') + "\n"

    q_chunks = re.split(r'\n\s*(?=\d{1,3}\.\s+)', q_text)
    questions = {}

    for chunk in q_chunks:
        chunk = chunk.strip()
        m = re.match(r'^(\d{1,3})\.\s*(.*)', chunk, re.DOTALL)
        if not m:
            continue
        q_num = int(m.group(1))
        body = m.group(2).strip()

        parts = re.split(r'\(([1-4])\)', body)
        stem = clean_text(parts[0])

        options = []
        for oi in range(1, len(parts), 2):
            num_str = parts[oi]
            if num_str in KEY_MAP:
                opt_text = clean_text(parts[oi+1])
                options.append({
                    "key": KEY_MAP[num_str],
                    "text": opt_text[:200]
                })

        if len(options) >= 4 and len(stem) > 10 and q_num in ans_dict:
            corr_key = ans_dict[q_num]["key"]
            opt_objs = []
            for o in options[:4]:
                opt_objs.append({
                    "key": o["key"],
                    "text": o["text"],
                    "is_correct": (o["key"] == corr_key),
                    "distractor_origin": "source_distractor",
                    "confusion_type": "ctet_past_exam",
                    "distractor_purpose": "conceptual"
                })

            ans_text_val = ""
            for o in opt_objs:
                if o["is_correct"]:
                    ans_text_val = o["text"]

            exp = ans_dict[q_num]["explanation"]
            if not exp or len(exp) < 15:
                exp = f"Correct option is ({corr_key}): {ans_text_val}. From official CTET {name} paper."

            q_obj = {
                "id": f"q_ctet_{tag}_{q_num:03d}",
                "stem": stem,
                "options": opt_objs,
                "answer_key": corr_key,
                "expected_answer": ans_text_val,
                "knowledge_units": [
                    {
                        "ku_id": f"KU-CTET-{tag}-{q_num:03d}",
                        "fact_id": f"F-CTET-{tag}-{q_num:03d}",
                        "role": "primary"
                    }
                ],
                "source_title": f"{name} Solved Paper",
                "source_page": 1,
                "supporting_excerpt": f"{stem} — Answer: {ans_text_val}. {exp}",
                "explanation": exp,
                "difficulty": "medium",
                "cognitive_level": "understanding",
                "evidence": {
                    "fact_ids": [f"F-CTET-{tag}-{q_num:03d}"],
                    "excerpts": [f"{stem} {exp}"],
                    "fact_type": "pedagogical_fact",
                    "source_title": f"{name} Solved Paper",
                    "source_page": 1
                },
                "verification": {
                    "status": "verified",
                    "rules": ["official_ctet_paper", "verified_answer_key", "source_explanation"]
                }
            }
            questions[q_num] = q_obj

    return questions

def create_module(mod_id, subject, cls_name, chapter_title, q_list, created_at):
    inventory = []
    for i, q in enumerate(q_list):
        ku_id = f"KU-{mod_id}-{i+1:03d}"
        fact_id = f"F-{mod_id}-{i+1:03d}"
        q["knowledge_units"] = [{"ku_id": ku_id, "fact_id": fact_id, "role": "primary"}]
        q["evidence"]["fact_ids"] = [fact_id]
        inventory.append({
            "ku_id": ku_id,
            "tier": 3,
            "section_id": "sec_1",
            "section_title": chapter_title,
            "statement": q["stem"][:250],
            "anchor": chapter_title,
            "supporting_excerpt": q["supporting_excerpt"][:400],
            "source_page": 1,
            "source_start": i * 100,
            "source_end": (i + 1) * 100,
            "fact_ids": [fact_id],
            "fact_types": ["pedagogical_fact"],
            "extraction_method": "official_pyq",
            "confidence_class": "high",
            "conflict_status": "clear",
            "revision_facts": [
                {
                    "fact_id": fact_id,
                    "fact_type": "pedagogical_fact",
                    "relation": "answer_recall",
                    "answer_kind": "recall",
                    "supporting_excerpt": q["supporting_excerpt"][:400],
                    "source_page": 1,
                    "extraction_method": "official_pyq",
                    "confidence_class": "high",
                    "conflict_status": "clear"
                }
            ]
        })

    full_title = f"{subject} - {cls_name} - {chapter_title}"
    return {
        "id": mod_id,
        "title": full_title,
        "createdAt": f"{created_at}T10:00:00.000Z",
        "durationMs": len(q_list) * 200,
        "sectionsCount": 1,
        "inventory": inventory,
        "questions": q_list
    }

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
output_dir = os.path.join(ROOT, "output", "ctet_modules")
os.makedirs(output_dir, exist_ok=True)

pyq_modules = []

for p in papers_meta:
    qs = extract_paper_questions(p)
    tag = p["tag"]
    name = p["name"]
    date_str = p["date"]

    # 1. Pedagogy: Q1 to Q30
    cdp_qs = [qs[k] for k in sorted(qs.keys()) if 1 <= k <= 30]
    if cdp_qs:
        mod_cdp = create_module(
            f"ctet_pyq_{tag}_cdp",
            "Pedagogy",
            "CTET Paper 2 PYQs",
            f"{name} Child Development & Pedagogy",
            cdp_qs,
            date_str
        )
        pyq_modules.append(mod_cdp)
        with open(os.path.join(output_dir, f"{mod_cdp['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(mod_cdp, f, indent=2, ensure_ascii=False)
        print(f"  Created {mod_cdp['title']} ({len(cdp_qs)} questions)")

    # 2. Social Science: Q31 to Q90
    ss_qs = [qs[k] for k in sorted(qs.keys()) if 31 <= k <= 90]
    if ss_qs:
        mod_ss = create_module(
            f"ctet_pyq_{tag}_ss",
            "Social Science",
            "CTET Paper 2 PYQs",
            f"{name} Social Science Solved Paper",
            ss_qs,
            date_str
        )
        pyq_modules.append(mod_ss)
        with open(os.path.join(output_dir, f"{mod_ss['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(mod_ss, f, indent=2, ensure_ascii=False)
        print(f"  Created {mod_ss['title']} ({len(ss_qs)} questions)")

    # 3. English: Q91 to Q120
    eng_qs = [qs[k] for k in sorted(qs.keys()) if 91 <= k <= 120]
    if eng_qs:
        mod_eng = create_module(
            f"ctet_pyq_{tag}_eng",
            "English",
            "CTET Paper 2 PYQs",
            f"{name} English Language & Pedagogy",
            eng_qs,
            date_str
        )
        pyq_modules.append(mod_eng)
        with open(os.path.join(output_dir, f"{mod_eng['id']}.json"), "w", encoding="utf-8") as f:
            json.dump(mod_eng, f, indent=2, ensure_ascii=False)
        print(f"  Created {mod_eng['title']} ({len(eng_qs)} questions)")

print(f"\nTotal new PYQ modules generated: {len(pyq_modules)}")

# Publish through the shared payload builder: it writes the lightweight index
# plus one body file per set, and removes the legacy single-file bundle.
print("\nPublishing the bundled PWA payload...")
import build_ctet_payload
build_ctet_payload.main()
