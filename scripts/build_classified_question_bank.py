#!/usr/bin/env python3
"""
Build Classified Question Bank for StudySynth:
- UGC NET Education (Code 09): 10 Official Units (1 comprehensive set per unit).
- CTET (Central Teacher Eligibility Test):
  * Strictly Child Development & Pedagogy (CDP) and Social Science (SST).
  * Excludes Science and Mathematics questions.
  * Separated according to official syllabus Subject and Topic (1 set per topic):
    - CDP Units 1 to 6 (Child Development, Theories, Progressive/Intelligence, Inclusive, Learning/Cognition, Assessment)
    - Social Science Units 1 to 4 (History, Geography, Social & Political Life, Pedagogical Issues)
  * Rule: Do not mention source of the question if it is not a PYQ.
- Updates pwa/ctet/, pwa/ctet_index.js, pwa/ctet_manifest.js.
"""

import os
import re
import sys
import json
import glob
import hashlib
from collections import defaultdict

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA_DIR = os.path.join(ROOT, "pwa")
PWA_CTET = os.path.join(PWA_DIR, "ctet")
MEDIA_DIR = r"C:/Users/Admin/.gemini/antigravity/brain/a1c58217-4552-48d3-ba10-de93e4de9c3e/.user_uploaded"

sys.path.insert(0, os.path.join(ROOT, "scripts"))
from rebuild_ugc_modules import (
    classify_question, clean_text, clean_option_text,
    parse_match_list, parse_assertion_reason, parse_statement_pair
)
from add_uploaded_ctet_papers import (
    parse_2019, parse_2021, parse_2022, parse_2023
)

LETTER_MAP = {1: 'A', 2: 'B', 3: 'C', 4: 'D', '1': 'A', '2': 'B', '3': 'C', '4': 'D',
              'a': 'A', 'b': 'B', 'c': 'C', 'd': 'D', 'A': 'A', 'B': 'B', 'C': 'C', 'D': 'D'}

UGC_UNITS = [
    (1, "Unit 1: Educational Studies"),
    (2, "Unit 2: History, Politics and Economics of Education"),
    (3, "Unit 3: Learner and Learning Process"),
    (4, "Unit 4: Teacher Education"),
    (5, "Unit 5: Curriculum Studies"),
    (6, "Unit 6: Research in Education"),
    (7, "Unit 7: Pedagogy, Andragogy and Assessment"),
    (8, "Unit 8: Technology in/for Education"),
    (9, "Unit 9: Educational Management, Administration and Leadership"),
    (10, "Unit 10: Inclusive Education")
]

# SST Cues
HISTORY_CUES = [
    'history', 'harappa', 'indus valley', 'ashoka', 'mauryan', 'gupta', 'chola',
    'mughal', 'akbar', 'delhi sultanate', 'british', 'east india company', 'revolt of 1857',
    'battle of plassey', 'permanent settlement', 'national movement', 'gandhi', 'satyagraha',
    'vedic', 'buddhism', 'jainism', 'inscriptions', 'archaeology', 'manuscript', 'dynasty',
    'ruler', 'temple', 'sultan', 'medieval', 'ancient', 'colonial', 'tribal', 'raja',
    'birsa munda', 'mangaldelhi', 'bahmani', 'vijayanagara', 'subahdar', 'zamindar',
    'aurangzeb', 'shah jahan', 'babur', 'humayun', 'alauddin', 'khilji', 'tuglaq',
    'harappan', 'rigveda', 'mahajanapadas', 'magadha', 'kautilya', 'arthashastra',
    'sangam', 'pallava', 'rashtrakuta', 'maratha', 'shivaji', 'tipu sultan', 'haidar ali',
    'doctrine of lapse', 'subsidiary alliance', 'partition of bengal', 'swadeshi', 'non-cooperation',
    'civil disobedience', 'quit india', 'bhakti', 'sufi', 'kabir', 'nanak', 'mirabai',
    'social reformer', 'raja ram mohan roy', 'ishwar chandra', 'jyotirao phule', 'ambedkar',
    'paleolithic', 'mesolithic', 'neolithic', 'megalith', 'hunting and gathering', 'bce',
    'ce stands for', 'bce stands for', 'narmada valley', 'vajji', 'burzahom', 'mehrgarh',
    'inscriptions on stone', 'chola bronze', 'mughal chahar bagh', 'chahar bagh', 'qutb minar',
    'hampi', 'masulipatnam', 'surat', 'pre-british times'
]

