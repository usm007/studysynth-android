import json
import re
from collections import defaultdict

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

# Official CTET Syllabus Topics:
# SUBJECT 1: Child Development and Pedagogy (CDP)
#   Topic 1: Child Development & Growth (Concept of Development, Principles, Heredity & Environment, Socialization)
#   Topic 2: Theories of Child Development (Piaget, Kohlberg, Vygotsky, Constructs & Critical Perspectives)
#   Topic 3: Progressive Education, Intelligence, Language & Gender (Child-Centred Education, Multi-Dimensional Intelligence, Language & Thought, Gender as Social Construct)
#   Topic 4: Inclusive Education & Children with Special Needs (CWSN, Learning Difficulties, Gifted & Talented Learners)
#   Topic 5: Learning, Cognition, Emotion & Problem Solving (How Children Think & Learn, Child as Problem Solver, Alternative Conceptions, Motivation)
#   Topic 6: Assessment, Evaluation & CCE (School-Based Assessment, Continuous & Comprehensive Evaluation, Diagnostic Teaching)

# SUBJECT 2: Social Science / Social Studies (SST)
#   Topic 1: History (Our Pasts - Ancient, Medieval & Modern India)
#   Topic 2: Geography (The Earth, Habitats, Resources & Environment)
#   Topic 3: Social and Political Life (Civics, Constitution, Governance & Social Justice)
#   Topic 4: Pedagogical Issues in Social Science (Methods, Enquiries, Projects & Evaluation)

