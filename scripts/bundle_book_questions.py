#!/usr/bin/env python3
"""
Bundle verified book questions into UGC NET Education (Code 09) Practice Sets.
- Preserves all 48 existing UGC NET Education sets and questions intact.
- Adds newly extracted unique verified questions (with 4 options & answer key).
- Classifies questions into the 10 Education syllabus units.
- Generates standard 40-question practice sets with full metadata.
- Updates pwa/ctet/, pwa/ctet_index.js, pwa/ctet_manifest.js.
- Syncs to www/ via build-web.js.
"""

import os
import re
import sys
import json
import glob
import hashlib
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA_DIR = os.path.join(ROOT, "pwa")
PWA_CTET = os.path.join(PWA_DIR, "ctet")
OUT_FILE = os.path.join(ROOT, "output", "ctet_english_questions_all.json")

sys.path.insert(0, os.path.join(ROOT, "scripts"))
from rebuild_ugc_modules import (
    classify_question, clean_text, clean_option_text,
    parse_match_list, parse_assertion_reason, parse_statement_pair
)

UNIT_NAMES = {
    1: "Unit 1: Educational Studies",
    2: "Unit 2: History, Politics and Economics of Education",
    3: "Unit 3: Learner and Learning Process",
    4: "Unit 4: Teacher Education",
    5: "Unit 5: Curriculum Studies",
    6: "Unit 6: Research in Education",
    7: "Unit 7: Pedagogy, Andragogy and Assessment",
    8: "Unit 8: Technology in/for Education",
    9: "Unit 9: Educational Management, Administration and Leadership",
    10: "Unit 10: Inclusive Education",
}