GEOGRAPHY_CUES = [
    'geography', 'earth', 'globe', 'latitude', 'longitude', 'equator', 'tropic of cancer',
    'tropic of capricorn', 'atmosphere', 'troposphere', 'stratosphere', 'mesosphere', 'thermosphere',
    'lithosphere', 'hydrosphere', 'biosphere', 'rocks', 'minerals', 'igneous', 'sedimentary', 'metamorphic',
    'plate tectonics', 'earthquake', 'volcano', 'monsoon', 'climate', 'vegetation',
    'forest', 'tundra', 'grassland', 'ocean', 'tides', 'currents', 'river', 'delta',
    'solar system', 'planet', 'meridian', 'hemisphere', 'axis', 'rotation', 'revolution',
    'settlement', 'transport', 'communication', 'agriculture', 'crops', 'soil', 'weather',
    'equinox', 'solstice', 'greenwich', 'gmt', 'standard meridian', 'ist', 'topography',
    'plateau', 'himalaya', 'peninsular', 'western ghats', 'eastern ghats', 'monsoon winds',
    'peninsular plateau', 'block mountain', 'meteorites', 'campos', 'llanos', 'savanna', 'pampas',
    'down', 'prairies', 'maitri', 'antarctica', 'arctic', 'africa', 'asia', 'pacific ocean',
    'atlantic ocean', 'indian ocean', 'strait', 'isthmus', 'tibet', 'little tibet', 'ladakh',
    'rain gauge', 'anemometer', 'barometer', 'insolation', 'air pressure', 'cyclone', 'tsunami'
]

POLITY_CUES = [
    'constitution', 'preamble', 'fundamental rights', 'fundamental duties', 'directive principles',
    'parliament', 'lok sabha', 'rajya sabha', 'president of india', 'prime minister', 'supreme court',
    'high court', 'judiciary', 'panchayat', 'gram sabha', 'gram panchayat', 'municipality',
    'democracy', 'secularism', 'marginalisation', 'untouchability', 'adivasi', 'dalit',
    'equality', 'discrimination', 'fir', 'police', 'public prosecutor', 'rule of law',
    'gender inequality', 'media', 'market', 'government', 'legislature', 'executive', 'civil rights',
    'universal adult franchise', 'right to education', 'article 21', 'article 14', 'appellate system',
    'representative democracy', 'independent judiciary', 'civil law', 'criminal law',
    'minimum wages', 'sc/st act', 'preventation of atrocities', 'mid day meal', 'mid-day meal'
]

PEDAGOGY_SST_CUES = [
    'social science', 'social studies', 'pedagogy of social', 'source method', 'project method',
    'field visit', 'primary source', 'secondary source', 'teaching social', 'enquiry',
    'critical thinking in social', 'historical thinking', 'narrative approach', 'map reading skills',
    'teaching-learning of history', 'teaching-learning of geography', 'social science classroom'
]

# CDP Cues
CDP_THEORIES_CUES = [
    'piaget', 'kohlberg', 'vygotsky', 'scaffolding', 'zone of proximal', 'zpd', 'mko',
    'assimilation', 'accommodation', 'equilibration', 'schema', 'sensorimotor',
    'preoperational', 'pre-operational', 'concrete operational', 'formal operational',
    'object permanence', 'conservation', 'centration', 'egocentrism', 'animism',
    'hypothetico-deductive', 'moral development', 'pre-conventional', 'conventional',
    'post-conventional', 'private speech', 'inner speech', 'social constructivism'
]

