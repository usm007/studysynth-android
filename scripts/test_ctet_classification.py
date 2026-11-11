import json
import re
from collections import Counter

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

raw_map = {}
for r in all_raw:
    stem = r.get('question', '').strip().lower()
    norm = re.sub(r'[^a-z0-9]', '', stem)[:80]
    if norm and norm not in raw_map:
        raw_map[norm] = r

# Classification rules
SST_HISTORY = [
    'history', 'harappa', 'indus valley', 'ashoka', 'mauryan', 'gupta', 'chola',
    'mughal', 'akbar', 'delhi sultanate', 'british', 'east india company', 'revolt of 1857',
    'battle of plassey', 'permanent settlement', 'national movement', 'gandhi', 'satyagraha',
    'vedic', 'buddhism', 'jainism', 'inscriptions', 'archaeology', 'monuscript', 'dynasty',
    'ruler', 'temple', 'sultan', 'medieval', 'ancient', 'colonial', 'tribal', 'raja',
    'birsa munda', 'mangaldelhi', 'bahmani', 'vijayanagara', 'subahdar', 'zamindar'
]

SST_GEOGRAPHY = [
    'geography', 'earth', 'globe', 'latitude', 'longitude', 'equator', 'tropic of cancer',
    'tropic of capricorn', 'atmosphere', 'troposphere', 'stratosphere', 'lithosphere',
    'hydrosphere', 'biosphere', 'rocks', 'minerals', 'igneous', 'sedimentary', 'metamorphic',
    'plate tectonics', 'earthquake', 'volcano', 'monsoon', 'climate', 'vegetation',
    'forest', 'tundra', 'grassland', 'ocean', 'tides', 'currents', 'river', 'delta',
    'solar system', 'planet', 'meridian', 'hemisphere', 'axis', 'rotation', 'revolution',
    'settlement', 'transport', 'communication', 'agriculture', 'crops', 'soil'
]

SST_POLITY = [
    'constitution', 'preamble', 'fundamental rights', 'fundamental duties', 'directive principles',
    'parliament', 'lok sabha', 'rajya sabha', 'president', 'prime minister', 'supreme court',
    'high court', 'judiciary', 'panchayat', 'gram sabha', 'gram panchayat', 'municipality',
    'democracy', 'secularism', 'marginalisation', 'untouchability', 'adivasi', 'dalit',
    'equality', 'discrimination', 'fir', 'police', 'public prosecutor', 'rule of law',
    'gender', 'media', 'market', 'government', 'legislature', 'executive'
]

SST_PEDAGOGY = [
    'social science', 'social studies', 'pedagogy of social', 'source method', 'project method',
    'field visit', 'primary source', 'secondary source', 'teaching social', 'enquiry',
    'critical thinking in social', 'historical thinking', 'narrative approach', 'map reading skills'
]

# CDP Topics
CDP_INCLUSIVE = [
    'inclusive', 'inclusion', 'disability', 'disabled', 'impairment', 'cwsn', 'special needs',
    'dyslexia', 'dyscalculia', 'dysgraphia', 'dyspraxia', 'adhd', 'autism', 'locomotor',
    'gifted', 'talented', 'creative child', 'creativity', 'diverse background', 'marginalized',
    'disadvantaged', 'deprived', 'braille', 'individual difference'
]

CDP_LEARNING_PEDAGOGY = [
    'problem solver', 'scientific investigator', 'scaffolding', 'zone of proximal', 'zpd',
    'vygotsky', 'piaget', 'kohlberg', 'constructivism', 'constructivist', 'assimilation',
    'accommodation', 'schema', 'sensorimotor', 'preoperational', 'concrete operational',
    'formal operational', 'moral development', 'learning process', 'intrinsic motivation',
    'extrinsic motivation', 'cognition', 'emotion', 'memory', 'forgetting', 'transfer of learning',
    'misconception', 'alternative conception', 'meaningful learning', 'rote', 'active learning',
    'collaborative learning', 'peer collaboration', 'socio-cultural'
]

CDP_ASSESSMENT = [
    'assessment', 'evaluation', 'cce', 'formative', 'summative', 'school based assessment',
    'sba', 'rubric', 'portfolio', 'diagnostic', 'remedial', 'grading', 'standardized test',
    'open ended', 'closed ended', 'feedback'
]

