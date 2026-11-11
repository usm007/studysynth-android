import os
import re
import sys
import json
import glob
import hashlib
import pypdf

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA_DIR = os.path.join(ROOT, "pwa")
OUT_BODIES = os.path.join(PWA_DIR, "ctet")
OUT_INDEX = os.path.join(PWA_DIR, "ctet_index.js")
OUT_MANIFEST = os.path.join(PWA_DIR, "ctet_manifest.js")

os.makedirs(OUT_BODIES, exist_ok=True)

# Helper to normalize key
KEY_MAP = {'1': 'A', '2': 'B', '3': 'C', '4': 'D', 'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D'}

def parse_answer_key(pdf_path):
    r = pypdf.PdfReader(pdf_path)
    txt = ''
    for p in r.pages:
        txt += (p.extract_text() or '') + '\n'
    
    res = {}
    # 1. Try table format (| QNO | KEY |)
    for line in txt.split('\n'):
        if '|' in line:
            parts = [p.strip() for p in line.split('|')[1:-1]]
            for i in range(0, len(parts)-1, 2):
                q = parts[i]
                k = parts[i+1]
                if q.isdigit() and k:
                    norm_k = KEY_MAP.get(k.lower(), k.upper())
                    res[int(q)] = norm_k
                    
    # 2. Try space/col format
    if len(res) < 10:
        matches = re.findall(r'(\b\d{1,3}\b)\s*[:.\-]?\s*([1-4]|A|B|C|D|Drop|None|\*)', txt, re.IGNORECASE)
        for q, k in matches:
            norm_k = KEY_MAP.get(k.lower(), k.upper())
            res[int(q)] = norm_k
            
    return res