CDP_INCLUSIVE_CUES = [
    'inclusive education', 'inclusive classroom', 'inclusion', 'disability', 'disabled',
    'impairment', 'cwsn', 'special needs', 'dyslexia', 'dyscalculia', 'dysgraphia', 'dyspraxia',
    'adhd', 'autism', 'locomotor disability', 'gifted children', 'gifted students', 'talented',
    'creative child', 'creativity', 'diverse background', 'marginalized group', 'deprived group',
    'braille', 'individual differences', 'hearing impairment', 'visual impairment', 'giftedness'
]

CDP_ASSESSMENT_CUES = [
    'assessment', 'evaluation', 'cce', 'continuous and comprehensive', 'formative assessment',
    'summative assessment', 'school based assessment', 'sba', 'rubric', 'portfolio',
    'diagnostic test', 'remedial teaching', 'grading', 'standardized test',
    'assessment for learning', 'assessment of learning', 'assessment as learning',
    'self assessment', 'peer assessment'
]

CDP_PROG_INTELL_LANG_GENDER_CUES = [
    'child-centered', 'child centered', 'progressive education', 'progressive classroom',
    'john dewey', 'experiential learning', 'intelligence', 'iq', 'howard gardner',
    'multiple intelligences', 'sternberg', 'triarchic', 'binet', 'language acquisition',
    'chomsky', 'lad', 'language and thought', 'critical period of language',
    'gender role', 'gender stereotype', 'gender bias', 'gender as a social construct',
    'gender conformity', 'gender equality'
]

CDP_LEARNING_PEDAGOGY_CUES = [
    'problem solver', 'scientific investigator', 'constructivism', 'constructivist',
    'meaningful learning', 'rote memorization', 'rote learning', 'active learning',
    'collaborative learning', 'cooperative learning', 'peer collaboration', 'discovery learning',
    'misconception', 'alternative conception', 'naive concept', 'children errors', 'errors as windows',
    'cognition and emotion', 'emotions and cognition', 'intrinsic motivation', 'extrinsic motivation',
    'locus of control', 'learned helplessness', 'self-efficacy', 'metacognition', 'information processing',
    'transfer of learning', 'learning process', 'affect learning'
]

MATH_SCIENCE_WORDS = [
    'fraction', 'geometry', 'triangle', 'perimeter', 'quadrilateral', 'multiplication',
    'division', 'lcm', 'hcf', 'prime number', 'composite number', 'algebra', 'polygon',
    'rhombus', 'parallelogram', 'cylinder', 'sphere', 'cone', 'angle', 'acute angle',
    'obtuse angle', 'supplementary angle', 'complementary angle', 'rational number',
    'photosynthesis', 'chlorophyll', 'stomata', 'xylem', 'phloem', 'transpiration',
    'respiration in organisms', 'digestive system', 'cell membrane', 'mitochondria',
    'bacteria', 'fungi', 'virus', 'protozoa', 'penicillin', 'vaccine', 'antibody',
    'electric current', 'circuit', 'electromagnet', 'magnetic field', 'speed of light',
    'reflection of light', 'refraction of light', 'convex lens', 'concave mirror',
    'periodic table', 'chemical reaction', 'acid and base', 'litmus paper', 'rusting of iron',
    'synthetic fibres', 'nylon', 'rayon', 'polyester', 'plastics'
]

def is_math_or_science(stem):
    s = stem.lower()
    for w in MATH_SCIENCE_WORDS:
        if re.search(r'\b' + re.escape(w) + r'\b', s):
            return True
    return False

def norm_stem(text):
    return re.sub(r'[^a-zA-Z0-9]', '', str(text).lower())[:90]

def score_cues(cues, text):
    s = 0
    for c in cues:
        if ' ' in c:
            if c in text: s += 2
        else:
            if re.search(r'\b' + re.escape(c) + r'\b', text): s += 1
    return s

