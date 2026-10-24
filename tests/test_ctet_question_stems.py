"""Published questions must be answerable from what the learner can see.

A stem that says "according to the passage" points at a passage the learner
cannot see, so the body must carry the source line with the tested value
blanked. A stem must also never be about a pronoun or a punctuation fragment
left over from extraction.
"""

import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[1]
BODIES = ROOT / "pwa" / "ctet"

DUMMY_SUBJECT = re.compile(r"\b(?:we|you|they|it|this|that|there|these|those|he|she)\b")
PRONOUN_AFTER_PREPOSITION = re.compile(
    r"\b(?:for|with|of|to|about)\s+(?:we|you|they|it|this|that|there|these|those|he|she)\b",
    re.IGNORECASE,
)
FRAGMENT_SUBJECT = re.compile(r"\b(?:for|with|of|to|about)\s*[=;:,]")


def published_questions():
    paths = sorted(BODIES.glob("*.json"))
    assert paths, "no published question bodies found"
    for path in paths:
        # The solved-paper sets are verbatim exam questions, not generated
        # stems, so the extraction rules do not apply to them.
        if path.stem.startswith("ctet_pyq_"):
            continue
        module = json.loads(path.read_text(encoding="utf-8"))
        for question in module.get("questions") or []:
            yield path.stem, question


def test_passage_stems_show_masked_source_context():
    checked = 0
    problems = []
    for module_id, question in published_questions():
        stem = question.get("stem") or ""
        if not stem.lower().startswith("according to the passage"):
            continue
        checked += 1
        label = "%s %s" % (module_id, question.get("id"))
        context = (question.get("context") or "").strip()
        if not context:
            problems.append("%s: no context for stem %r" % (label, stem))
            continue
        if "______" not in context:
            problems.append("%s: context does not blank the answer: %r" % (label, context))
        answer = (question.get("expected_answer") or "").strip().lower()
        if answer and answer in context.lower():
            problems.append("%s: context gives away the answer: %r" % (label, context))
    assert checked > 0, "no passage-referencing stems were found to check"
    assert not problems, "\n".join(problems[:20])


def test_stems_never_ask_about_a_pronoun_or_fragment():
    problems = []
    for module_id, question in published_questions():
        if question.get("question_subtype") == "fill_blank":
            continue
        stem = question.get("stem") or ""
        if DUMMY_SUBJECT.search(stem) or PRONOUN_AFTER_PREPOSITION.search(stem) or FRAGMENT_SUBJECT.search(stem):
            problems.append("%s %s: %r" % (module_id, question.get("id"), stem))
    assert not problems, "\n".join(problems[:20])
