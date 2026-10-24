"""
StudySynth CTET — shared quality gate for engine-generated study modules.

The deterministic PWA engine is deliberately conservative, but NCERT narrative
prose makes it lift mid-sentence fragments as fact subjects, e.g.

    "According to the passage, what does These two together allow?"
    "According to the passage, what measurement is stated for = 500 km, calculate..."

Those questions are source-backed but unreadable, so they are dropped here
rather than shipped. The gate only ever *removes* unreadable wording; it never
rewrites a stem, an answer, or an explanation, so every surviving question stays
verbatim source-verified.

Official CTET past-paper modules build their own `pedagogical_fact` records that
carry no `subject`, so they are never touched by this gate.
"""

import re

PRONOUN_START = {
    'this', 'these', 'those', 'it', 'they', 'he', 'she', 'you', 'we', 'that',
    'there', 'such', 'one', 'ones', 'as', 'and', 'but', 'or', 'so', 'then',
    'thus', 'hence', 'however', 'also', 'here', 'what', 'which', 'who', 'when',
    'where', 'why', 'how', 'if', 'while', 'because', 'them', 'his', 'her',
    'their', 'our', 'your', 'my', 'its'
}

STOP_END = {
    'of', 'the', 'a', 'an', 'and', 'in', 'to', 'with', 'for', 'as', 'that',
    'which', 'this', 'these', 'those', 'by', 'on', 'from', 'or', 'but', 'is',
    'are', 'was', 'were', 'be', 'been', 'at', 'into', 'than', 'then', 'when',
    'where', 'while', 'not', 'no', 'if', 'its', 'their', 'our', 'your', 'his',
    'her', 'about', 'over', 'under', 'between', 'through', 'during', 'very',
    'more', 'most', 'much', 'many', 'some', 'any', 'all', 'each', 'every',
    'such', 'other', 'another', 'also', 'both', 'either', 'neither', 'nor'
}

ACTIVITY_LEAD = re.compile(
    r'^\s*(Let us|Let each|Let the|Let\b|Activity|Activities|Do you know|'
    r'Did you know|Note for the Teacher|Exercise|Exercises|Discuss|Find out|'
    r'Project|Think and discuss|Try this|Work in pairs|Group work|Read the|'
    r'Look at|Observe|Imagine|Suppose|Calculate|Compute)\b',
    re.IGNORECASE
)

ARITHMETIC = re.compile(
    r'[=<>]|\d\s*/\s*\d|\bcalculate\b|\bper cent of\b|\bpercent of\b',
    re.IGNORECASE
)

QUOTE_CHARS = '"\u201c\u201d\u2018\u2019\''


def _words(value):
    return [w for w in re.split(r'\s+', (value or '').strip()) if w]


def _first_word(value):
    words = _words(value)
    return words[0].strip(QUOTE_CHARS) if words else ''


def _last_word(value):
    words = _words(value)
    return words[-1].lower().strip('.,;:') if words else ''


def is_fragment_subject(subject):
    """True when a fact's subject is a mid-sentence snippet, not a real entity."""
    s = (subject or '').strip()
    if not s or len(s) > 70:
        return True
    if ARITHMETIC.search(s) or ACTIVITY_LEAD.search(s):
        return True
    if not _words(s):
        return True
    if _first_word(s).lower() in PRONOUN_START:
        return True
    if _last_word(s) in STOP_END:
        return True
    return False


def is_fragment_stem(stem):
    """True when the rendered question wording is unusable on its own."""
    s = (stem or '').strip()
    if not s or len(s) < 30:
        return True
    if ARITHMETIC.search(s):
        return True
    match = re.search(
        r'\b(?:what|which|who)\b[^?]{0,80}?\b(?:does|do|is|are|was|were)\b\s+(.{0,60})',
        s, re.IGNORECASE
    )
    if match and _first_word(match.group(1)).lower() in PRONOUN_START:
        return True
    if re.search(r'\b(?:included in|based on)\s+[A-Z][a-z]+', s):
        return True
    return False