def classify(stem, raw_book, raw_sec):
    s = stem.lower()
    b = (raw_book or '').lower()
    sec = (raw_sec or '').lower()

    # Determine Subject
    is_sst = False
    if 'sst' in b or 'social' in b or 'sst' in sec:
        is_sst = True
    elif any(w in s for w in ['harappa', 'mughal', 'ashoka', 'mauryan', 'delhi sultanate', 'british rule', 'chola',
                              'buddhism', 'jainism', 'atmosphere', 'troposphere', 'stratosphere', 'latitude', 'longitude',
                              'equator', 'tropic of cancer', 'rocks and minerals', 'igneous', 'soil', 'monsoon', 'lok sabha',
                              'rajya sabha', 'panchayat', 'gram sabha', 'judiciary', 'preamble', 'fundamental rights', 'fir']):
        is_sst = True

    if is_sst:
        # Check SST Topics
        # Pedagogical Issues
        ped_words = ['pedagogy of social', 'teaching of social', 'social science classroom', 'social studies teacher',
                     'primary source', 'secondary source', 'source method', 'project method in social', 'field trip in social',
                     'enquiry method', 'historical evidence', 'archaeological source', 'teaching-learning of history',
                     'teaching-learning of geography', 'develop critical thinking in social', 'narrative approach']
        if any(w in s for w in ped_words):
            return ('sst', 'ctet_sst_pedagogy', 'Social Science - Pedagogical Issues', 4)

        # Geography
        geo_words = ['earth', 'globe', 'latitude', 'longitude', 'equator', 'tropic of cancer', 'tropic of capricorn',
                     'atmosphere', 'troposphere', 'stratosphere', 'mesosphere', 'thermosphere', 'lithosphere',
                     'hydrosphere', 'biosphere', 'rocks', 'minerals', 'igneous', 'sedimentary', 'metamorphic',
                     'earthquake', 'volcano', 'monsoon', 'climate', 'vegetation', 'forest', 'tundra', 'grassland',
                     'ocean', 'tides', 'currents', 'river', 'delta', 'solar system', 'planet', 'meridian', 'hemisphere',
                     'axis', 'rotation', 'revolution', 'settlement', 'transport', 'communication', 'agriculture',
                     'crops', 'soil', 'equinox', 'solstice', 'greenwich', 'topography', 'plateau', 'himalaya', 'peninsular']
        if any(w in s for w in geo_words):
            return ('sst', 'ctet_sst_geography', 'Social Science - Geography (Earth & Environment)', 2)

        # Polity / Civics
        pol_words = ['constitution', 'preamble', 'fundamental rights', 'fundamental duties', 'directive principles',
                     'parliament', 'lok sabha', 'rajya sabha', 'president of india', 'prime minister', 'supreme court',
                     'high court', 'judiciary', 'panchayat', 'gram sabha', 'gram panchayat', 'municipality',
                     'democracy', 'secularism', 'marginalisation', 'untouchability', 'adivasi', 'dalit',
                     'equality', 'discrimination', 'fir', 'police', 'public prosecutor', 'rule of law',
                     'gender inequality', 'media', 'market', 'government', 'legislature', 'executive', 'civil rights',
                     'universal adult franchise', 'right to education', 'article 21', 'article 14']
        if any(w in s for w in pol_words):
            return ('sst', 'ctet_sst_polity', 'Social Science - Social and Political Life (Civics)', 3)

        # History default for SST
        return ('sst', 'ctet_sst_history', 'Social Science - History (Our Pasts)', 1)

    else:
        # CDP Topics
        # Topic 2: Theories (Piaget, Kohlberg, Vygotsky)
        theories_words = ['piaget', 'kohlberg', 'vygotsky', 'scaffolding', 'zone of proximal', 'zpd', 'mko',
                          'assimilation', 'accommodation', 'equilibration', 'schema', 'sensorimotor',
                          'preoperational', 'pre-operational', 'concrete operational', 'formal operational',
                          'object permanence', 'conservation', 'centration', 'egocentrism', 'animism',
                          'hypothetico-deductive', 'moral development', 'pre-conventional', 'conventional',
                          'post-conventional', 'private speech', 'inner speech', 'social constructivism']
        if any(w in s for w in theories_words):
            return ('cdp', 'ctet_cdp_theories', 'CDP - Theories of Development (Piaget, Kohlberg, Vygotsky)', 2)

        # Topic 4: Inclusive Education & Special Needs
        inclusive_words = ['inclusive education', 'inclusive classroom', 'inclusion', 'disability', 'disabled',
                           'impairment', 'cwsn', 'special needs', 'dyslexia', 'dyscalculia', 'dysgraphia', 'dyspraxia',
                           'adhd', 'autism', 'locomotor disability', 'gifted children', 'gifted students', 'talented',
                           'creative child', 'creativity', 'diverse background', 'marginalized group', 'deprived group',
                           'braille', 'individual differences', 'hearing impairment', 'visual impairment']
        if any(w in s for w in inclusive_words):
            return ('cdp', 'ctet_cdp_inclusive', 'CDP - Inclusive Education & Children with Special Needs', 4)

        # Topic 6: Assessment & Evaluation
        assessment_words = ['assessment', 'evaluation', 'cce', 'continuous and comprehensive', 'formative assessment',
                            'summative assessment', 'school based assessment', 'sba', 'rubric', 'portfolio',
                            'diagnostic test', 'remedial teaching', 'grading', 'standardized test',
                            'assessment for learning', 'assessment of learning', 'assessment as learning',
                            'self assessment', 'peer assessment']
        if any(w in s for w in assessment_words):
            return ('cdp', 'ctet_cdp_assessment', 'CDP - Assessment, Evaluation & CCE', 6)

        # Topic 3: Progressive Education, Intelligence, Language & Gender
        prog_words = ['child-centered', 'child centered', 'progressive education', 'progressive classroom',
                      'john dewey', 'experiential learning', 'intelligence', 'iq', 'howard gardner',
                      'multiple intelligences', 'sternberg', 'triarchic', 'binet', 'language acquisition',
                      'chomsky', 'lad', 'language and thought', 'critical period of language',
                      'gender role', 'gender stereotype', 'gender bias', 'gender as a social construct']
        if any(w in s for w in prog_words):
            return ('cdp', 'ctet_cdp_progressive_intelligence', 'CDP - Progressive Education, Intelligence & Language', 3)

        # Topic 5: Learning, Cognition, Emotion & Problem Solving
        learn_words = ['problem solver', 'scientific investigator', 'constructivism', 'constructivist',
                       'meaningful learning', 'rote memorization', 'rote learning', 'active learning',
                       'collaborative learning', 'cooperative learning', 'peer collaboration', 'discovery learning',
                       'misconception', 'alternative conception', 'naive concept', 'children errors', 'errors as windows',
                       'cognition and emotion', 'emotions and cognition', 'intrinsic motivation', 'extrinsic motivation',
                       'locus of control', 'learned helplessness', 'self-efficacy', 'metacognition', 'information processing',
                       'transfer of learning', 'learning process']
        if any(w in s for w in learn_words):
            return ('cdp', 'ctet_cdp_learning_pedagogy', 'CDP - Learning Process, Cognition & Problem Solving', 5)

        # Topic 1: Growth, Development & Socialization default for CDP
        return ('cdp', 'ctet_cdp_growth_development', 'CDP - Child Development, Growth & Socialization', 1)

results = defaultdict(list)
for q in ctet_data['questions']:
    stem = q.get('stem', '')
    norm = re.sub(r'[^a-z0-9]', '', stem.lower())[:80]
    raw = raw_map.get(norm, {})
    subj, top_id, top_name, set_num = classify(stem, raw.get('source_book', ''), raw.get('section', ''))
    results[(subj, top_id, top_name, set_num)].append(q)

print("\n--- CTET Topics Classification Final Test ---")
for (subj, top_id, top_name, set_num), qlist in sorted(results.items(), key=lambda x: (x[0][0], x[0][3])):
    print(f"[{subj.upper()}] Set {set_num}: {top_name} -> {len(qlist)} MCQs ({top_id})")
print(f"Total: {sum(len(v) for v in results.values())}")

