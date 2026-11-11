import json
import re
from collections import defaultdict

with open('pwa/ctet/ctet_pyq_papers.json', 'r', encoding='utf-8') as f:
    ctet_data = json.load(f)

# Comprehensive SST Cues
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

def score(cues, text):
    s = 0
    for c in cues:
        if ' ' in c:
            if c in text: s += 2
        else:
            if re.search(r'\b' + re.escape(c) + r'\b', text): s += 1
    return s

def classify_q(stem, opts_text):
    text = (stem + " " + opts_text).lower()
    
    # Check CDP Theories & Core first
    s_theo = score(CDP_THEORIES_CUES, text)
    s_inc = score(CDP_INCLUSIVE_CUES, text)
    s_ass = score(CDP_ASSESSMENT_CUES, text)
    s_prog = score(CDP_PROG_INTELL_LANG_GENDER_CUES, text)
    s_lrn = score(CDP_LEARNING_PEDAGOGY_CUES, text)
    
    # Check SST
    s_hist = score(HISTORY_CUES, text)
    s_geo = score(GEOGRAPHY_CUES, text)
    s_pol = score(POLITY_CUES, text)
    s_sst_ped = score(PEDAGOGY_SST_CUES, text)
    
    total_sst = s_hist + s_geo + s_pol + s_sst_ped
    total_cdp = s_theo + s_inc + s_ass + s_prog + s_lrn
    
    if total_sst > total_cdp and total_sst > 0:
        # SST classification
        sst_scores = [
            (s_sst_ped, 'ctet_sst_pedagogy', 'Social Science - Pedagogical Issues', 4),
            (s_geo, 'ctet_sst_geography', 'Social Science - Geography (Earth & Environment)', 2),
            (s_pol, 'ctet_sst_polity', 'Social Science - Social and Political Life (Civics)', 3),
            (s_hist, 'ctet_sst_history', 'Social Science - History (Our Pasts)', 1)
        ]
        sst_scores.sort(key=lambda x: -x[0])
        return ('sst', sst_scores[0][1], sst_scores[0][2], sst_scores[0][3])
    else:
        # CDP classification
        cdp_scores = [
            (s_inc, 'ctet_cdp_inclusive', 'CDP - Inclusive Education & Special Needs', 4),
            (s_theo, 'ctet_cdp_theories', 'CDP - Theories of Development (Piaget, Kohlberg, Vygotsky)', 2),
            (s_ass, 'ctet_cdp_assessment', 'CDP - Assessment, Evaluation & CCE', 6),
            (s_prog, 'ctet_cdp_progressive_intelligence', 'CDP - Progressive Education, Intelligence & Language', 3),
            (s_lrn, 'ctet_cdp_learning_pedagogy', 'CDP - Learning Process, Cognition & Problem Solving', 5),
        ]
        cdp_scores.sort(key=lambda x: -x[0])
        if cdp_scores[0][0] > 0:
            return ('cdp', cdp_scores[0][1], cdp_scores[0][2], cdp_scores[0][3])
        else:
            return ('cdp', 'ctet_cdp_growth_development', 'CDP - Child Development, Growth & Socialization', 1)

by_topic = defaultdict(list)
for q in ctet_data['questions']:
    stem = q.get('stem', '')
    opts_txt = " ".join(o.get('text', '') for o in q.get('options', []))
    subj, top_id, top_name, set_num = classify_q(stem, opts_txt)
    by_topic[(subj, top_id, top_name, set_num)].append(q)

print("\n--- Refined CTET Classification Results ---")
for (subj, top_id, top_name, set_num), qlist in sorted(by_topic.items(), key=lambda x: (x[0][0], x[0][3])):
    print(f"[{subj.upper()}] Set {set_num}: {top_name} -> {len(qlist)} MCQs ({top_id})")
print(f"Total: {sum(len(v) for v in by_topic.values())}")