CDP_DEVELOPMENT = [
    'development', 'growth', 'heredity', 'environment', 'nature vs nurture', 'socialization',
    'primary socialization', 'secondary socialization', 'peers', 'family', 'parents',
    'school as agent', 'cephalocaudal', 'proximodistal', 'motor development', 'stages of development',
    'infancy', 'early childhood', 'middle childhood', 'adolescence', 'gender role', 'gender stereotype',
    'gender bias', 'language acquisition', 'language development', 'critical period', 'intelligence',
    'gardner', 'multiple intelligences', 'iq', 'sternberg', 'child centered', 'progressive education',
    'dewey'
]

def classify_question_detailed(stem, raw_book, raw_sec):
    s = stem.lower()
    b = (raw_book or '').lower()
    sec = (raw_sec or '').lower()
    
    # 1. First determine Subject: CDP vs SST
    is_sst = False
    if 'sst' in b or 'social' in b:
        is_sst = True
    elif any(w in s for w in SST_HISTORY + SST_GEOGRAPHY + SST_POLITY + SST_PEDAGOGY):
        # But ensure it's not a CDP question with 'social'
        if not any(k in s for k in ['piaget', 'vygotsky', 'kohlberg', 'scaffolding', 'zpd', 'schema', 'assimilation', 'sensorimotor', 'development', 'cognitive', 'inclusive', 'dyslexia']):
            is_sst = True
            
    if is_sst:
        # Determine SST Topic
        hist_score = sum(1 for w in SST_HISTORY if re.search(r'\b' + re.escape(w) + r'\b', s))
        geo_score = sum(1 for w in SST_GEOGRAPHY if re.search(r'\b' + re.escape(w) + r'\b', s))
        pol_score = sum(1 for w in SST_POLITY if re.search(r'\b' + re.escape(w) + r'\b', s))
        ped_score = sum(1 for w in SST_PEDAGOGY if re.search(r'\b' + re.escape(w) + r'\b', s))
        
        scores = [
            (ped_score, 'sst_pedagogy', 'Social Science - Pedagogical Issues'),
            (geo_score, 'sst_geography', 'Social Science - Geography (Earth & Environment)'),
            (pol_score, 'sst_polity', 'Social Science - Social and Political Life (Civics)'),
            (hist_score, 'sst_history', 'Social Science - History (Our Pasts)')
        ]
        scores.sort(key=lambda x: -x[0])
        if scores[0][0] > 0:
            return 'sst', scores[0][1], scores[0][2]
        else:
            return 'sst', 'sst_history', 'Social Science - History (Our Pasts)'
    else:
        # Determine CDP Topic
        inc_score = sum(1 for w in CDP_INCLUSIVE if re.search(r'\b' + re.escape(w) + r'\b', s))
        lrn_score = sum(1 for w in CDP_LEARNING_PEDAGOGY if re.search(r'\b' + re.escape(w) + r'\b', s))
        ass_score = sum(1 for w in CDP_ASSESSMENT if re.search(r'\b' + re.escape(w) + r'\b', s))
        dev_score = sum(1 for w in CDP_DEVELOPMENT if re.search(r'\b' + re.escape(w) + r'\b', s))
        
        scores = [
            (inc_score, 'cdp_inclusive', 'CDP - Inclusive Education & Special Needs'),
            (ass_score, 'cdp_assessment', 'CDP - Assessment and Evaluation'),
            (lrn_score, 'cdp_learning', 'CDP - Learning Process and Pedagogy'),
            (dev_score, 'cdp_development', 'CDP - Child Development, Theories & Growth')
        ]
        scores.sort(key=lambda x: -x[0])
        if scores[0][0] > 0:
            return 'cdp', scores[0][1], scores[0][2]
        else:
            return 'cdp', 'cdp_development', 'CDP - Child Development, Theories & Growth'

counts = Counter()
for q in ctet_data['questions']:
    stem = q.get('stem', '')
    norm = re.sub(r'[^a-z0-9]', '', stem.lower())[:80]
    raw = raw_map.get(norm, {})
    subj, top_id, top_name = classify_question_detailed(stem, raw.get('source_book', ''), raw.get('section', ''))
    counts[f"[{subj.upper()}] {top_name}"] += 1

print("\n--- CTET Topics Distribution ---")
for k, v in counts.most_common():
    print(f"{v:5d}: {k}")