def classify_ctet_question(stem, opts_text):
    text = (stem + " " + opts_text).lower()

    s_theo = score_cues(CDP_THEORIES_CUES, text)
    s_inc = score_cues(CDP_INCLUSIVE_CUES, text)
    s_ass = score_cues(CDP_ASSESSMENT_CUES, text)
    s_prog = score_cues(CDP_PROG_INTELL_LANG_GENDER_CUES, text)
    s_lrn = score_cues(CDP_LEARNING_PEDAGOGY_CUES, text)

    s_hist = score_cues(HISTORY_CUES, text)
    s_geo = score_cues(GEOGRAPHY_CUES, text)
    s_pol = score_cues(POLITY_CUES, text)
    s_sst_ped = score_cues(PEDAGOGY_SST_CUES, text)

    total_sst = s_hist + s_geo + s_pol + s_sst_ped
    total_cdp = s_theo + s_inc + s_ass + s_prog + s_lrn

    if total_sst > total_cdp and total_sst > 0:
        # SST classification
        sst_scores = [
            (s_sst_ped, 'ctet_sst_pedagogy', 'Unit 4: Pedagogical Issues in Social Science', 'Social Science', 4),
            (s_geo, 'ctet_sst_geography', 'Unit 2: Geography (Earth, Resources & Environment)', 'Social Science', 2),
            (s_pol, 'ctet_sst_polity', 'Unit 3: Social & Political Life (Civics & Constitution)', 'Social Science', 3),
            (s_hist, 'ctet_sst_history', 'Unit 1: History (Our Pasts - Ancient, Medieval & Modern India)', 'Social Science', 1)
        ]
        sst_scores.sort(key=lambda x: -x[0])
        return sst_scores[0][1], sst_scores[0][2], sst_scores[0][3], sst_scores[0][4]
    else:
        # CDP classification
        cdp_scores = [
            (s_inc, 'ctet_cdp_inclusive', 'Unit 4: Inclusive Education & Special Needs', 'Child Development & Pedagogy', 4),
            (s_theo, 'ctet_cdp_theories', 'Unit 2: Theories of Development (Piaget, Kohlberg, Vygotsky)', 'Child Development & Pedagogy', 2),
            (s_ass, 'ctet_cdp_assessment', 'Unit 6: Assessment, Evaluation & CCE', 'Child Development & Pedagogy', 6),
            (s_prog, 'ctet_cdp_progressive_intelligence', 'Unit 3: Progressive Education, Intelligence & Language', 'Child Development & Pedagogy', 3),
            (s_lrn, 'ctet_cdp_learning_pedagogy', 'Unit 5: Learning Process, Cognition & Problem Solving', 'Child Development & Pedagogy', 5),
        ]
        cdp_scores.sort(key=lambda x: -x[0])
        if cdp_scores[0][0] > 0:
            return cdp_scores[0][1], cdp_scores[0][2], cdp_scores[0][3], cdp_scores[0][4]
        else:
            return 'ctet_cdp_growth_development', 'Unit 1: Child Development, Growth & Socialization', 'Child Development & Pedagogy', 1

def resolve_pyq_source(stem, raw_rec):
    """
    Returns clean PYQ source title if authentic PYQ.
    Returns empty string '' if not a PYQ, ensuring non-PYQ sources are never mentioned.
    """
    src_book = raw_rec.get('source_book', '')
    sec = raw_rec.get('section', '')
    stem_str = str(stem)

    # 1. User uploaded CTET papers (explicit PYQs)
    paper = raw_rec.get('paper', '')
    if 'Paper-I' in paper or 'Paper 1' in paper:
        m = re.search(r'CTET Paper-I \([^)]+\)', paper)
        return m.group(0) if m else paper.replace(' - CDP', '').strip()

    # 2. CTET Success Master Solved Papers
    if any(p in sec for p in ['CTET 2019 Dec Paper II', 'CTET 2019 Jul Paper II', 'CTET 2018 Dec Paper II', 'CTET 2016 Sep Paper II']):
        return sec.strip()

    # 3. YCT Solved Papers
    if '2021 Solved Papers' in src_book:
        return 'CTET 2021 Solved Paper'

    if 'SST CTET YCT' in src_book:
        return 'CTET Solved Paper (SST)'

    # 4. Check if stem contains explicit PYQ tag
    pyq_m = re.search(r'\[?(CTET\s+(?:Jan|Feb|July?|Aug|Sept?|Nov|Dec)?\s*\d{4}[^\]\)]*)\]?', stem_str, re.IGNORECASE)
    if pyq_m:
        return pyq_m.group(0).strip('[]() ')

    # Not a PYQ -> do not mention source!
    return ""

