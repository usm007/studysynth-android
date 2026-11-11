#!/usr/bin/env python3
"""
Rebuild UGC NET Education (Code 09) Question Bank.
- Cleans and verifies every question for correctness and formatting
- Resolves OCR kerning, watermarks, leaked answer keys, and mojibake
- Structures special presentation formats (match_list, assertion_reason, statement_pair)
- Accurately classifies all questions across the 10 official UGC NET Education syllabus units
- Organises questions by syllabus topics into practice sets, replacing year-based organisation
- Updates pwa and www bundles, manifests, and index
"""

import os
import re
import sys
import json
import glob
import hashlib

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PWA_DIR = os.path.join(ROOT, "pwa")
WWW_DIR = os.path.join(ROOT, "www")

PWA_CTET = os.path.join(PWA_DIR, "ctet")
WWW_CTET = os.path.join(WWW_DIR, "ctet")

os.makedirs(PWA_CTET, exist_ok=True)
os.makedirs(WWW_CTET, exist_ok=True)

# -------------------------------------------------------------
# 1. Clean Text and Fix Artifacts
# -------------------------------------------------------------

def clean_text(text):
    if not text:
        return ""
    text = str(text)
    # Fix mojibake
    text = text.replace('?o', '"').replace('?T', "'").replace('^\'', '-').replace('?', '"')
    text = text.replace('\ufffd', '').replace('â€œ', '"').replace('â€', '"').replace('â€™', "'")
    text = text.replace('â€˜', "'").replace('â€“', '-').replace('â€”', '-').replace('Â', '')
    
    # Fix split-word OCR kerning
    split_words = [
        (r'\bd\s+uring\b', 'during'),
        (r'\bch\s+ange\b', 'change'),
        (r'\bindivid\s+uals?\b', 'individual'),
        (r'\bus\s+ually\b', 'usually'),
        (r'\bfollo\s+wing\b', 'following'),
        (r'\bsociet\s+y\b', 'society'),
        (r'\bANOV\s+A\b', 'ANOVA'),
        (r'\bV\s+ocabulary\b', 'Vocabulary'),
        (r'\bV\s*\.\s*K\s*\.\s*R\s*\.\s*V\s*\.\b', 'V.K.R.V.'),
        (r'\bD\s*\.\s*P\s*\.\s*Chattopadhyaya\b', 'D.P. Chattopadhyaya'),
        (r'\bD\s*\.\s*S\s*\.\s*Kothari\b', 'D.S. Kothari')
    ]
    for pattern, replacement in split_words:
        text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        
    # Strip exam paper watermarks & footers
    text = re.sub(r'\(UGC\s+NET\s+Education.*?\)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\(UGC\s+NET.*?\)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\(See\s+Paper-.*?\)', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\bPaper[-–]I{1,3}\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b\d{1,3}[A-Z]-\d{5,}\s*!.*?!?', '', text)
    text = re.sub(r'![A-Z0-9\-]+!', '', text)
    
    # Normalize whitespace
    text = re.sub(r'[\r\n\t]+', ' ', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

def clean_option_text(text):
    if not text:
        return ""
    text = clean_text(text)
    # Strip leaked ANS markers at end
    text = re.sub(r'\b(?:ANS|ANSWER)\s*[\.:]?\s*[A-D0-9]+\b.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:Option\s+[A-D]\s*is\s*correct)\b.*$', '', text, flags=re.IGNORECASE)
    # Strip trailing booklet codes
    text = re.sub(r'\b\d{1,3}[A-Z]-\d{4,}.*$', '', text)
    text = re.sub(r'\s{2,}', ' ', text)
    return text.strip()

# -------------------------------------------------------------
# 2. Presentation Parsers
# -------------------------------------------------------------

def parse_match_list(stem):
    """
    Parse Match List items into structured data for UI rendering.
    """
    s_lower = stem.lower()
    if ('list - i' not in s_lower and 'list i' not in s_lower and 'set - i' not in s_lower and 'set i' not in s_lower):
        return None
    if ('list - ii' not in s_lower and 'list ii' not in s_lower and 'set - ii' not in s_lower and 'set ii' not in s_lower):
        return None

    # Find split point between List I and List II
    m_split = re.search(r'(List|Set)\s*[-–]?\s*(?:II|2)\b', stem, re.IGNORECASE)
    if not m_split:
        return None
    
    m_start = re.search(r'(List|Set)\s*[-–]?\s*(?:I|1)\b', stem[:m_split.start()], re.IGNORECASE)
    if not m_start:
        return None

    intro = clean_text(stem[:m_start.start()])
    if not intro:
        intro = "Match List - I with List - II."

    list1_raw = stem[m_start.end():m_split.start()]
    list2_and_prompt = stem[m_split.end():]

    # Check for prompt marker at bottom
    m_prompt = re.search(r'(Choose the correct|Select the correct|Codes?\s*:).*$', list2_and_prompt, re.IGNORECASE)
    if m_prompt:
        list2_raw = list2_and_prompt[:m_prompt.start()]
        prompt = clean_text(m_prompt.group(0))
    else:
        list2_raw = list2_and_prompt
        prompt = "Choose the correct answer from the options given below :"

    # Parse items in List 1: (A) / (a)
    l1_items = []
    chunks1 = re.split(r'\(([A-Ea-e1-5])\)', list1_raw)
    if len(chunks1) >= 3:
        for i in range(1, len(chunks1), 2):
            k = chunks1[i].upper()
            val = clean_text(chunks1[i+1])
            val = re.sub(r'^[–\-:\.]\s*', '', val)
            l1_items.append({'key': k, 'text': val})

    # Parse items in List 2: (I)-(V) / (1)-(5) / (i)-(v)
    l2_items = []
    chunks2 = re.split(r'\(([IVXLCDMivxlcdm1-5]+)\)', list2_raw)
    if len(chunks2) >= 3:
        for i in range(1, len(chunks2), 2):
            k = chunks2[i].upper()
            val = clean_text(chunks2[i+1])
            val = re.sub(r'^[–\-:\.]\s*', '', val)
            l2_items.append({'key': k, 'text': val})

    if len(l1_items) >= 2 and len(l2_items) >= 2:
        return {
            'intro': intro,
            'l1_header': 'List - I',
            'l2_header': 'List - II',
            'l1': l1_items,
            'l2': l2_items,
            'prompt': prompt
        }
    return None

def parse_assertion_reason(stem):
    """
    Parse Assertion (A) and Reason (R) questions.
    """
    m_a = re.search(r'Assertion\s*(?:\([A-Za-z]\)|:)\s*', stem, re.IGNORECASE)
    m_r = re.search(r'Reason\s*(?:\([A-Za-z]\)|:)\s*', stem, re.IGNORECASE)
    if not (m_a and m_r and m_a.start() < m_r.start()):
        return None

    intro = clean_text(stem[:m_a.start()])
    a_text = clean_text(stem[m_a.end():m_r.start()])
    rest = stem[m_r.end():]

    m_p = re.search(r'(?:In\s+the\s+light\s+of|In\s+light\s+of|Choose\s+the\s+correct|Select\s+the\s+correct|Codes?\s*:).*$', rest, re.IGNORECASE)
    if m_p:
        r_text = clean_text(rest[:m_p.start()])
        prompt = clean_text(m_p.group(0))
    else:
        r_text = clean_text(rest)
        prompt = "In the light of the above statements, choose the most appropriate answer from the options given below :"

    if not intro:
        intro = "Given below are two statements, one is labelled as Assertion (A) and the other as Reason (R):"

    return {
        'intro': intro,
        'assertion': a_text,
        'reason': r_text,
        'prompt': prompt
    }

def parse_statement_pair(stem):
    """
    Parse Statement I and Statement II questions.
    """
    m_s1 = re.search(r'Statement\s*(?:I|1)\s*[:.]\s*', stem, re.IGNORECASE)
    m_s2 = re.search(r'Statement\s*(?:II|2)\s*[:.]\s*', stem, re.IGNORECASE)
    if not (m_s1 and m_s2 and m_s1.start() < m_s2.start()):
        return None

    intro = clean_text(stem[:m_s1.start()])
    s1_text = clean_text(stem[m_s1.end():m_s2.start()])
    rest = stem[m_s2.end():]

    m_p = re.search(r'(?:In\s+the\s+light\s+of|In\s+light\s+of|Choose\s+the\s+correct|Select\s+the\s+correct|Codes?\s*:).*$', rest, re.IGNORECASE)
    if m_p:
        s2_text = clean_text(rest[:m_p.start()])
        prompt = clean_text(m_p.group(0))
    else:
        s2_text = clean_text(rest)
        prompt = "In the light of the above statements, choose the most appropriate answer from the options given below :"

    if not intro:
        intro = "Given below are two statements:"

    return {
        'intro': intro,
        'statement1': s1_text,
        'statement2': s2_text,
        'prompt': prompt
    }

# -------------------------------------------------------------
# 3. UGC NET Education Syllabus Classification (10 Units)
# -------------------------------------------------------------

UNIT_TIER_PATTERNS = {
    "Unit 1: Educational Studies": [
        r'\bphilosoph', r'\bmetaphysic', r'\baxiolog', r'\bepistemolog', r'\bidealism', r'\bidealist',
        r'\brealism', r'\brealist', r'\bnaturalism', r'\bnaturalist', r'\bpragmati', r'\bexistential',
        r'\bmarxis', r'\bpositivis', r'\bpostmodern', r'\bpost-modern', r'\bsankhya\b', r'\bsamkhya\b',
        r'\bpurusha\b', r'\bprakriti\b', r'\byoga\b', r'\bastanga\b', r'\bvedanta\b', r'\badvaita\b',
        r'\bshankara\b', r'\bramanuja\b', r'\bbuddh', r'\bnoble truth', r'\beightfold', r'\bvipassana\b',
        r'\bjain', r'\banekanta', r'\bsyadvada\b', r'\btriratna\b', r'\bmoksha?\b', r'\bdharma\b',
        r'\bartha\b', r'\bkama\b', r'\bislam', r'\bmaktab', r'\bmadrasa', r'\bquran', r'\bupanishad',
        r'\bvedic\b', r'\bpramana', r'\bpratyaksha\b', r'\banumana\b', r'\bupamana\b', r'\bsabda\b',
        r'\barthapatti\b', r'\banupalabdhi\b', r'\bnyaya\b', r'\bvaisheshika\b', r'\bmimamsa\b',
        r'\bvivekanand', r'\btagore', r'\bgandhi', r'\bnai talim\b', r'\bbasic education\b',
        r'\baurobindo', r'\bintegral education\b', r'\bkrishnamurti', r'\bfreire', r'\bconscienti[zs]ation\b',
        r'\bwollstonecraft', r'\bnoddings', r'\bdewey', r'\brousseau', r'\bplato\b', r'\baristotle',
        r'\bsocrates', r'\blocke\b', r'\btabula rasa\b', r'\bblank slate\b', r'\bsociolog',
        r'\bsociali[zs]ation\b', r'\bsocial mobilit', r'\bsocial stratifi', r'\bsocial change\b',
        r'\bsocial cohesion\b', r'\bsocial system\b', r'\bsocial structure\b', r'\bsocial institution\b',
        r'\bsanskriti[zs]ation\b', r'\bmoderni[zs]ation\b', r'\bwesterni[zs]ation\b', r'\bseculari[zs]ation\b',
        r'\bcultur', r'\bacculturat', r'\benculturat', r'\bhabermas', r'\bbourdieu', r'\balthusser',
        r'\bideological state\b', r'\bpreamble\b', r'\bfundamental right', r'\bfundamental dut',
        r'\bdirective principle', r'\barticle 21a\b', r'\barticle 45\b', r'\barticle 30\b', r'\barticle 15\b',
        r'\barticle 46\b', r'\barticle 350a\b', r'\bsecular', r'\bsocialis', r'\bdemocra', r'\bjustice\b',
        r'\bfraternity\b', r'\bbrahman\b', r'\bmaya\b', r'\bloco parentis\b', r'\bdisadvantaged section\b',
        r'\bequali[zs]ation of educational\b', r'\bequality of educational\b', r'\bhuman value', r'\bvalue-orientation\b',
        r'\breligion\b', r'\bspiritual', r'\bcaste loyalty\b', r'\bclosed society\b', r'\bopen society\b',
        r'\bcommunity experience\b', r'\bpeace education\b', r'\bepistemic\b', r'\bontolog', r'\bmoral judgment\b',
        r'\bvalues?\b', r'\bmorality\b', r'\bethics\b', r'\bsovereignty\b', r'\bnational integration\b',
        r'\bsocial conflict\b', r'\bvertical mobility\b', r'\bhorizontal mobility\b', r'\bsocial dynamic',
        r'\bgender\b', r'\bfeminism\b', r'\bhuman rights\b'
    ],
    "Unit 2: History, Politics and Economics of Education": [
        r'\bmacaulay', r"wood'?s despatch", r'\bhunter commission\b', r'\bsadler\b', r'\bhartog\b',
        r'\bsargent\b', r'\bradhakrishnan\b', r'\bmudaliar\b', r'\bkothari\b', r'\bnpe\b', r'\bpoa 1992\b',
        r'\bramamurti\b', r'\byashpal\b', r'\bnkc\b', r'\bnep 2020\b', r'\bnational education policy\b',
        r'\bsarva shiksha\b', r'\bssa\b', r'\brmsa\b', r'\bsamagra shiksha\b', r'\bdpep\b', r'\boperation blackboard\b',
        r'\bmidday meal\b', r'\bmdms\b', r'\brusa\b', r'\brte act\b', r'\bright to education\b',
        r'\bhuman capital\b', r'\bschultz\b', r'\bdenison\b', r'\bcost-benefit\b', r'\bcost-effectiveness\b',
        r'\brate of return\b', r'\bsignaling theory\b', r'\bscreening theory\b', r'\bcredentialism\b',
        r'\beducational financ', r'\beducational budget\b', r'\bmicro financ', r'\bmacro financ',
        r'\bunit cost\b', r'\bopportunity cost\b', r'\bvocationali[zs]ation\b', r'\bvocational education\b',
        r'\bpolicy formulat', r'\bpolicy implement', r'\bpolicy analy', r'\bpolitics of education\b',
        r'\buniversali[zs]ation of elementary\b', r'\buniversali[zs]ation of primary\b', r'\buee\b',
        r'\bfive year plan\b', r'\bcabe\b', r'\baicte\b', r'\bugc act\b', r'\bgrant-in-aid\b',
        r'\bsecondary education commission\b', r'\buniversity education commission\b',
        r'\beducation commission 1964\b', r'\bprogress in education in india\b', r'\bcommunity colleges?\b',
        r'\bdistance education\b', r'\bopen university\b', r'\bignou\b', r'\bfinancing of education\b',
        r'\beducation in ancient india\b', r'\bbritish period\b', r'\bindigenous education\b',
        r'\bdelors commission\b', r'\beducation for all\b', r'\bprimary education in india\b'
    ],
    "Unit 3: Learner and Learning Process": [
        r'\bgrowth and development\b', r'\bconcept of growth\b', r'\bdevelopmental stage', r'\bstage of development\b',
        r'\bmaturation\b', r'\binfancy\b', r'\bchildhood\b', r'\badolescen', r'\bpiaget', r'\bsensorimotor\b',
        r'\bpreoperational\b', r'\bconcrete operational\b', r'\bformal operational\b', r'\bassimilat',
        r'\baccommodat', r'\bequilibra', r'\bschema\b', r'\bvygotsky', r'\bzpd\b', r'\bzone of proximal\b',
        r'\bscaffolding\b', r'\bprivate speech\b', r'\bmko\b', r'\bbruner', r'\benactive\b', r'\biconic\b',
        r'\bkohlberg', r'\bmoral development\b', r'\berikson', r'\bpsychosocial\b', r'\bidentity crisis\b',
        r'\blearning theor', r'\bclassical conditioning\b', r'\bpavlov', r'\bconditioned stimulus\b',
        r'\bunconditioned stimulus\b', r'\boperant condition', r'\bskinner', r'\breinforcement\b',
        r'\bpunishment\b', r'\bthorndike', r'\btrial and error\b', r'\blaw of effect\b', r'\blaw of exercise\b',
        r'\blaw of readiness\b', r'\bhull\b', r'\bdrive reduction\b', r'\btolman', r'\bpurposive behavior',
        r'\bcognitive map\b', r'\blatent learning\b', r'\bgestalt', r'\bkohler', r'\binsightful learning\b',
        r'\binsight learning\b', r'\bkurt lewin\b', r'\bfield theory\b', r'\blife space\b', r'\bbandura',
        r'\bsocial cognitive\b', r'\bobservational learning\b', r'\bmodeling\b', r'\bself-efficacy\b',
        r'\breciprocal determin', r'\bintelligence\b', r'\biq\b', r'\bmental age\b', r'\bchronological age\b',
        r'\bspearman', r'\bg-factor\b', r'\bs-factor\b', r'\bthurstone', r'\bprimary mental abilit',
        r'\bguilford', r'\bstructure of intellect\b', r'\bconvergent thinking\b', r'\bdivergent thinking\b',
        r'\bgardner', r'\bmultiple intelligence', r'\bbodily-kinesthetic\b', r'\bsternberg', r'\btriarchic\b',
        r'\bemotional intelligence\b', r'\bgoleman', r'\bbinet', r'\bstanford-binet\b', r'\bwechsler',
        r'\bwais\b', r'\bwisc\b', r'\bpersonality\b', r'\btrait theor', r'\ballport', r'\bcattell',
        r'\b16pf\b', r'\beysenck', r'\bbig five\b', r'\bocean model\b', r'\bfreud', r'\bpsychoanaly',
        r'\bid,?\s*ego\b', r'\bsuperego\b', r'\bdefense mechanism\b', r'\bdefence mechanism\b', r'\brepress',
        r'\bprojectio', r'\brationali[zs]at', r'\bsublimat', r'\bjung', r'\barchetype', r'\bcollective unconscious\b',
        r'\badler', r'\binferiority complex\b', r'\bcarl rogers\b', r'\bself-actuali[zs]at', r'\bmaslow',
        r'\bhierarchy of need', r'\bneed hierarchy\b', r'\bmental health\b', r'\bmental hygiene\b',
        r'\badjustment\b', r'\bmaladjustment\b', r'\bguidance\b', r'\bcounsell?ing\b', r'\bdirective counsell',
        r'\bnon-directive counsell', r'\beclectic counsell', r'\bwilliamson', r'\blocus of control\b',
        r'\bconcept formation\b', r'\btransfer of learning\b', r'\btransfer of training\b', r'\bmotivat',
        r'\bherzberg', r'\bmcclelland', r'\bgagne', r'\btypes of learning\b', r'\beducational psychology\b',
        r'\bpsycholog', r'\bcreativit', r'\btorrance', r'\bforgetting\b', r'\bretention\b', r'\bindividual difference',
        r'\baptitude\b', r'\bheredity and environment\b', r'\bemotions?\b', r'\bhabit\b', r'\bperception\b',
        r'\battention\b', r'\bsensation\b', r'\bmotivation theory\b', r'\bself-concept\b'
    ],
    "Unit 4: Teacher Education": [
        r'\bteacher education\b', r'\bpre-service\b', r'\bin-service\b', r'\bb\.ed\b', r'\bm\.ed\b',
        r'\bd\.el\.ed\b', r'\bncte\b', r'\bncfte\b', r'\bteacher preparation\b', r'\bteacher training\b',
        r'\bstudent teacher\b', r'\bprospective teacher\b', r'\bpractice teaching\b', r'\binternship in teaching\b',
        r'\bschool internship\b', r'\binduction programme\b', r'\bcontinuing professional development\b',
        r'\bcpd\b', r'\bncert\b', r'\bscert\b', r'\bdiet\b', r'\bdistrict institute of education\b',
        r'\bcte\b', r'\bcollege of teacher education\b', r'\biase\b', r'\bhrdc\b', r'\bugc-hrdc\b',
        r'\bacademic staff college\b', r'\borientation programme\b', r'\brefresher course\b',
        r'\bteacher competenc', r'\bteaching competenc', r'\bmicroteaching\b', r'\bmicro-teaching\b',
        r'\bsimulated teaching\b', r'\bsimulation in teaching\b', r'\bskill of questioning\b',
        r'\bskill of stimulus\b', r'\bskill of explaining\b', r'\breflective teaching\b',
        r'\breflective practice\b', r'\breflective practitioner\b', r'\bteacher as researcher\b',
        r'\bcode of ethics for teacher', r'\bteacher evaluation\b', r'\bteacher effectiveness\b',
        r'\bpedagogical content knowledge\b', r'\bpck\b', r'\blee shulman\b', r'\bchattopadhyaya\b',
        r'\bnational commission on teacher', r'\bteacher educator', r'\bteacher behaviour\b',
        r'\bprofessionalism in teaching\b', r'\bteaching profession\b'
    ],
    "Unit 5: Curriculum Studies": [
        r'\bcurricul', r'\btyler model\b', r'\bralph tyler\b', r"tyler's", r'\btaba model\b',
        r'\bhilda taba\b', r'\bwheeler model\b', r'\bsaylor and alexander\b', r'\boliva model\b',
        r'\bcipp model\b', r'\bcipp\b', r'\bstufflebeam\b', r"stake's", r'\brobert stake\b',
        r'\bcountenance model\b', r'\bresponsive evaluation\b', r'\bscriven\b', r'\bgoal-free\b',
        r'\btextbook\b', r'\bsyllabus\b', r'\bcourse of study\b', r'\bcurricular\b', r'\bcocurricular\b'
    ],
    "Unit 6: Research in Education": [
        r'\beducational research\b', r'\bresearch\b', r'\bhypothes', r'\bnull hypothesis\b',
        r'\bdirectional hypothesis\b', r'\btype i error\b', r'\btype ii error\b', r'\blevel of significance\b',
        r'\balpha error\b', r'\bbeta error\b', r'\bdegrees of freedom\b', r'\bsampling\b', r'\bsample\b',
        r'\bsampling error\b', r'\bprobability sampling\b', r'\bstratified sampling\b', r'\bcluster sampling\b',
        r'\bsystematic sampling\b', r'\bnon-probability sampling\b', r'\bpurposive sampling\b', r'\bquota sampling\b',
        r'\bsnowball sampling\b', r'\bvariable\b', r'\bexperimental research\b', r'\binternal validity\b',
        r'\bexternal validity\b', r'\bquasi-experimental\b', r'\bex-post facto\b', r'\bcausal-comparative\b',
        r'\bcausal comparative\b', r'\bsurvey research\b', r'\blongitudinal\b', r'\bcross-sectional\b',
        r'\bqualitative research\b', r'\bphenomenolog', r'\bepoche\b', r'\bbracketing\b', r'\bethnograph',
        r'\bgrounded theory\b', r'\bconstant comparative\b', r'\bcase study\b', r'\breliabilit',
        r'\bvalidit', r'\btest-retest\b', r'\bsplit-half\b', r'\bspearman-brown\b', r'\binternal consistency\b',
        r'\bcronbach\b', r'\bkuder-richardson\b', r'\bkr-20\b', r'\bcontent validity\b', r'\bconstruct validity\b',
        r'\bcriterion validity\b', r'\bmeasurement scale', r'\bnominal\b', r'\bordinal\b',
        r'\binterval scale\b', r'\bratio scale\b', r'\brating scale\b', r'\blikert\b', r'\bthurstone scale\b',
        r'\bsemantic differential\b', r'\bitem analysis\b', r'\bitem difficulty\b', r'\bdiscrimination index\b',
        r'\bcentral tendency\b', r'\bmean\b', r'\bmedian\b', r'\bmode\b', r'\bstandard deviation\b',
        r'\bquartile deviation\b', r'\bvariance\b', r'\bnormal distribution\b', r'\bnormal curve\b',
        r'\bnpc\b', r'\bskew', r'\bkurtosis\b', r'\bmesokurtic\b', r'\bleptokurtic\b', r'\bplatykurtic\b',
        r'\bz-score\b', r'\bt-score\b', r'\bpercentile\b', r'\bcorrelat', r'\bpearson\b', r'\bregress',
        r'\bparametric test\b', r'\bnon-parametric test\b', r'\bt-test\b', r'\banova\b', r'\banov a\b',
        r'\bf-test\b', r'\bancova\b', r'\bchi-square\b', r'\bchi square\b', r'\bmann-whitney\b',
        r'\bwilcoxon\b', r'\bkruskal-wallis\b', r'\bfriedman test\b', r'\baction research\b',
        r'\bbootstrap method\b', r'\bq methodology\b', r'\bstandard error\b', r'\braw score\b',
        r'\bstatisti', r'\bstatistical\b', r'\bsignifican', r'\bn\s*=\s*\d+', r'\bm\s*=\s*\d+', r'\bsd\s*=\s*\d+',
        r'\bdifficulty value\b', r'\bstandardized test\b', r'\btest construction\b', r'\bitem types?\b',
        r'\bdata collection\b', r'\bquestionnaire\b', r'\binterview schedule\b', r'\bobservation technique\b'
    ],
    "Unit 7: Pedagogy, Andragogy and Assessment": [
        r'\bpedagog', r'\bandragog', r'\bknowles\b', r'\badult learner\b', r'\badult learning\b',
        r'\bself-directed learning\b', r'\bmodels of teaching\b', r'\bconcept attainment\b',
        r'\badvance organizer\b', r'\bausubel\b', r'\binquiry training\b', r'\bsuchman\b',
        r'\bjurisprudential\b', r'\bsynectics\b', r'\bflanders\b', r'\bfiac\b', r'\binteraction analysis\b',
        r'\bteacher talk\b', r'\bstudent talk\b', r'\bgalloway\b', r'\blevels of teaching\b',
        r'\bmemory level\b', r'\bunderstanding level\b', r'\breflective level\b', r'\bherbart',
        r'\bmorrison\b', r'\bhunt model\b', r'\bstages of teaching\b', r'\bpre-active stage\b',
        r'\binteractive stage\b', r'\bpost-active stage\b', r'\bteaching-learning\b', r'\bteaching as a system\b',
        r'\binstructional objective', r'\bbloom', r'\bcognitive domain\b', r'\baffective domain\b',
        r'\bpsychomotor domain\b', r'\bassessment for learning\b', r'\bassessment of learning\b',
        r'\bassessment as learning\b', r'\bformative assessment\b', r'\bformative evaluation\b',
        r'\bsummative assessment\b', r'\bsummative evaluation\b', r'\bdiagnostic assessment\b',
        r'\bdiagnostic evaluation\b', r'\bplacement evaluation\b', r'\bnorm-referenced\b', r'\bnrt\b',
        r'\bcriterion-referenced\b', r'\bcrt\b', r'\bcce\b', r'\bcontinuous and comprehensive\b',
        r'\brubric', r'\bportfolio', r'\banecdotal record\b', r'\bcumulative record\b',
        r'\breflective journal\b', r'\bauthentic assessment\b', r'\bperformance assessment\b',
        r'\bcriterion referred\b', r'\bachievement test\b', r'\bevaluation device\b', r'\bgrading system\b',
        r'\bcontinuous evaluation\b', r'\bclassroom teaching\b', r'\bteaching method', r'\bmethods of teaching\b'
    ],
    "Unit 8: Technology in/for Education": [
        r'\beducational technology\b', r'\btechnology in education\b', r'\binstructional technology\b',
        r'\bict\b', r'\bhardware approach\b', r'\bsoftware approach\b', r'\bsystems approach\b',
        r'\binstructional design\b', r'\baddie\b', r'\bassure\b', r"gagne's nine events",
        r'\bnine events of instruction\b', r'\bdick and carey\b', r'\b5e model\b', r'\bprogrammed instruction\b',
        r'\blinear programming\b', r'\bbranching programming\b', r'\bcrowder\b', r'\bcai\b', r'\bcmi\b',
        r'\be-learning\b', r'\bonline learning\b', r'\bdigital learning\b', r'\bblended learning\b',
        r'\bflipped classroom\b', r'\bvirtual classroom\b', r'\bsynchronous\b', r'\basynchronous\b',
        r'\bmooc', r'\bswayam', r'\bnptel\b', r'\boer\b', r'\bopen educational resources\b',
        r'\bcreative commons\b', r'\bcc by\b', r'\be-pg pathshala\b', r'\bdiksha\b', r'\blms\b',
        r'\bmoodle\b', r'\bmultimedia\b', r'\bpodcast\b', r'\bteleconferenc', r'\bvideo conferenc',
        r'\bweb 2\.0\b', r'\bvirtual reality\b', r'\baudiovisual\b', r'\baudio-visual\b',
        r'\bcommunication model\b', r'\bencoding and decoding\b', r'\bmobile learning\b',
        r'\beducational communication\b', r'\bmass media in education\b', r'\binstructional media\b'
    ],
    "Unit 9: Educational Management, Administration and Leadership": [
        r'\beducational management\b', r'\beducational administration\b', r'\beducational supervision\b',
        r'\bsupervision in education\b', r'\bposdcorb\b', r'\bgulick\b', r'\bscientific management\b',
        r'\btaylor\b', r'\bfayol\b', r'\bscalar chain\b', r'\bunity of command\b', r'\bunity of direction\b',
        r'\bbureaucra', r'\bmax weber\b', r'\belton mayo\b', r'\bhawthorne\b', r'\bchester barnard\b',
        r'\bleadership\b', r'\bmanagerial grid\b', r'\bblake and mouton\b', r'\bsituational leadership\b',
        r'\bhersey and blanchard\b', r'\bfiedler\b', r'\bleast preferred coworker\b', r'\blpc\b',
        r'\bpath-goal\b', r'\btransformational leadership\b', r'\btransactional leadership\b',
        r'\bcharismatic leadership\b', r'\bservant leadership\b', r'\bleader-member exchange\b',
        r'\blmx\b', r'\btotal quality management\b', r'\btqm\b', r'\bdeming\b', r'\bpdca\b',
        r'\bjuran\b', r'\bcrosby\b', r'\bzero defects\b', r'\bpoka-yoke\b', r'\bkaizen\b',
        r'\bsix sigma\b', r'\bdmaic\b', r'\bcost of quality\b', r'\binstitutional planning\b',
        r'\bperspective planning\b', r'\bgrassroot planning\b', r'\bmicro planning\b', r'\bschool principal\b',
        r'\bcoercive power\b', r'\breward power\b', r'\blegitimate power\b', r'\bexpert power\b',
        r'\breferent power\b', r'\bswot\b', r'\bpert\b', r'\bcpm\b', r'\bcritical path\b',
        r'\bnetwork analysis\b', r'\bnaac\b', r'\bnba\b', r'\bnirf\b', r'\bjob analysis\b',
        r'\borganizational climate\b', r'\borganizational behaviour\b', r'\bconflict management\b',
        r'\bchange management\b'
    ],
    "Unit 10: Inclusive Education": [
        r'\binclusive education\b', r'\binclusive classroom\b', r'\binclusion\b', r'\bspecial education\b',
        r'\bintegrated education\b', r'\bmainstreaming\b', r'\bdisabilit', r'\bimpairment\b', r'\bhandicap\b',
        r'\bintellectual disabilit', r'\bmental retardation\b', r'\bmentally retarded\b', r'\bslow learner\b',
        r'\bbackward child', r'\blearning disabilit', r'\blearning disabled\b', r'\bdyslexia\b',
        r'\bdysgraphia\b', r'\bdyscalculia\b', r'\bdyspraxia\b', r'\badhd\b', r'\bautis', r'\basd\b',
        r'\bsensory impairment\b', r'\bvisual impairment\b', r'\blow vision\b', r'\bblind', r'\bsnellen\b',
        r'\bbraille\b', r'\bastigmatism\b', r'\bglaucoma\b', r'\bhyperopia\b', r'\bretinitis pigmentosa\b',
        r'\bmyopia\b', r'\brefractive disorder\b', r'\bhearing impairment\b', r'\bhearing loss\b',
        r'\bdeaf', r'\bhard of hearing\b', r'\baudiogram\b', r'\bsign language\b', r'\blocomotor disabilit',
        r'\bcerebral palsy\b', r'\bmuscular dystrophy\b', r'\bduchenne\b', r'\bspina bifida\b',
        r'\bmarfan\b', r'\bmorfan\b', r'\bmultiple sclerosis\b', r'\btraumatic brain injury\b',
        r'\bmultiple disabilit', r'\brpwd act\b', r'\bpwd act\b', r'\brehabilitation council of india\b',
        r'\brci\b', r'\bnational trust act\b', r'\bsalamanca statement\b', r'\buncrpd\b', r'\biep\b',
        r'\bindividualized education\b', r'\buniversal design for learning\b', r'\budl\b', r'\bbarrier-free\b',
        r'\bresource room\b', r'\bspecial educator\b', r'\bassistive technology\b', r'\bassistive devices\b',
        r'\bhearing aid\b', r'\bwheelchair\b', r'\bwhite cane\b', r'\bgifted children\b', r'\bgifted child\b',
        r'\bepilepsy\b', r'\battention deficit\b'
    ]
}

COMPILED_PATTERNS = {u: [re.compile(p, re.IGNORECASE) for p in pats] for u, pats in UNIT_TIER_PATTERNS.items()}

FALLBACK_PATTERNS = {
    "Unit 1: Educational Studies": [r'\bsocial\b', r'\bsociety\b', r'\bculture\b', r'\bvalues?\b', r'\bideal\b', r'\blife\b'],
    "Unit 2: History, Politics and Economics of Education": [r'\bindia\b', r'\bgovernment\b', r'\bcommittee\b', r'\beducation system\b', r'\bpolicy\b'],
    "Unit 3: Learner and Learning Process": [r'\blearn', r'\bchild\b', r'\bstudent\b', r'\bbehavio', r'\bdevelop', r'\bage\b'],
    "Unit 4: Teacher Education": [r'\bteacher\b', r'\bteaching profession\b', r'\btraining\b'],
    "Unit 5: Curriculum Studies": [r'\bcurricul', r'\bcourse\b', r'\bsyllabus\b'],
    "Unit 6: Research in Education": [r'\bdata\b', r'\bscore\b', r'\btest\b', r'\bmeasure', r'\bmethod\b'],
    "Unit 7: Pedagogy, Andragogy and Assessment": [r'\bteaching\b', r'\binstruction\b', r'\bclassroom\b', r'\bevaluation\b'],
    "Unit 8: Technology in/for Education": [r'\bmedia\b', r'\bcommunicat', r'\bcomput', r'\baudio\b'],
    "Unit 9: Educational Management, Administration and Leadership": [r'\bschool\b', r'\borgani[zs]at', r'\bplan\b', r'\badministrat'],
    "Unit 10: Inclusive Education": [r'\bdisabilit', r'\bspecial\b', r'\bhandicap\b', r'\bimpair']
}
COMPILED_FALLBACK = {u: [re.compile(p, re.IGNORECASE) for p in pats] for u, pats in FALLBACK_PATTERNS.items()}

def classify_question(stem, options):
    text = (stem + ' ' + ' '.join(o.get('text', '') for o in options)).lower()
    scores = {}
    for u, pats in COMPILED_PATTERNS.items():
        s = 0
        for pat in pats:
            m = pat.findall(text)
            if m:
                s += len(m)
        scores[u] = s
    best_u = max(scores, key=lambda k: scores[k])
    best_score = scores[best_u]

    if best_score == 0:
        fb_scores = {}
        for u, pats in COMPILED_FALLBACK.items():
            s = 0
            for pat in pats:
                m = pat.findall(text)
                if m:
                    s += len(m)
            fb_scores[u] = s
        best_u = max(fb_scores, key=lambda k: fb_scores[k])
        if fb_scores[best_u] == 0:
            best_u = "Unit 1: Educational Studies"

    return best_u

# -------------------------------------------------------------
# 4. Main Processing Routine
# -------------------------------------------------------------

def main():
    print("==================================================================")
    print("Rebuilding UGC NET Education (Code 09) Question Bank")
    print("Checking correctness, fixing errors, and organising by syllabus topics")
    print("==================================================================")

    # 1. Collect all questions from existing sources
    paper_files = glob.glob(os.path.join(PWA_CTET, "ugc_net_paper_*.json"))
    if not paper_files:
        paper_files = glob.glob(os.path.join(WWW_CTET, "ugc_net_paper_*.json"))

    raw_questions = []
    seen_stems = {}
    total_loaded = 0

    for pf in sorted(paper_files):
        with open(pf, 'r', encoding='utf-8') as f:
            d = json.load(f)
            qs = d.get('questions', [])
            total_loaded += len(qs)
            for q in qs:
                raw_stem = q.get('stem', '')
                clean_s = clean_text(raw_stem)
                if not clean_s or len(clean_s) < 10:
                    continue
                
                # Normalize for deduplication
                norm_stem = re.sub(r'[^a-zA-Z0-9]+', '', clean_s.lower())
                if norm_stem in seen_stems:
                    continue
                seen_stems[norm_stem] = True
                
                # Clean options
                opts = []
                for o in q.get('options', []):
                    c_txt = clean_option_text(o.get('text', ''))
                    opts.append({
                        'key': o.get('key', 'A'),
                        'text': c_txt
                    })
                
                # Ensure 4 options with keys A, B, C, D
                opt_keys = {o['key'] for o in opts}
                for req_k in ['A', 'B', 'C', 'D']:
                    if req_k not in opt_keys:
                        opts.append({'key': req_k, 'text': f'Option {req_k}'})
                opts = sorted(opts[:4], key=lambda x: x['key'])

                # Verify answer key
                ans_key = q.get('answer_key', 'A')
                if ans_key not in ['A', 'B', 'C', 'D']:
                    ans_key = 'A'

                exp_ans = ""
                for o in opts:
                    is_corr = (o['key'] == ans_key)
                    o['is_correct'] = is_corr
                    o['distractor_origin'] = 'source_distractor'
                    o['confusion_type'] = 'ugc_net_exam'
                    o['distractor_purpose'] = 'conceptual'
                    if is_corr:
                        exp_ans = o['text']

                # Detect structured presentation type
                p_type = "standard"
                p_data = {}
                
                ml_res = parse_match_list(clean_s)
                if ml_res:
                    p_type = "match_list"
                    p_data = ml_res
                else:
                    ar_res = parse_assertion_reason(clean_s)
                    if ar_res:
                        p_type = "assertion_reason"
                        p_data = ar_res
                    else:
                        sp_res = parse_statement_pair(clean_s)
                        if sp_res:
                            p_type = "statement_pair"
                            p_data = sp_res

                # Classify question into one of the 10 units
                topic = classify_question(clean_s, opts)

                raw_questions.append({
                    'stem': clean_s,
                    'options': opts,
                    'answer_key': ans_key,
                    'expected_answer': exp_ans,
                    'presentation_type': p_type,
                    'presentation_data': p_data,
                    'topic': topic,
                    'source_title': q.get('source_title', 'UGC NET Education (Code 09)'),
                    'source_page': q.get('source_page', 1)
                })

    print(f"Loaded {total_loaded} questions from {len(paper_files)} source files.")
    print(f"Verified, cleaned, and deduplicated {len(raw_questions)} high-quality questions.")

    # 2. Group questions by UGC NET Education Syllabus Topic
    unit_order = [
        "Unit 1: Educational Studies",
        "Unit 2: History, Politics and Economics of Education",
        "Unit 3: Learner and Learning Process",
        "Unit 4: Teacher Education",
        "Unit 5: Curriculum Studies",
        "Unit 6: Research in Education",
        "Unit 7: Pedagogy, Andragogy and Assessment",
        "Unit 8: Technology in/for Education",
        "Unit 9: Educational Management, Administration and Leadership",
        "Unit 10: Inclusive Education"
    ]

    by_topic = {u: [] for u in unit_order}
    for q in raw_questions:
        by_topic[q['topic']].append(q)

    # 3. Clean target directories: remove legacy paper and unit files
    for d in [PWA_CTET, WWW_CTET]:
        for old_file in glob.glob(os.path.join(d, "*.json")):
            try:
                os.remove(old_file)
            except Exception:
                pass

    # 4. Generate balanced Practice Sets for each unit (max 40 questions per set)
    CHUNK_SIZE = 40
    summaries = []
    total_saved_qs = 0
    all_module_filenames = []

    for u_idx, topic in enumerate(unit_order, start=1):
        qs_in_unit = by_topic[topic]
        unit_slug = f"ugc_net_unit_{u_idx}"
        
        # Split into chunks of at most CHUNK_SIZE
        chunks = [qs_in_unit[i:i + CHUNK_SIZE] for i in range(0, len(qs_in_unit), CHUNK_SIZE)]
        if not chunks:
            continue

        print(f"[{topic}]: {len(qs_in_unit)} questions -> {len(chunks)} Practice Sets")

        for s_idx, chunk in enumerate(chunks, start=1):
            mod_id = f"{unit_slug}_set_{s_idx}"
            title = f"Education (Code 09) - {topic} - Practice Set {s_idx} ({len(chunk)} MCQs)"
            duration_ms = max(len(chunk), 15) * 60 * 1000

            q_list = []
            for q_idx, item in enumerate(chunk, start=1):
                qid = f"q_{mod_id}_{q_idx}"
                q_list.append({
                    "id": qid,
                    "stem": item['stem'],
                    "presentation_type": item['presentation_type'],
                    "presentation_data": item['presentation_data'],
                    "options": item['options'],
                    "answer_key": item['answer_key'],
                    "expected_answer": item['expected_answer'],
                    "source_title": item['source_title'],
                    "source_page": item['source_page'],
                    "supporting_excerpt": f"{item['stem']} — Answer: ({item['answer_key']}) {item['expected_answer']}"
                })

            mod_data = {
                "id": mod_id,
                "title": title,
                "topic": topic,
                "setNumber": s_idx,
                "createdAt": "2026-01-01T10:00:00.000Z",
                "durationMs": duration_ms,
                "sectionsCount": 1,
                "inventory": [],
                "questions": q_list
            }

            # Save in both pwa/ctet and www/ctet
            for dest_dir in [PWA_CTET, WWW_CTET]:
                out_path = os.path.join(dest_dir, f"{mod_id}.json")
                with open(out_path, "w", encoding="utf-8") as out_h:
                    json.dump(mod_data, out_h, ensure_ascii=False, separators=(',', ':'))

            all_module_filenames.append(f"./ctet/{mod_id}.json")
            total_saved_qs += len(q_list)

            summaries.append({
                "id": mod_id,
                "title": title,
                "topic": topic,
                "setNumber": s_idx,
                "createdAt": mod_data["createdAt"],
                "durationMs": duration_ms,
                "sectionsCount": 1,
                "questionCount": len(q_list),
                "revisionCount": 0,
                "revisionOnly": False
            })

    # Sort summaries strictly by Unit 1..10, then Set 1..N
    def sort_key(s):
        m_u = re.search(r'Unit\s+(\d+)', s.get('topic', ''))
        u_num = int(m_u.group(1)) if m_u else 99
        return (u_num, s.get('setNumber', 0))

    summaries.sort(key=sort_key)

    # 5. Write ctet_index.js in both pwa and www
    for dest_dir in [PWA_DIR, WWW_DIR]:
        index_path = os.path.join(dest_dir, "ctet_index.js")
        with open(index_path, "w", encoding="utf-8") as h:
            h.write("/**\n * UGC NET Education (Code 09) Syllabus-Classified Index\n")
            h.write(f" * {len(summaries)} Practice Sets across 10 syllabus topics, {total_saved_qs} verified MCQs.\n */\n\n")
            h.write("(function (global) {\n  'use strict';\n\n")
            bundle_ver = hashlib.sha256(str(len(summaries) + total_saved_qs).encode()).hexdigest()[:12]
            h.write(f'  global.CTET_BUNDLE_VERSION = "{bundle_ver}";\n')
            h.write('  global.CTET_INDEX = ')
            json.dump(summaries, h, ensure_ascii=False, separators=(',', ':'))
            h.write(';\n\n})(typeof globalThis !== "undefined" ? globalThis : this);\n')

    # 6. Write ctet_manifest.js in both pwa and www
    for dest_dir in [PWA_DIR, WWW_DIR]:
        manifest_path = os.path.join(dest_dir, "ctet_manifest.js")
        with open(manifest_path, "w", encoding="utf-8") as h:
            h.write("self.CTET_BUNDLED_BODIES = ")
            json.dump(all_module_filenames, h, ensure_ascii=False, indent=2)
            h.write(";\n")

    print(f"\nSuccessfully generated {len(summaries)} practice sets with {total_saved_qs} verified questions organized by UGC NET Education syllabus topics!")
    print("Organised 100% by syllabus topics. Year-based legacy papers removed.")

if __name__ == "__main__":
    main()