def looks_like_title(value, module_title):
    """A plausible heading for the 'source' line above a question."""
    s = (value or '').strip()
    if s and s == (module_title or '').strip():
        return True
    if len(s) < 3 or len(s) > 60:
        return False
    if ARITHMETIC.search(s):
        return False
    if len(_words(s)) > 9:
        return False
    if _first_word(s).lower() in PRONOUN_START:
        return False
    if _last_word(s) in STOP_END:
        return False
    return True


def _typed_fact(fact):
    """Facts minted by the engine carry a subject; official-PYQ facts do not."""
    return bool(fact) and 'subject' in fact


def source_label(module_title):
    """The short, learner-facing source name (the chapter, not the full path)."""
    title = (module_title or '').strip()
    if ' - ' in title:
        tail = title.split(' - ')[-1].strip()
        if tail:
            return tail
    return title


def sanitize_module_titles(module, module_title=None):
    """Replace unusable 'source' lines with the chapter name. Never drops content."""
    title = module_title or module.get('title') or ''
    label = source_label(title)
    replaced = 0

    def fixed(value):
        nonlocal replaced
        if value == label or looks_like_title(value, title):
            return value
        replaced += 1
        return label

    for unit in (module.get('inventory') or []):
        unit['section_title'] = fixed(unit.get('section_title'))
    for question in (module.get('questions') or []):
        question['source_title'] = fixed(question.get('source_title'))
    module['title'] = title or module.get('title')
    return replaced


def filter_module(module, module_title=None, drop_questions=True):
    """Drop unreadable engine questions/facts. Returns a report dict."""
    title = module_title or module.get('title') or ''
    inventory = module.get('inventory') or []
    questions = module.get('questions') or []

    if not drop_questions:
        sanitize_module_titles(module, title)
        return {
            'question_dropped': 0,
            'question_kept': len(questions),
            'unit_dropped': 0,
            'fact_dropped': 0,
        }

    facts_by_id = {}
    for unit in inventory:
        for fact in (unit.get('revision_facts') or []):
            if fact.get('fact_id'):
                facts_by_id[fact['fact_id']] = fact

    bad_fact_ids = {
        fid for fid, fact in facts_by_id.items()
        if _typed_fact(fact) and is_fragment_subject(fact.get('subject'))
    }

    kept_questions = []
    dropped_questions = 0
    for question in questions:
        fact_ids = ((question.get('evidence') or {}).get('fact_ids')) or []
        typed_ids = [fid for fid in fact_ids if _typed_fact(facts_by_id.get(fid))]
        if typed_ids and (
            any(fid in bad_fact_ids for fid in typed_ids)
            or is_fragment_stem(question.get('stem'))
        ):
            dropped_questions += 1
            continue
        if not looks_like_title(question.get('source_title'), title):
            question['source_title'] = source_label(title)
        kept_questions.append(question)

    kept_inventory = []
    dropped_units = 0
    dropped_facts = 0
    for unit in inventory:
        facts = unit.get('revision_facts') or []
        typed = [f for f in facts if _typed_fact(f)]
        if typed and all(f.get('fact_id') in bad_fact_ids for f in typed):
            dropped_units += 1
            continue
        kept_facts = []
        for fact in facts:
            if fact.get('fact_id') in bad_fact_ids:
                dropped_facts += 1
                continue
            kept_facts.append(fact)
        if kept_facts:
            unit['revision_facts'] = kept_facts
        if not looks_like_title(unit.get('section_title'), title):
            unit['section_title'] = source_label(title)
        kept_inventory.append(unit)

    module['questions'] = kept_questions
    module['inventory'] = kept_inventory
    if kept_inventory:
        module['sectionsCount'] = max(1, module.get('sectionsCount') or 1)

    return {
        'question_dropped': dropped_questions,
        'question_kept': len(kept_questions),
        'unit_dropped': dropped_units,
        'fact_dropped': dropped_facts,
    }
