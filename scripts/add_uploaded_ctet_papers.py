#!/usr/bin/env python3
"""
Parse uploaded CTET Paper-I markdown files (2019, 2021, 2022, 2023)
and generate structured study sets in pwa/ctet/ and index/manifest.
"""

import os
import re
import sys
import json
import glob
import hashlib
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MEDIA_DIR = r"C:/Users/Admin/.gemini/antigravity/brain/a1c58217-4552-48d3-ba10-de93e4de9c3e/.user_uploaded"
PWA_DIR = os.path.join(ROOT, "pwa")
PWA_CTET = os.path.join(PWA_DIR, "ctet")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
from rebuild_ugc_modules import (
    clean_text, clean_option_text,
    parse_match_list, parse_assertion_reason, parse_statement_pair
)

SECTION_MAP = {
    range(1, 31): "Child Development & Pedagogy",
    range(31, 61): "Mathematics",
    range(61, 91): "Environmental Studies",
    range(91, 121): "Language-I (English)",
    range(121, 151): "Language-II (Hindi)"
}

def get_section_name(qno):
    for r, name in SECTION_MAP.items():
        if qno in r:
            return name
    return "General"

def parse_options_slice(body_before_ans):
    matches = list(re.finditer(r'(?:^|\n|\s)\(?([a-d])\)\s+', body_before_ans, re.I))
    best_seq = None
    for k in range(len(matches)):
        if matches[k].group(1).lower() == 'a':
            b_idx = next((j for j in range(k+1, len(matches)) if matches[j].group(1).lower() == 'b'), None)
            if b_idx is not None:
                c_idx = next((j for j in range(b_idx+1, len(matches)) if matches[j].group(1).lower() == 'c'), None)
                if c_idx is not None:
                    d_idx = next((j for j in range(c_idx+1, len(matches)) if matches[j].group(1).lower() == 'd'), None)
                    if d_idx is not None:
                        best_seq = (matches[k], matches[b_idx], matches[c_idx], matches[d_idx])
    if not best_seq:
        return None
        
    m_a, m_b, m_c, m_d = best_seq
    stem = re.sub(r'\s+', ' ', body_before_ans[:m_a.start()]).strip()
    opt_a = re.sub(r'\s+', ' ', body_before_ans[m_a.end():m_b.start()]).strip()
    opt_b = re.sub(r'\s+', ' ', body_before_ans[m_b.end():m_c.start()]).strip()
    opt_c = re.sub(r'\s+', ' ', body_before_ans[m_c.end():m_d.start()]).strip()
    opt_d = re.sub(r'\s+', ' ', body_before_ans[m_d.end():]).strip()
    opts = [opt_a, opt_b, opt_c, opt_d]
    return stem, opts

