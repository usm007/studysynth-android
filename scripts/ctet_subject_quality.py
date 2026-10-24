"""How usable a generated question's topic is.

This is the single rule behind every quality number reported for the CTET
bundled chapters. It is a deliberately strict proxy for "would a learner
understand what this question is about", not a build input: nothing here
changes what ships, it only makes the before/after comparison auditable.

Ported unchanged from the spike that measured 35% usable topics on raw page
text and 53% on AI-gated text.
"""

import re

VERB_WORDS = {
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'will', 'shall', 'would',
    'should', 'can', 'could', 'may', 'might', 'must', 'has', 'have', 'had', 'do',
    'does', 'did', 'means', 'mean', 'made', 'make', 'say', 'says', 'said',
    'become', 'becomes', 'became',
}

LEADING_WORDS = {
    'this', 'these', 'those', 'it', 'they', 'he', 'she', 'you', 'we', 'that',
    'there', 'such', 'one', 'ones', 'as', 'and', 'but', 'or', 'so', 'then',
    'thus', 'hence', 'however', 'also', 'here', 'what', 'which', 'who', 'when',
    'where', 'why', 'how', 'if', 'while', 'them', 'his', 'her', 'their', 'our',
    'your', 'my', 'its', 'each', 'every', 'both', 'some', 'any', 'all',
    'several', 'many',
}


def usable_subject(subject):
    """True when the topic line reads as a short noun phrase a learner can follow."""
    subject = (subject or '').strip().strip('"\'')
    if not subject or len(subject) > 45:
        return False
    words = [word for word in re.split(r'\s+', subject) if word]
    if not words or len(words) > 6:
        return False
    if ',' in subject or ';' in subject or ':' in subject or '=' in subject:
        return False
    if any(word.lower().strip('.,;:') in VERB_WORDS for word in words):
        return False
    if words[0].lower() in LEADING_WORDS:
        return False
    if len(words) == 1 and words[0][:1].islower():
        return False
    if re.search(r'\d{3,}', subject) and len(words) > 3:
        return False
    return True


def module_quality(module):
    """Usable-question counts for one generated module."""
    facts = {}
    for unit in module.get("inventory") or []:
        for fact in (unit.get("revision_facts") or []):
            facts[fact.get("fact_id")] = fact

    usable = 0
    total = 0
    for question in module.get("questions") or []:
        fact_ids = ((question.get("evidence") or {}).get("fact_ids")) or []
        typed = [facts[fid] for fid in fact_ids if fid in facts and 'subject' in (facts[fid] or {})]
        if not typed:
            continue
        total += 1
        if all(usable_subject(fact.get("subject")) for fact in typed):
            usable += 1

    return {
        "usable": usable,
        "questions": total,
        "inventory": len(module.get("inventory") or []),
        "usable_rate": (usable / total) if total else 0.0,
    }