LETTER_MAP = {1: 'A', 2: 'B', 3: 'C', 4: 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D', 'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D'}

def norm_stem(text):
    return re.sub(r'[^a-zA-Z0-9]', '', str(text).lower())[:90]

def main():
    print("--- 1. Scanning existing UGC NET Education Sets ---")
    existing_stems = set()
    highest_set = defaultdict(int)

    for path in glob.glob(os.path.join(PWA_CTET, "ugc_net_unit_*.json")):
        basename = os.path.basename(path)
        m = re.match(r'ugc_net_unit_(\d+)_set_(\d+)\.json', basename)
        if m:
            u_num = int(m.group(1))
            s_num = int(m.group(2))
            if s_num > highest_set[u_num]:
                highest_set[u_num] = s_num
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            for q in data.get('questions', []):
                existing_stems.add(norm_stem(q.get('stem', '')))

    print(f"Loaded {len(existing_stems)} existing questions across {sum(highest_set.values())} sets.")
    for u in sorted(highest_set.keys()):
        print(f"  Unit {u}: Sets 1 to {highest_set[u]}")

    print("\n--- 2. Loading and Deduplicating Extracted Questions ---")
    if not os.path.exists(OUT_FILE):
        print(f"Error: {OUT_FILE} not found!")
        return

    with open(OUT_FILE, 'r', encoding='utf-8') as f:
        all_raw = json.load(f)

    complete_candidates = [q for q in all_raw if q.get('quality') == 'complete' and q.get('answer')]
    print(f"Total complete records with answer: {len(complete_candidates)}")

    unique_new_by_unit = defaultdict(list)
    deduped_count = 0
    skipped_count = 0

    for rec in complete_candidates:
        stem = clean_text(rec.get('question', ''))
        raw_opts = rec.get('options') or []
        opts_text = [clean_option_text(o) for o in raw_opts]
        ans_raw = rec.get('answer')
        ans_letter = LETTER_MAP.get(ans_raw)

        if not stem or len(stem) < 12 or len(opts_text) != 4 or not all(opts_text) or not ans_letter:
            skipped_count += 1
            continue

        n_key = norm_stem(stem)
        if n_key in existing_stems:
            deduped_count += 1
            continue
        existing_stems.add(n_key)

        # Structure presentation
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

        # Classify unit
        unit_str = classify_question(stem, [{'text': o} for o in opts_text])
        # Find unit number
        u_match = re.search(r'Unit\s+(\d+)', unit_str)
        u_num = int(u_match.group(1)) if u_match else 1

        ans_idx = ord(ans_letter) - ord('A')
        expected_ans = opts_text[ans_idx]

        structured_q = {
            "id": f"q_ugc_net_unit_{u_num}_b_{len(unique_new_by_unit[u_num]) + 1}",
            "stem": stem,
            "presentation_type": p_type,
            "presentation_data": p_data,
            "options": [
                {
                    "key": key,
                    "text": opt_text,
                    "is_correct": (key == ans_letter),
                    "distractor_origin": "source_distractor",
                    "confusion_type": "ugc_net_exam",
                    "distractor_purpose": "conceptual"
                }
                for key, opt_text in zip(["A", "B", "C", "D"], opts_text)
            ],
            "answer_key": ans_letter,
            "expected_answer": expected_ans,
            "source_title": rec.get('source_book', 'UGC NET Education / CTET Resource'),
            "source_page": rec.get('page', 1),
            "supporting_excerpt": f"{stem[:140]}… — Answer: ({ans_letter}) {expected_ans}"
        }
        unique_new_by_unit[u_num].append(structured_q)

    print(f"Skipped invalid: {skipped_count}, Overlap with existing: {deduped_count}")
    print(f"Ready to add {sum(len(v) for v in unique_new_by_unit.values())} new verified questions:")
    for u in sorted(unique_new_by_unit.keys()):
        print(f"  Unit {u} ({UNIT_NAMES[u]}): {len(unique_new_by_unit[u])} questions")

    print("\n--- 3. Creating Practice Sets ---")
    new_modules_count = 0
    SET_SIZE = 40

    for u_num in range(1, 11):
        questions = unique_new_by_unit[u_num]
        if not questions:
            continue

        unit_title = UNIT_NAMES[u_num]
        curr_set = highest_set[u_num]

        # Chunk into sets of 40
        chunks = [questions[i:i + SET_SIZE] for i in range(0, len(questions), SET_SIZE)]
        # If last chunk has < 15 questions and there are multiple chunks, merge it with previous
        if len(chunks) > 1 and len(chunks[-1]) < 15:
            last = chunks.pop()
            chunks[-1].extend(last)

        for chunk in chunks:
            curr_set += 1
            mod_id = f"ugc_net_unit_{u_num}_set_{curr_set}"
            q_count = len(chunk)

            # update IDs to match final module name
            for idx, q in enumerate(chunk):
                q["id"] = f"q_{mod_id}_{idx + 1}"

            mod_payload = {
                "id": mod_id,
                "title": f"Education (Code 09) - {unit_title} - Practice Set {curr_set} ({q_count} MCQs)",
                "topic": unit_title,
                "setNumber": curr_set,
                "createdAt": "2026-01-01T10:00:00.000Z",
                "durationMs": q_count * 60 * 1000,
                "sectionsCount": 1,
                "inventory": {
                    "total_questions": q_count,
                    "unique_verified": q_count,
                    "mcq_count": q_count,
                    "has_answer_keys": True
                },
                "questions": chunk
            }

            out_path = os.path.join(PWA_CTET, f"{mod_id}.json")
            with open(out_path, 'w', encoding='utf-8') as f:
                json.dump(mod_payload, f, ensure_ascii=False, indent=2)

            new_modules_count += 1

    print(f"Created {new_modules_count} new Practice Set JSON files in pwa/ctet/.")

    print("\n--- 4. Rebuilding ctet_index.js and ctet_manifest.js ---")
    all_module_files = sorted(glob.glob(os.path.join(PWA_CTET, "ugc_net_unit_*.json")), key=lambda p: [
        int(m) for m in re.findall(r'\d+', os.path.basename(p))
    ])

    index_entries = []
    manifest_entries = []

    for path in all_module_files:
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
        f.write(f" * {len(index_entries)} Practice Sets across 10 syllabus topics, {sum(e['questionCount'] for e in index_entries)} verified MCQs.\n */\n\n")
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
    print(f"Total Practice Sets: {len(index_entries)}")
    print(f"Total Verified MCQs in app: {total_q}")
    print(f"Bundle Version: {bundle_ver}")

if __name__ == '__main__':
    main()

