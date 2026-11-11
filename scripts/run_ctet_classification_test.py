import json
import re
from collections import Counter, defaultdict

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

# SST Lexicons
SST_HISTORY = [
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
    'social reformer', 'raja ram mohan roy', 'ishwar chandra', 'jyotirao phule', 'ambedkar'
]

SST_GEOGRAPHY = [
    'geography', 'earth', 'globe', 'latitude', 'longitude', 'equator', 'tropic of cancer',
    'tropic of capricorn', 'atmosphere', 'troposphere', 'stratosphere', 'mesosphere', 'thermosphere',
    'lithosphere', 'hydrosphere', 'biosphere', 'rocks', 'minerals', 'igneous', 'sedimentary', 'metamorphic',
    'plate tectonics', 'earthquake', 'volcano', 'monsoon', 'climate', 'vegetation',
    'forest', 'tundra', 'grassland', 'ocean', 'tides', 'currents', 'river', 'delta',
    'solar system', 'planet', 'meridian', 'hemisphere', 'axis', 'rotation', 'revolution',
    'settlement', 'transport', 'communication', 'agriculture', 'crops', 'soil', 'weather',
    'equinox', 'solstice', 'greenwich', 'gmt', 'standard meridian', 'ist', 'topography',
    'plateau', 'himalaya', 'peninsular', 'western ghats', 'eastern ghats', 'monsoon winds'
]

SST_POLITY = [
    'constitution', 'preamble', 'fundamental rights', 'fundamental duties', 'directive principles',
    'parliament', 'lok sabha', 'rajya sabha', 'president', 'prime minister', 'supreme court',
    'high court', 'judiciary', 'panchayat', 'gram sabha', 'gram panchayat', 'municipality',
    'democracy', 'secularism', 'marginalisation', 'untouchability', 'adivasi', 'dalit',
    'equality', 'discrimination', 'fir', 'police', 'public prosecutor', 'rule of law',
    'gender', 'media', 'market', 'government', 'legislature', 'executive', 'civil rights',
    'universal adult franchise', 'right to education', 'rte act', 'article 21', 'article 14'
]

SST_PEDAGOGY = [
    'social science', 'social studies', 'pedagogy of social', 'source method', 'project method',
    'field visit', 'primary source', 'secondary source', 'teaching social', 'enquiry',
    'critical thinking in social', 'historical thinking', 'narrative approach', 'map reading skills',
    'teaching-learning of history', 'teaching-learning of geography', 'social science classroom'
]

# CDP Lexicons
CDP_INCLUSIVE = [
    'inclusive', 'inclusion', 'disability', 'disabled', 'impairment', 'cwsn', 'special needs',
    'dyslexia', 'dyscalculia', 'dysgraphia', 'dyspraxia', 'adhd', 'autism', 'locomotor',
    'gifted', 'talented', 'creative child', 'creativity', 'diverse background', 'marginalized',
    'disadvantaged', 'deprived', 'braille', 'individual difference', 'hearing impairment',
    'visual impairment', 'intellectual disability', 'giftedness', 'special school'
]

CDP_THEORIES = [
    'piaget', 'kohlberg', 'vygotsky', 'scaffolding', 'zone of proximal', 'zpd', 'more knowledgeable other',
    'mko', 'assimilation', 'accommodation', 'equilibration', 'schema', 'sensorimotor',
    'preoperational', 'pre-operational', 'concrete operational', 'formal operational',
    'object permanence', 'conservation', 'centration', 'egocentrism', 'animism', 'hypothetico-deductive',
    'moral development', 'pre-conventional', 'conventional', 'post-conventional', 'private speech',
    'inner speech', 'social constructivism', 'cultural tools'
]

CDP_PROG_INTELL_LANG_GENDER = [
    'child centered', 'child-centred', 'progressive education', 'progressive classroom',
    'john dewey', 'activity based', 'experiential learning', 'intelligence', 'iq',
    'howard gardner', 'multiple intelligences', 'sternberg', 'triarchic', 'binet',
    'linguistic intelligence', 'logical mathematical', 'spatial intelligence', 'interpersonal',
    'intrapersonal', 'bodily kinesthetic', 'naturalistic', 'language acquisition', 'chomsky',
    'lad', 'language and thought', 'critical period', 'gender', 'gender role', 'gender stereotype',
    'gender bias', 'gender equality', 'gender conformity'
]

CDP_ASSESSMENT = [
    'assessment', 'evaluation', 'cce', 'continuous and comprehensive', 'formative',
    'summative', 'school based assessment', 'sba', 'rubric', 'portfolio', 'diagnostic',
    'remedial', 'grading', 'standardized test', 'open ended', 'closed ended', 'feedback',
    'assessment for learning', 'assessment of learning', 'assessment as learning', 'self assessment',
    'peer assessment', 'validity', 'reliability'
]