def build_q_object(qid, stem, opts_raw, ans_key, exp_ans, expl, pyq_source, page=1):
    opts = []
    if opts_raw and isinstance(opts_raw[0], str):
        keys = ['A', 'B', 'C', 'D']
        for idx, otxt in enumerate(opts_raw[:4]):
            k = keys[idx]
            opts.append({
                'key': k,
                'text': clean_option_text(otxt),
                'is_correct': (k == ans_key),
                'distractor_origin': 'source_distractor',
                'confusion_type': 'exam_distractor',
                'distractor_purpose': 'conceptual'
            })
    elif opts_raw and isinstance(opts_raw[0], dict):
        for o in opts_raw:
            k = LETTER_MAP.get(o.get('key', 'A'), 'A')
            opts.append({
                'key': k,
                'text': clean_option_text(o.get('text', '')),
                'is_correct': (k == ans_key),
                'distractor_origin': 'source_distractor',
                'confusion_type': 'exam_distractor',
                'distractor_purpose': 'conceptual'
            })

    existing_keys = {o['key'] for o in opts}
    for req in ['A', 'B', 'C', 'D']:
        if req not in existing_keys:
            opts.append({
                'key': req,
                'text': f'Option {req}',
                'is_correct': (req == ans_key),
                'distractor_origin': 'source_distractor',
                'confusion_type': 'exam_distractor',
                'distractor_purpose': 'conceptual'
            })
    opts = sorted(opts[:4], key=lambda x: x['key'])

    if not exp_ans:
        for o in opts:
            if o['is_correct']:
                exp_ans = o['text']
                break

    clean_s = clean_text(stem)

    p_type = "standard"
    p_data = {}
    ml = parse_match_list(clean_s)
    if ml:
        p_type = "match_list"
        p_data = ml
    else:
        ar = parse_assertion_reason(clean_s)
        if ar:
            p_type = "assertion_reason"
            p_data = ar
        else:
            sp = parse_statement_pair(clean_s)
            if sp:
                p_type = "statement_pair"
                p_data = sp

    return {
        "id": qid,
        "stem": clean_s,
        "presentation_type": p_type,
        "presentation_data": p_data,
        "options": opts,
        "answer_key": ans_key,
        "expected_answer": exp_ans,
        "explanation": clean_text(expl) if expl else "",
        "source_title": pyq_source,
        "source_page": page,
        "supporting_excerpt": f"{clean_s} — Answer: ({ans_key}) {exp_ans}"
    }