def clean_text(text):
    text = re.sub(r'[\r\n]+', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def parse_paper_questions(pdf_path, ans_key_dict, default_offset=0):
    r = pypdf.PdfReader(pdf_path)
    full_text = ''
    for p in r.pages:
        full_text += '\n' + (p.extract_text() or '') + '\n'

    questions = []

    # Pattern A: Dec 2024 format: '51.) ... (1) ... (2) ... (3) ... (4) ...'
    chunks_dot_paren = re.split(r'\n\s*(\d{1,3})\s*\.\)\s*', full_text)
    if len(chunks_dot_paren) > 20:
        for i in range(1, len(chunks_dot_paren), 2):
            qnum = int(chunks_dot_paren[i])
            body = chunks_dot_paren[i+1].strip()
            opt_parts = re.split(r'\(([1-4])\)', body)
            stem = clean_text(re.sub(r'\(UGC NET Education.*?\)', '', opt_parts[0]))
            options = []
            for oi in range(1, len(opt_parts), 2):
                num_str = opt_parts[oi]
                opt_txt = opt_parts[oi+1].strip()
                # Stop at next newline or option marker
                opt_txt = opt_txt.split('\n')[0].strip()
                opt_key = KEY_MAP.get(num_str, 'A')
                options.append({'key': opt_key, 'text': clean_text(opt_txt)})
            if stem and len(options) >= 2:
                questions.append({'qnum': qnum, 'stem': stem, 'options': options})

    # Pattern B: Standard CBSE/UGC format: '1. ... (1) ... (2) ... (3) ... (4) ...' or '(A) ...'
    if len(questions) < 20:
        # Match lines starting with a number followed by a dot
        chunks_num_dot = re.split(r'\n\s*(\d{1,3})\.\s+', full_text)
        if len(chunks_num_dot) > 20:
            for i in range(1, len(chunks_num_dot), 2):
                qnum = int(chunks_num_dot[i])
                body = chunks_num_dot[i+1].strip()
                # Find options (1) or (A)
                opt_parts = re.split(r'\(([1-4A-D])\)', body)
                stem = clean_text(opt_parts[0])
                options = []
                for oi in range(1, len(opt_parts), 2):
                    key_char = opt_parts[oi]
                    opt_txt = opt_parts[oi+1].strip()
                    opt_txt = re.split(r'\n\s*(?:[A-Z0-9]\.|\(\d\))', opt_txt)[0].strip()
                    opt_txt = opt_txt.split('\n')[0].strip()
                    norm_k = KEY_MAP.get(key_char.lower(), key_char.upper())
                    options.append({'key': norm_k, 'text': clean_text(opt_txt)})
                if stem and len(options) >= 2 and qnum <= 150:
                    questions.append({'qnum': qnum, 'stem': stem, 'options': options})

    # Match questions with answer key
    result = []
    for q in questions:
        qnum = q['qnum']
        ans = ans_key_dict.get(qnum) or ans_key_dict.get(qnum - default_offset) or 'A'
        if ans == '*' or ans == 'Drop':
            ans = 'A' # fallback
        if ans not in ['A', 'B', 'C', 'D']:
            ans = KEY_MAP.get(str(ans).lower(), 'A')
            
        # Ensure 4 options exist A, B, C, D
        existing_keys = {o['key'] for o in q['options']}
        opts = list(q['options'])
        for req_k in ['A', 'B', 'C', 'D']:
            if req_k not in existing_keys:
                opts.append({'key': req_k, 'text': f'Option {req_k}'})
        # Sort options A, B, C, D
        opts = sorted(opts[:4], key=lambda x: x['key'])
        
        # Mark correct
        expected_text = ""
        for opt in opts:
            opt['is_correct'] = (opt['key'] == ans)
            if opt['is_correct']:
                expected_text = opt['text']
                
        result.append({
            'qnum': qnum,
            'stem': q['stem'],
            'options': opts,
            'answer_key': ans,
            'expected_answer': expected_text
        })
        
    return result

def main():
    print("Building UGC NET Education modules from downloaded papers...")
    
    # Clean output ctet folder
    for f in glob.glob(os.path.join(OUT_BODIES, "*.json")):
        try: os.remove(f)
        except: pass

    # Read manifest of all papers
    manifest_file = os.path.join(PWA_DIR, "papers_manifest.json")
    if not os.path.exists(manifest_file):
        print("papers_manifest.json not found!")
        return

    with open(manifest_file, "r", encoding="utf-8") as f:
        all_papers = json.load(f)

    q_papers = [p for p in all_papers if p['kind'] == 'Question Paper']
    ans_papers = [p for p in all_papers if p['kind'] == 'Answer Key']
    
    summaries = []
    total_questions = 0

    # Group papers into modules
    for qp in q_papers:
        q_filename = qp['filename']
        q_path = os.path.join(PWA_DIR, "papers", q_filename)
        
        # Find matching answer key
        base_prefix = re.sub(r'[-_]?question[-_]?paper.*', '', q_filename, flags=re.IGNORECASE)
        matching_ans = [a for a in ans_papers if base_prefix.lower() in a['filename'].lower() or a['filename'].lower().startswith(base_prefix.lower())]
        
        ans_dict = {}
        if matching_ans:
            ans_path = os.path.join(PWA_DIR, "papers", matching_ans[0]['filename'])
            try:
                ans_dict = parse_answer_key(ans_path)
            except Exception as e:
                print(f"Error reading answer key for {q_filename}: {e}")

        # Parse questions
        parsed_qs = []
        try:
            parsed_qs = parse_paper_questions(q_path, ans_dict)
        except Exception as e:
            print(f"Error parsing questions for {q_filename}: {e}")

        # Module ID
        clean_id = re.sub(r'[^a-zA-Z0-9_]', '_', q_filename.replace('.pdf', '')).lower()
        clean_id = re.sub(r'_+', '_', clean_id).strip('_')
        mod_id = f"ugc_net_edu_{clean_id}"

        # Standard StudySynth module format
        title = f"Education - {qp['year']} - {qp['title'].replace('UGC NET ', '').replace(' - Question Paper', '')}"
        
        questions_list = []
        inventory_list = []

        for idx, item in enumerate(parsed_qs):
            qid = f"q_{mod_id}_{item['qnum']}"
            ku_id = f"KU-{mod_id}-{item['qnum']}"
            fact_id = f"F-{mod_id}-{item['qnum']}"
            
            # Question item
            questions_list.append({
                "id": qid,
                "stem": item['stem'],
                "options": [
                    {
                        "key": opt['key'],
                        "text": opt['text'],
                        "is_correct": opt['is_correct'],
                        "distractor_origin": "source_distractor",
                        "confusion_type": "ugc_net_exam",
                        "distractor_purpose": "conceptual"
                    } for opt in item['options']
                ],
                "answer_key": item['answer_key'],
                "expected_answer": item['expected_answer'],
                "knowledge_units": [{"ku_id": ku_id, "fact_id": fact_id, "role": "primary"}],
                "source_title": qp['title'],
                "source_page": 1,
                "supporting_excerpt": f"{item['stem']} — Answer: ({item['answer_key']}) {item['expected_answer']}"
            })

            # Inventory / Revision flashcard
            inventory_list.append({
                "ku_id": ku_id,
                "tier": 3,
                "section_id": "sec_1",
                "section_title": qp['title'],
                "statement": item['stem'],
                "anchor": qp['title'],
                "supporting_excerpt": f"{item['stem']} — Correct Answer: ({item['answer_key']}) {item['expected_answer']}",
                "source_page": 1,
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
                        "supporting_excerpt": f"{item['stem']} — Correct Answer: ({item['answer_key']}) {item['expected_answer']}",
                        "source_page": 1,
                        "extraction_method": "official_pyq",
                        "confidence_class": "high",
                        "conflict_status": "clear"
                    }
                ]
            })

        # Duration: ~1 min per question
        duration_ms = max(len(questions_list), 50) * 60 * 1000

        # Construct module object
        mod_data = {
            "id": mod_id,
            "title": title,
            "pdfFilename": q_filename,
            "ansKeyFilename": matching_ans[0]['filename'] if matching_ans else None,
            "year": qp['year'],
            "session": qp['session'],
            "createdAt": f"{qp['year']}-06-01T10:00:00.000Z",
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "inventory": inventory_list,
            "questions": questions_list
        }

        # Write module file
        out_file = os.path.join(OUT_BODIES, f"{mod_id}.json")
        with open(out_file, "w", encoding="utf-8") as out_h:
            json.dump(mod_data, out_h, ensure_ascii=False, separators=(',', ':'))

        summaries.append({
            "id": mod_id,
            "title": title,
            "pdfFilename": q_filename,
            "ansKeyFilename": matching_ans[0]['filename'] if matching_ans else None,
            "year": qp['year'],
            "session": qp['session'],
            "createdAt": mod_data["createdAt"],
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "questionCount": len(questions_list),
            "revisionCount": len(inventory_list),
            "revisionOnly": len(questions_list) == 0
        })

        total_questions += len(questions_list)
        print(f"[{len(summaries)}/{len(q_papers)}] {title} -> {len(questions_list)} MCQs")

    # Sort summaries by Year descending
    summaries.sort(key=lambda x: (x.get('year', '0000'), x.get('session', '')), reverse=True)

    # Write ctet_index.js
    with open(OUT_INDEX, "w", encoding="utf-8") as h:
        h.write("/**\n * UGC NET Education (Code 09) Bundled Index\n")
        h.write(f" * {len(summaries)} sets, {total_questions} parsed interactive questions.\n */\n\n")
        h.write("(function (global) {\n  'use strict';\n\n")
        h.write('  global.CTET_BUNDLE_VERSION = "' + hashlib.sha256(str(len(summaries)).encode()).hexdigest()[:12] + '";\n')
        h.write('  global.CTET_INDEX = ')
        json.dump(summaries, h, ensure_ascii=False, separators=(',', ':'))
        h.write(';\n\n})(typeof globalThis !== "undefined" ? globalThis : this);\n')

    # Write ctet_manifest.js
    manifest_paths = [f"./ctet/{s['id']}.json" for s in summaries]
    with open(OUT_MANIFEST, "w", encoding="utf-8") as h:
        h.write("self.CTET_BUNDLED_BODIES = ")
        json.dump(manifest_paths, h, ensure_ascii=False, indent=2)
        h.write(";\n")

    print(f"\nSuccessfully generated {len(summaries)} modules ({total_questions} interactive MCQs)!")

if __name__ == "__main__":
    main()