CDP_LEARNING_PEDAGOGY = [
    'problem solver', 'scientific investigator', 'constructivism', 'constructivist',
    'meaningful learning', 'rote learning', 'rote memorization', 'active learning',
    'collaborative learning', 'cooperative learning', 'peer collaboration', 'discovery learning',
    'misconception', 'alternative conception', 'naive concept', 'children errors', 'errors as windows',
    'cognition and emotion', 'cognition', 'emotion', 'intrinsic motivation', 'extrinsic motivation',
    'locus of control', 'learned helplessness', 'self-efficacy', 'metacognition', 'information processing',
    'memory', 'retention', 'transfer of learning', 'mastery oriented', 'performance oriented'
]

CDP_DEVELOPMENT_GROWTH = [
    'development', 'growth', 'principles of development', 'cephalocaudal', 'proximodistal',
    'heredity and environment', 'heredity', 'environment', 'nature vs nurture', 'socialization',
    'primary socialization', 'secondary socialization', 'family', 'parents', 'peers', 'school',
    'mass media', 'stages of development', 'infancy', 'early childhood', 'middle childhood',
    'adolescence', 'motor development', 'fine motor', 'gross motor', 'physical development',
    'continuity', 'sequential', 'maturation'
]

def score_list(words, text):
    cnt = 0
    for w in words:
        if ' ' in w:
            if w in text: cnt += 2
        else:
            if re.search(r'\b' + re.escape(w) + r'\b', text): cnt += 1
    return cnt

def classify_ctet_full(stem, raw_book, raw_sec):
    s = stem.lower()
    b = (raw_book or '').lower()
    sec = (raw_sec or '').lower()

    # 1. Subject decision
    is_sst = False
    if 'sst' in b or 'social' in b or 'sst' in sec or 'social' in sec:
        is_sst = True
    elif any(w in s for w in SST_HISTORY + SST_GEOGRAPHY + SST_POLITY + SST_PEDAGOGY):
        if not any(k in s for k in ['piaget', 'vygotsky', 'kohlberg', 'scaffolding', 'zpd', 'schema', 'sensorimotor', 'development', 'cognitive', 'inclusive', 'dyslexia', 'cwsn', 'gardner', 'dewey']):
            is_sst = True

    if is_sst:
        # SST Topics
        s_hist = score_list(SST_HISTORY, s)
        s_geo = score_list(SST_GEOGRAPHY, s)
        s_pol = score_list(SST_POLITY, s)
        s_ped = score_list(SST_PEDAGOGY, s)

        topics = [
            (s_ped, 'ctet_sst_pedagogy', 'Social Science - Pedagogical Issues', 4),
            (s_geo, 'ctet_sst_geography', 'Social Science - Geography (The Earth & Environment)', 2),
            (s_pol, 'ctet_sst_polity', 'Social Science - Social and Political Life (Civics)', 3),
            (s_hist, 'ctet_sst_history', 'Social Science - History (Our Pasts)', 1)
        ]
        topics.sort(key=lambda x: -x[0])
        return 'sst', topics[0][1], topics[0][2], topics[0][3]
    else:
        # CDP Topics
        s_inc = score_list(CDP_INCLUSIVE, s)
        s_theo = score_list(CDP_THEORIES, s)
        s_prog = score_list(CDP_PROG_INTELL_LANG_GENDER, s)
        s_ass = score_list(CDP_ASSESSMENT, s)
        s_lrn = score_list(CDP_LEARNING_PEDAGOGY, s)
        s_dev = score_list(CDP_DEVELOPMENT_GROWTH, s)

        topics = [
            (s_inc, 'ctet_cdp_inclusive', 'CDP - Inclusive Education & Special Needs', 4),
            (s_theo, 'ctet_cdp_theories', 'CDP - Developmental Theories (Piaget, Kohlberg, Vygotsky)', 2),
            (s_ass, 'ctet_cdp_assessment', 'CDP - Assessment, Evaluation & CCE', 6),
            (s_prog, 'ctet_cdp_progressive_intelligence', 'CDP - Progressive Education, Intelligence & Language', 3),
            (s_lrn, 'ctet_cdp_learning_pedagogy', 'CDP - Learning Process, Cognition & Problem Solving', 5),
            (s_dev, 'ctet_cdp_growth_development', 'CDP - Child Development, Growth & Socialization', 1)
        ]
        topics.sort(key=lambda x: -x[0])
        return 'cdp', topics[0][1], topics[0][2], topics[0][3]

by_topic = defaultdict(list)
for q in ctet_data['questions']:
    stem = q.get('stem', '')
    norm = re.sub(r'[^a-z0-9]', '', stem.lower())[:80]
    raw = raw_map.get(norm, {})
    subj, top_id, top_name, set_num = classify_ctet_full(stem, raw.get('source_book', ''), raw.get('section', ''))
    by_topic[(subj, top_id, top_name, set_num)].append(q)

print(f"\nTotal questions classified: {sum(len(v) for v in by_topic.values())}")
print("\n--- CTET Topics Classification Results ---")
for (subj, top_id, top_name, set_num), qlist in sorted(by_topic.items(), key=lambda x: (x[0][0], x[0][3])):
    print(f"[{subj.upper()}] Set {set_num}: {top_name} -> {len(qlist)} MCQs (ID: {top_id})")