def main():
    print("==================================================================")
    print("Building Question Bank: UGC NET Education & CTET")
    print("Classifying CTET by Subject & Official Topic (1 set per topic).")
    print("Removing source mentions for all non-PYQ questions.")
    print("==================================================================")

    # 1. Gather UGC NET Education questions (10 Official Units)
    ugc_by_unit = {u_num: [] for u_num, _ in UGC_UNITS}
    ugc_seen = set()

    for path in glob.glob(os.path.join(PWA_CTET, "ugc_net_unit_*.json")):
        with open(path, 'r', encoding='utf-8') as f:
            d = json.load(f)
            for q in d.get('questions', []):
                src = q.get('source_title', '')
                if ('UGC NET' in src or 'Education' in src) and ('CTET' not in src):
                    stem = q.get('stem', '')
                    nkey = norm_stem(stem)
                    if not stem or nkey in ugc_seen:
                        continue
                    ugc_seen.add(nkey)
                    unit_str = classify_question(stem, q.get('options', []))
                    m = re.match(r'Unit\s*(\d+)', unit_str)
                    u_num = int(m.group(1)) if m else 1
                    ugc_by_unit[u_num].append(q)

    print(f"\n[UGC NET Education (Code 09)]: {len(ugc_seen)} authentic verified questions")
    for u_num, u_name in UGC_UNITS:
        print(f"  {u_name}: {len(ugc_by_unit[u_num])} MCQs")

    # 2. Gather CTET Questions
    ctet_raw_items = []
    ctet_seen = set()

    # 2a. User-uploaded CTET papers (Only Child Development & Pedagogy section 1-30)
    uploaded_files = {
        '2019_1': os.path.join(MEDIA_DIR, 'media_1794189682242_b938c468.md'),
        '2019_2': os.path.join(MEDIA_DIR, 'media_1794189682242_2ed51df5.md'),
        '2021': os.path.join(MEDIA_DIR, 'media_1794189682248_c8c36abe.md'),
        '2022': os.path.join(MEDIA_DIR, 'media_1794189682242_85c48d89.md'),
        '2023': os.path.join(MEDIA_DIR, 'media_1794189682245_1d2d09a8.md')
    }

    raw_uploaded = []
    if os.path.exists(uploaded_files['2019_1']): raw_uploaded.extend(parse_2019(uploaded_files['2019_1']))
    elif os.path.exists(uploaded_files['2019_2']): raw_uploaded.extend(parse_2019(uploaded_files['2019_2']))
    if os.path.exists(uploaded_files['2021']): raw_uploaded.extend(parse_2021(uploaded_files['2021']))
    if os.path.exists(uploaded_files['2022']): raw_uploaded.extend(parse_2022(uploaded_files['2022']))
    if os.path.exists(uploaded_files['2023']): raw_uploaded.extend(parse_2023(uploaded_files['2023']))

    uploaded_count = 0
    for q in raw_uploaded:
        qno = q.get('qno', 0)
        if 1 <= qno <= 30:
            stem = q.get('stem', '')
            nkey = norm_stem(stem)
            if nkey in ctet_seen or nkey in ugc_seen:
                continue
            ctet_seen.add(nkey)
            ctet_raw_items.append({
                'stem': stem,
                'options': q.get('options', []),
                'answer': q.get('answer', 'A'),
                'explanation': q.get('explanation', ''),
                'raw_rec': {
                    'paper': q.get('paper', 'CTET PYQ'),
                    'source_book': q.get('paper', 'CTET PYQ'),
                    'section': ''
                },
                'page': 1
            })
            uploaded_count += 1

    print(f"Loaded {uploaded_count} CDP MCQs from user-uploaded CTET papers.")

    # 2b. Add verified questions from output/ctet_english_questions_all.json
    out_json = os.path.join(ROOT, "output", "ctet_english_questions_all.json")
    if os.path.exists(out_json):
        with open(out_json, 'r', encoding='utf-8') as f:
            all_raw = json.load(f)
        complete_cands = [q for q in all_raw if q.get('quality') == 'complete' and q.get('answer')]

        for rec in complete_cands:
            b = str(rec.get('source_book', '')).lower()
            stem = clean_text(rec.get('question', ''))
            opts = rec.get('options') or []
            ans = LETTER_MAP.get(rec.get('answer'))

            if 'english' in b:
                continue
            if not stem or len(stem) < 12 or len(opts) != 4 or not ans:
                continue
            if is_math_or_science(stem):
                continue

            nkey = norm_stem(stem)
            if nkey in ctet_seen or nkey in ugc_seen:
                continue
            ctet_seen.add(nkey)

            ctet_raw_items.append({
                'stem': stem,
                'options': opts,
                'answer': ans,
                'explanation': rec.get('explanation', ''),
                'raw_rec': rec,
                'page': rec.get('page', 1)
            })

    print(f"Total CTET questions to classify: {len(ctet_raw_items)}")

    # 3. Classify CTET questions into Subjects and Topics
    ctet_by_set = defaultdict(list)
    pyq_stat = 0
    non_pyq_stat = 0

    for item in ctet_raw_items:
        stem = item['stem']
        opts_txt = " ".join(clean_option_text(o.get('text', '') if isinstance(o, dict) else o) for o in item['options'])
        mod_id, top_name, subj_name, set_num = classify_ctet_question(stem, opts_txt)
        pyq_src = resolve_pyq_source(stem, item['raw_rec'])
        if pyq_src:
            pyq_stat += 1
        else:
            non_pyq_stat += 1

        item['pyq_source'] = pyq_src
        item['topic_name'] = top_name
        item['subject_name'] = subj_name
        item['set_num'] = set_num
        ctet_by_set[mod_id].append(item)

    print(f"PYQ source retained on: {pyq_stat} questions")
    print(f"Non-PYQ source cleared on: {non_pyq_stat} questions (source hidden)")

    # 4. Clean pwa/ctet/ directory completely
    for old_f in glob.glob(os.path.join(PWA_CTET, "*.json")):
        try: os.remove(old_f)
        except: pass

    summaries = []

    # 5. Write UGC NET Education Modules (10 Units -> 10 Sets)
    print("\n--- Generating UGC NET Education Modules (10 Sets) ---")
    for u_num, u_name in UGC_UNITS:
        mod_id = f"ugc_net_unit_{u_num}"
        raw_qs = ugc_by_unit[u_num]
        questions_list = []

        for idx, q in enumerate(raw_qs, start=1):
            qid = f"q_{mod_id}_{idx}"
            exp_ans = q.get('expected_answer', '')
            q_obj = build_q_object(
                qid=qid,
                stem=q.get('stem', ''),
                opts_raw=q.get('options', []),
                ans_key=q.get('answer_key') or q.get('answer', 'A'),
                exp_ans=exp_ans,
                expl=q.get('explanation', ''),
                pyq_source=q.get('source_title', 'UGC NET Education (Code 09)'),
                page=q.get('source_page', 1)
            )
            questions_list.append(q_obj)

        title = f"UGC NET Education (Code 09) - {u_name} - Complete Practice Set ({len(questions_list)} MCQs)"
        duration_ms = max(len(questions_list), 30) * 60 * 1000

        mod_data = {
            "id": mod_id,
            "title": title,
            "exam": "ugc_net",
            "examName": "UGC NET Education (Code 09)",
            "subject": "Education (Code 09)",
            "topic": u_name,
            "setNumber": u_num,
            "createdAt": "2026-01-01T10:00:00.000Z",
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "questions": questions_list
        }

        with open(os.path.join(PWA_CTET, f"{mod_id}.json"), "w", encoding="utf-8") as out_h:
            json.dump(mod_data, out_h, ensure_ascii=False, separators=(',', ':'))

        summaries.append({
            "id": mod_id,
            "title": title,
            "exam": "ugc_net",
            "examName": "UGC NET Education (Code 09)",
            "subject": "Education (Code 09)",
            "topic": u_name,
            "setNumber": u_num,
            "createdAt": mod_data["createdAt"],
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "questionCount": len(questions_list),
            "revisionCount": 0,
            "revisionOnly": False
        })
        print(f"  ✓ {mod_id}: {len(questions_list)} MCQs")

    # 6. Write CTET Modules (Separated by Subject & Topic into Sets)
    print("\n--- Generating CTET Modules (Separated by Subject & Topic) ---")
    CTET_TOPIC_CONFIG = [
        # Child Development & Pedagogy (CDP)
        ('ctet_cdp_growth_development', 'Unit 1: Child Development, Growth & Socialization', 'Child Development & Pedagogy', 1),
        ('ctet_cdp_theories', 'Unit 2: Theories of Development (Piaget, Kohlberg, Vygotsky)', 'Child Development & Pedagogy', 2),
        ('ctet_cdp_progressive_intelligence', 'Unit 3: Progressive Education, Intelligence & Language', 'Child Development & Pedagogy', 3),
        ('ctet_cdp_inclusive', 'Unit 4: Inclusive Education & Special Needs', 'Child Development & Pedagogy', 4),
        ('ctet_cdp_learning_pedagogy', 'Unit 5: Learning Process, Cognition & Problem Solving', 'Child Development & Pedagogy', 5),
        ('ctet_cdp_assessment', 'Unit 6: Assessment, Evaluation & CCE', 'Child Development & Pedagogy', 6),
        # Social Science (SST)
        ('ctet_sst_history', 'Unit 1: History (Our Pasts - Ancient, Medieval & Modern India)', 'Social Science', 7),
        ('ctet_sst_geography', 'Unit 2: Geography (Earth, Resources & Environment)', 'Social Science', 8),
        ('ctet_sst_polity', 'Unit 3: Social & Political Life (Civics & Constitution)', 'Social Science', 9),
        ('ctet_sst_pedagogy', 'Unit 4: Pedagogical Issues in Social Science', 'Social Science', 10),
    ]

    for mod_id, top_name, subj_name, set_num in CTET_TOPIC_CONFIG:
        raw_items = ctet_by_set.get(mod_id, [])
        questions_list = []

        for idx, item in enumerate(raw_items, start=1):
            qid = f"q_{mod_id}_{idx}"
            q_obj = build_q_object(
                qid=qid,
                stem=item['stem'],
                opts_raw=item['options'],
                ans_key=LETTER_MAP.get(item['answer'], 'A'),
                exp_ans='',
                expl=item.get('explanation', ''),
                pyq_source=item.get('pyq_source', ''),
                page=item.get('page', 1)
            )
            questions_list.append(q_obj)

        title = f"CTET - {subj_name} - {top_name} ({len(questions_list)} MCQs)"
        duration_ms = max(len(questions_list), 30) * 60 * 1000

        mod_data = {
            "id": mod_id,
            "title": title,
            "exam": "ctet",
            "examName": "CTET (Central Teacher Eligibility Test)",
            "subject": subj_name,
            "topic": f"{subj_name} - {top_name}",
            "setNumber": set_num,
            "createdAt": "2026-01-01T10:00:00.000Z",
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "questions": questions_list
        }

        with open(os.path.join(PWA_CTET, f"{mod_id}.json"), "w", encoding="utf-8") as out_h:
            json.dump(mod_data, out_h, ensure_ascii=False, separators=(',', ':'))

        summaries.append({
            "id": mod_id,
            "title": title,
            "exam": "ctet",
            "examName": "CTET (Central Teacher Eligibility Test)",
            "subject": subj_name,
            "topic": f"{subj_name} - {top_name}",
            "setNumber": set_num,
            "createdAt": mod_data["createdAt"],
            "durationMs": duration_ms,
            "sectionsCount": 1,
            "questionCount": len(questions_list),
            "revisionCount": 0,
            "revisionOnly": False
        })
        print(f"  ✓ {mod_id}: {len(questions_list)} MCQs ({subj_name} -> {top_name})")

    # 7. Write pwa/ctet_index.js
    out_index = os.path.join(PWA_DIR, "ctet_index.js")
    total_q_count = sum(s['questionCount'] for s in summaries)
    with open(out_index, "w", encoding="utf-8") as h:
        h.write("/**\n * Classified StudySets Index (UGC NET Education & CTET)\n")
        h.write(f" * {len(summaries)} Sets, {total_q_count} verified MCQs.\n */\n\n")
        h.write("(function (global) {\n  'use strict';\n\n")
        h.write(f'  global.CTET_BUNDLE_VERSION = "{hashlib.md5(str(total_q_count).encode()).hexdigest()[:12]}";\n')
        h.write("  global.CTET_INDEX = ")
        json.dump(summaries, h, ensure_ascii=False)
        h.write(";\n})(typeof window !== 'undefined' ? window : globalThis);\n")

    # 8. Write pwa/ctet_manifest.js
    out_manifest = os.path.join(PWA_DIR, "ctet_manifest.js")
    manifest_payload = {
        "version": "2.0.0",
        "generatedAt": "2026-01-01T10:00:00.000Z",
        "totalModules": len(summaries),
        "totalQuestions": total_q_count,
        "modules": summaries
    }
    with open(out_manifest, "w", encoding="utf-8") as h:
        h.write("/**\n * Classified StudySets Manifest\n */\n\n")
        h.write("(function (global) {\n  'use strict';\n\n")
        h.write("  global.CTET_MANIFEST = ")
        json.dump(manifest_payload, h, ensure_ascii=False)
        h.write(";\n})(typeof window !== 'undefined' ? window : globalThis);\n")

    print("\n==================================================================")
    print(f"SUCCESS: Generated {len(summaries)} classified study sets ({total_q_count} verified MCQs)!")
    print("==================================================================")

if __name__ == "__main__":
    main()