# 1. PARSER FOR 2019
def parse_2019(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    q_blocks = re.split(r'\n###\s+Question\s+(\d+)', text)
    questions = []
    for i in range(1, len(q_blocks), 2):
        qno = int(q_blocks[i])
        body = q_blocks[i+1]
        ans_m = re.search(r'\*\*Correct\s*answer:\*\*\s*\(?([A-Da-d])\)?', body)
        if not ans_m:
            continue
        ans_key = ans_m.group(1).upper()
        sliced = parse_options_slice(body[:ans_m.start()].strip())
        if not sliced:
            continue
        stem, opts = sliced
        if len(stem) > 5 and all(len(o) > 0 for o in opts):
            questions.append({
                'qno': qno,
                'stem': stem,
                'options': opts,
                'answer': ans_key,
                'explanation': '',
                'paper': 'CTET Paper-I (8 Dec 2019)'
            })
    return questions

# 2. PARSER FOR 2021
def parse_2021(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    q_blocks = re.split(r'\n###\s+Question\s+(\d+)', text)
    questions = []
    for i in range(1, len(q_blocks), 2):
        qno = int(q_blocks[i])
        body = q_blocks[i+1]
        ans_m = re.search(r'\*\*Correct\s*answer:?\s*\(?([A-Da-d])\)?\*\*', body, re.I)
        if not ans_m:
            continue
        ans_key = ans_m.group(1).upper()
        exp_m = re.search(r'\*\*Explanation[^\n]*\*\*\s*\n*(.*)', body, re.S)
        explanation = re.sub(r'\s+', ' ', exp_m.group(1)).strip() if exp_m else ''
        sliced = parse_options_slice(body[:ans_m.start()].strip())
        if not sliced:
            continue
        stem, opts = sliced
        if len(stem) > 5 and all(len(o) > 0 for o in opts):
            questions.append({
                'qno': qno,
                'stem': stem,
                'options': opts,
                'answer': ans_key,
                'explanation': explanation,
                'paper': 'CTET Paper-I (16 Dec 2021)'
            })
    return questions

# 3. PARSER FOR 2022
def parse_2022(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    q_blocks = re.split(r'\n###\s+(\d+)\.\s+', text)
    questions = []
    for i in range(1, len(q_blocks), 2):
        qno = int(q_blocks[i])
        if qno > 120:  # Exclude Hindi questions
            continue
        body = q_blocks[i+1]
        ans_m = re.search(r'\*\*(?:Correct\s*answer|Answer\s*key)[^\*]*\*\*\s*\(?([a-d])\)?', body, re.I)
        if not ans_m:
            continue
        ans_key = ans_m.group(1).upper()
        sliced = parse_options_slice(body[:ans_m.start()].strip())
        if not sliced:
            continue
        stem, opts = sliced
        if len(stem) > 5 and all(len(o) > 0 for o in opts):
            questions.append({
                'qno': qno,
                'stem': stem,
                'options': opts,
                'answer': ans_key,
                'explanation': '',
                'paper': 'CTET Paper-I (21 Jan 2022)'
            })
    return questions

# 4. PARSER FOR 2023
def parse_2023(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        text = f.read()
    q_blocks = re.split(r'\n###\s+Question\s+(\d+)', text)
    questions = []
    for i in range(1, len(q_blocks), 2):
        qno = int(q_blocks[i])
        body = q_blocks[i+1]
        ans_m = re.search(r'\*\*Correct\s*answer:?\s*\(?([A-Da-d])\)?\*\*', body, re.I)
        if not ans_m:
            continue
        ans_key = ans_m.group(1).upper()
        exp_m = re.search(r'\*\*Explanation[^\n]*\*\*\s*\n*(.*)', body, re.S)
        explanation = re.sub(r'\s+', ' ', exp_m.group(1)).strip() if exp_m else ''
        sliced = parse_options_slice(body[:ans_m.start()].strip())
        if not sliced:
            continue
        stem, opts = sliced
        if len(stem) > 5 and all(len(o) > 0 for o in opts):
            questions.append({
                'qno': qno,
                'stem': stem,
                'options': opts,
                'answer': ans_key,
                'explanation': explanation,
                'paper': 'CTET Paper-I (20 Aug 2023)'
            })
    return questions

def to_structured_q(raw_q, mod_id, idx):
    stem = clean_text(raw_q['stem'])
    opts = [clean_option_text(o) for o in raw_q['options']]
    ans_key = raw_q['answer']
    ans_idx = ord(ans_key) - ord('A')
    expected_ans = opts[ans_idx]
    
    p_type = "standard"
    p_data = {}
    ml = parse_match_list(stem)
    if ml:
        p_type = "match_list"
        p_data = ml
    else:
        ar = parse_assertion_reason(stem)
        if ar:
            p_type = "assertion_reason"
            p_data = ar
        else:
            sp = parse_statement_pair(stem)
            if sp:
                p_type = "statement_pair"
                p_data = sp

    expl = raw_q.get('explanation')
    if expl:
        supporting = f"Answer: ({ans_key}) {expected_ans}\n\nExplanation: {expl}"
    else:
        supporting = f"{stem[:140]}… — Answer: ({ans_key}) {expected_ans}"

    return {
        "id": f"q_{mod_id}_{idx}",
        "stem": stem,
        "presentation_type": p_type,
        "presentation_data": p_data,
        "options": [
            {
                "key": key,
                "text": opt_text,
                "is_correct": (key == ans_key),
                "distractor_origin": "source_distractor",
                "confusion_type": "ugc_net_exam",
                "distractor_purpose": "conceptual"
            }
            for key, opt_text in zip(["A", "B", "C", "D"], opts)
        ],
        "answer_key": ans_key,
        "expected_answer": expected_ans,
        "source_title": raw_q['paper'],
        "source_page": raw_q['qno'],
        "supporting_excerpt": supporting
    }

def main():
    print("=== Extracting Uploaded CTET Papers ===")
    p19 = parse_2019(os.path.join(MEDIA_DIR, "media_1794189682242_2ed51df5.md"))
    p21 = parse_2021(os.path.join(MEDIA_DIR, "media_1794189682248_c8c36abe.md"))
    p22 = parse_2022(os.path.join(MEDIA_DIR, "media_1794189682242_85c48d89.md"))
    p23 = parse_2023(os.path.join(MEDIA_DIR, "media_1794189682245_1d2d09a8.md"))

    print(f"Parsed questions: 2019={len(p19)}, 2021={len(p21)}, 2022={len(p22)}, 2023={len(p23)}")
    total_parsed = len(p19) + len(p21) + len(p22) + len(p23)
    print(f"Total authentic questions parsed: {total_parsed}")

    papers_dict = {
        "2019": ("CTET Paper-I (8 Dec 2019)", p19),
        "2021": ("CTET Paper-I (16 Dec 2021)", p21),
        "2022": ("CTET Paper-I (21 Jan 2022)", p22),
        "2023": ("CTET Paper-I (20 Aug 2023)", p23),
    }

    SEC_KEYS = [
        ("cdp", "Child Development & Pedagogy", range(1, 31)),
        ("math", "Mathematics", range(31, 61)),
        ("evs", "Environmental Studies", range(61, 91)),
        ("eng", "Language-I (English)", range(91, 121))
    ]

    new_modules = []

    # A. 4 Full Exam Papers
    for yr, (paper_label, q_list) in papers_dict.items():
        mod_id = f"ugc_net_ctet_{yr}_full"
        structured_qs = [to_structured_q(q, mod_id, idx+1) for idx, q in enumerate(q_list)]
        mod_payload = {
            "id": mod_id,
            "title": f"Education (Code 09) - CTET Solved Papers (2019-2023) - {paper_label} Full Mock ({len(structured_qs)} MCQs)",
            "topic": "CTET Solved Papers (2019-2023)",
            "setNumber": int(yr),
            "createdAt": "2026-01-01T10:00:00.000Z",
            "durationMs": 150 * 60 * 1000, # 150 mins standard CTET
            "sectionsCount": 4,
            "inventory": {
                "total_questions": len(structured_qs),
                "unique_verified": len(structured_qs),
                "mcq_count": len(structured_qs),
                "has_answer_keys": True
            },
            "questions": structured_qs
        }
        with open(os.path.join(PWA_CTET, f"{mod_id}.json"), "w", encoding="utf-8") as f:
            json.dump(mod_payload, f, ensure_ascii=False, indent=2)
        new_modules.append(mod_payload)

    # B. 16 Sectional Sets
    for yr, (paper_label, q_list) in papers_dict.items():
        for sec_key, sec_title, q_range in SEC_KEYS:
            sec_qs = [q for q in q_list if q['qno'] in q_range]
            if not sec_qs:
                continue
            mod_id = f"ugc_net_ctet_{yr}_{sec_key}"
            structured_qs = [to_structured_q(q, mod_id, idx+1) for idx, q in enumerate(sec_qs)]
            mod_payload = {
                "id": mod_id,
                "title": f"Education (Code 09) - CTET Solved Papers (2019-2023) - {paper_label} - {sec_title} ({len(structured_qs)} MCQs)",
                "topic": "CTET Solved Papers (2019-2023)",
                "setNumber": int(yr),
                "createdAt": "2026-01-01T10:00:00.000Z",
                "durationMs": len(structured_qs) * 60 * 1000,
                "sectionsCount": 1,
                "inventory": {
                    "total_questions": len(structured_qs),
                    "unique_verified": len(structured_qs),
                    "mcq_count": len(structured_qs),
                    "has_answer_keys": True
                },
                "questions": structured_qs
            }
            with open(os.path.join(PWA_CTET, f"{mod_id}.json"), "w", encoding="utf-8") as f:
                json.dump(mod_payload, f, ensure_ascii=False, indent=2)
            new_modules.append(mod_payload)

    print(f"Created {len(new_modules)} new study set files in pwa/ctet/!")

    print("\n--- Rebuilding ctet_index.js and ctet_manifest.js ---")
    all_files = sorted(glob.glob(os.path.join(PWA_CTET, "*.json")), key=lambda p: os.path.basename(p))

    index_entries = []
    manifest_entries = []

    for path in all_files:
        with open(path, 'r', encoding='utf-8') as f:
            mod = json.load(f)
        mod_id = mod['id']
        q_count = len(mod.get('questions', []))
        index_entries.append({
            "id": mod_id,
            "title": mod['title'],
            "topic": mod['topic'],
            "setNumber": mod['setNumber'],
            "createdAt": mod['createdAt'],
            "durationMs": mod['durationMs'],
            "sectionsCount": mod['sectionsCount'],
            "questionCount": q_count,
            "revisionCount": 0,
            "revisionOnly": False
        })
        manifest_entries.append(f"./ctet/{mod_id}.json")

    hasher = hashlib.sha256()
    hasher.update(json.dumps(index_entries, sort_keys=True).encode('utf-8'))
    bundle_ver = hasher.hexdigest()[:12]

    index_path = os.path.join(PWA_DIR, "ctet_index.js")
    with open(index_path, 'w', encoding='utf-8') as f:
        f.write("/**\n * UGC NET Education (Code 09) Syllabus-Classified Index\n")
        f.write(f" * {len(index_entries)} Practice Sets across syllabus topics, {sum(e['questionCount'] for e in index_entries)} verified MCQs.\n */\n\n")
        f.write("(function (global) {\n  'use strict';\n\n")
        f.write(f'  global.CTET_BUNDLE_VERSION = "{bundle_ver}";\n')
        f.write('  global.CTET_INDEX = ')
        json.dump(index_entries, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n\n})(typeof globalThis !== "undefined" ? globalThis : this);\n')

    manifest_path = os.path.join(PWA_DIR, "ctet_manifest.js")
    with open(manifest_path, 'w', encoding='utf-8') as f:
        f.write("self.CTET_BUNDLED_BODIES = ")
        json.dump(manifest_entries, f, ensure_ascii=False, indent=2)
        f.write(";\n")

    total_q = sum(e['questionCount'] for e in index_entries)
    print(f"Total Practice Sets in app: {len(index_entries)}")
    print(f"Total Verified MCQs in app: {total_q}")
    print(f"Bundle Version: {bundle_ver}")

if __name__ == '__main__':
    main()

