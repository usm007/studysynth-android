"""
StudySynth CTET — AI source gate (spike).

Splits a chapter's extracted PDF text into numbered sentences and strips
page furniture, figure captions, activity boxes and running heads. An AI
pass then picks the sentence numbers worth asking questions about; the
deterministic PWA engine is run on **only those sentences, verbatim**.

Nothing is ever reworded, so every evidence quote stays the textbook's own
words. This module only prepares the candidate list, renders it for review,
and rebuilds the gated text from the chosen numbers.
"""

import hashlib
import io
import json
import os
import re
import sys

from ctet_sources import all_chapters, chapter_source

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# --- furniture ------------------------------------------------------------

LIGATURES = {'\ufb01': 'fi', '\ufb02': 'fl', '\ufb00': 'ff', '\ufb03': 'ffi', '\ufb04': 'ffl'}
BULLETS = '\u2022\u25cf\u25a0\u25a1\u25aa\u25ab\u2794\u2192\x83\x84\x85\x86\x87\x8a\x8b\x91\x92\x93\x94\x95\x96\x97\x98\x99\x0b'

FURNITURE = re.compile(
    r'(\.indd'
    r'|^\s*\d{1,4}\s*$'
    r'|^\s*Reprint\b'
    r'|^\s*(?:First|Second|Third|Revised)\s+Edition\b'
    r'|^\s*Not to scale\b'
    r'|^\s*Exploring Society\s*[:,]'
    r'|^\s*(?:ISBN|PD)\b'
    r'|^\s*Printed\b'
    r')',
    re.IGNORECASE
)

CAPTION = re.compile(r'^\s*(Fig\.?|Figure|Table|Map\s+\d|Box\s+\d|Source\s*:)\s*\d*', re.IGNORECASE)

TERMINAL = re.compile(r'[.!?:\u201d"\')]$')


def normalize(text):
    text = text.replace('\u00ad', '')
    for key, value in LIGATURES.items():
        text = text.replace(key, value)
    text = text.replace('\u2019', "'").replace('\u2018', "'")
    text = text.replace('\u201c', '"').replace('\u201d', '"')
    return text


def norm_key(text):
    """Lowercase, unify dashes, drop punctuation — for fuzzy heading match."""
    text = text.lower()
    for dash in '\u2010\u2011\u2012\u2013\u2014\u2015':
        text = text.replace(dash, ' ')
    text = re.sub(r"[^a-z0-9]+", ' ', text)
    return re.sub(r'\s+', ' ', text).strip()


def is_furniture(line, chapter_title, book_title):
    if FURNITURE.search(line):
        return True
    key = norm_key(line)
    # Running heads: the line is mostly the book or chapter title.
    if len(key) <= 120:
        for title in (book_title, chapter_title):
            title_key = norm_key(title or '')
            if title_key and title_key in key:
                return True
    if CAPTION.match(line):
        return True
    # A lone figure/axis label such as "15°E" or "10 AM" (must carry a digit).
    if len(line) <= 24 and re.search(r'\d', line) and not TERMINAL.search(line):
        if re.fullmatch(r'[\d\s\u00b0A-Za-z.,:\u2013\u2014-]+', line) and len(line.split()) <= 4:
            return True
    return False


# --- preparation ----------------------------------------------------------

def repeated_short_lines(raw):
    """Short lines that occur more than once are running heads, not prose."""
    counts = {}
    for line in normalize(raw).split('\n'):
        bare = line.strip().lstrip(BULLETS).strip()
        if not bare or len(bare) > 90:
            continue
        key = norm_key(bare)
        if not key or ' ' not in key:
            continue
        counts[key] = counts.get(key, 0) + 1
    return {key for key, seen in counts.items() if seen >= 2}


def reflow(raw, chapter_title, book_title):
    """Drop furniture and rejoin sentences broken across lines."""
    repeats = repeated_short_lines(raw)
    lines = []
    for line in normalize(raw).split('\n'):
        line = line.strip()
        if not line:
            lines.append('')
            continue
        # Bullets are their own item, so one bullet never becomes a wall of text.
        marker = re.match(r'^[\-\u2013\u2014]\s+', line)
        if marker:
            line = line[marker.end():].strip()
        bare = line.lstrip(BULLETS).strip()
        if not bare or is_furniture(bare, chapter_title, book_title):
            continue
        if norm_key(bare) in repeats:
            continue
        # Keep bullet/numbered items as their own line; keep captions out.
        bulleted = bare != line or bool(marker)
        numbered = bool(re.match(r'^\d{1,2}[.)]\s+\S', bare))
        lines.append(('\x00' if (bulleted or numbered) else '') + bare)

    paragraphs = []
    buffer = ''
    pending_break = False
    for line in lines:
        if not line:
            pending_break = True
            continue
        hard_break = line.startswith('\x00')
        text = line.lstrip('\x00').strip()
        if not text:
            continue
        if buffer and (hard_break or pending_break):
            # A page break can land mid-sentence; keep joining only when the
            # run of text plainly continues (unfinished and starting lowercase).
            continues = (not hard_break
                         and not TERMINAL.search(buffer)
                         and text[:1].islower())
            if not continues:
                paragraphs.append(buffer)
                buffer = ''
        pending_break = False
        if buffer:
            if buffer.endswith('-') and text[:1].islower():
                buffer = buffer[:-1] + text
            else:
                buffer = buffer + ' ' + text
        else:
            buffer = text
        if TERMINAL.search(buffer):
            paragraphs.append(buffer)
            buffer = ''
    if buffer:
        paragraphs.append(buffer)

    joined = '\n'.join(re.sub(r'[ \t]+', ' ', p).strip() for p in paragraphs)
    joined = re.sub(r'\n{3,}', '\n\n', joined)
    return joined


SENTENCE_END = re.compile(r'(?<=[.!?\u201d"])\s+(?=[A-Z"\u2018\u201c(])')


def split_sentences(text):
    sentences = []
    for block in text.split('\n'):
        block = block.strip()
        if not block:
            continue
        for part in SENTENCE_END.split(block):
            part = part.strip()
            if not part:
                continue
            # A numbered list item is its own candidate.
            for item in re.split(r'(?<=[a-z\d\)])\s+(?=\d{1,2}[.)]\s+[A-Z])', part):
                item = item.strip()
                if len(item) >= 25:
                    sentences.append(item)
    return sentences


def prepare_text(raw_text, chapter_title, book_title):
    """The numbered candidate sentences for one chapter's extracted text."""
    return split_sentences(reflow(raw_text, chapter_title, book_title))


def render_numbered(sentences):
    return '\n'.join('%d. %s' % (i + 1, s) for i, s in enumerate(sentences))


def fingerprint(sentences):
    """Stable hash of an offered sentence list, used to detect source drift."""
    return 'sha256:' + hashlib.sha256(
        '\n'.join(sentences).encode('utf-8')
    ).hexdigest()


# --- committed decisions --------------------------------------------------

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP_DIR = os.path.join(ROOT, 'data', 'ctet_gate')


def keep_path(chapter_id):
    return os.path.join(KEEP_DIR, chapter_id + '.keep.txt')


def manifest_path():
    return os.path.join(KEEP_DIR, 'manifest.json')


def read_keep(path):
    with io.open(path, encoding='utf-8') as handle:
        return [int(token) for token in handle.read().split()]


def load_keep(chapter_id):
    """The committed sentence numbers for a chapter, or None if it has none."""
    path = keep_path(chapter_id)
    if not os.path.exists(path):
        return None
    return read_keep(path)


def _load_manifest():
    path = manifest_path()
    if not os.path.exists(path):
        return {}
    with io.open(path, encoding='utf-8') as handle:
        return json.load(handle)


def _write_manifest(data):
    os.makedirs(KEEP_DIR, exist_ok=True)
    with io.open(manifest_path(), 'w', encoding='utf-8') as handle:
        handle.write(json.dumps(data, indent=2, sort_keys=True))
        handle.write('\n')


def write_keep(chapter_id, numbers, meta):
    """Commit the chosen sentence numbers plus their audit record.

    `meta` needs `source`, `title` and `sentences` (the full offered list);
    `offered` defaults to the length of that list.
    """
    numbers = sorted({int(number) for number in numbers})
    os.makedirs(KEEP_DIR, exist_ok=True)
    with io.open(keep_path(chapter_id), 'w', encoding='utf-8') as handle:
        handle.write(''.join('%d\n' % number for number in numbers))

    sentences = list(meta['sentences'])
    manifest = _load_manifest()
    manifest[chapter_id] = {
        'source': meta.get('source', ''),
        'title': meta.get('title', ''),
        'offered': int(meta.get('offered', len(sentences))),
        'kept': len(numbers),
        'fingerprint': fingerprint(sentences),
        'questions': int(manifest.get(chapter_id, {}).get('questions', 0)),
        'inventory': int(manifest.get(chapter_id, {}).get('inventory', 0)),
    }
    _write_manifest(manifest)


def keep_stats(chapter_id):
    """(kept, offered) for a committed chapter, or None when it has no entry."""
    entry = _load_manifest().get(chapter_id)
    if not entry:
        return None
    return int(entry.get('kept', 0)), int(entry.get('offered', 0))


def record_result(chapter_id, questions, inventory):
    """Store how much a gated chapter actually produced, for the audit trail."""
    manifest = _load_manifest()
    if chapter_id not in manifest:
        return
    manifest[chapter_id]['questions'] = int(questions)
    manifest[chapter_id]['inventory'] = int(inventory)
    _write_manifest(manifest)


def gated_source(chapter_id, raw_text, chapter_title, book_title):
    """The chapter text the engine should read, or None when nothing is committed.

    An out-of-range or empty keep file is an error, never a silent fallback:
    it means the committed decisions no longer match this chapter's text. The
    same goes for a source whose sentences no longer hash to what was reviewed.
    """
    numbers = load_keep(chapter_id)
    if numbers is None:
        return None
    if not numbers:
        raise ValueError('%s: keep file is empty' % chapter_id)

    sentences = prepare_text(raw_text, chapter_title, book_title)
    entry = _load_manifest().get(chapter_id)
    if not entry:
        raise ValueError('%s: keep file has no audit record' % chapter_id)
    if entry.get('fingerprint') != fingerprint(sentences):
        raise ValueError(
            '%s: source text changed since the gate decision; re-review it'
            % chapter_id
        )
    validate_keep(chapter_id, numbers, len(sentences))
    return '\n'.join(sentences[number - 1] for number in sorted(set(numbers)))


# --- CLI ------------------------------------------------------------------

BASE_NCERT = r'C:\Users\Admin\Desktop\NCERT'
OUTPUT_DIR = os.path.join(ROOT, 'output', 'ctet_gate')


def prepare_all(chapter_ids=None):
    """Write the numbered candidate list for every chapter that goes through the gate."""
    if chapter_ids is None:
        chapter_ids = [chapter['id'] for chapter in all_chapters()]
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    rows = []
    for chapter_id in chapter_ids:
        raw, title, book_title = chapter_source(chapter_id)
        sentences = prepare_text(raw, title, book_title)
        path = os.path.join(OUTPUT_DIR, chapter_id + '.candidates.txt')
        with io.open(path, 'w', encoding='utf-8') as handle:
            handle.write(render_numbered(sentences) + '\n')
        rows.append({
            'id': chapter_id,
            'offered': len(sentences),
            'chars': sum(len(sentence) for sentence in sentences),
            'file': path,
        })
    return rows


def validate_keep(chapter_id, numbers, total):
    for number in numbers:
        if number < 1 or number > total:
            raise ValueError(
                '%s: keep index %d out of range (1..%d)' % (chapter_id, number, total)
            )


def import_keep(chapter_ids=None):
    """Move reviewed choices from the working list into the committed list."""
    if chapter_ids is None:
        chapter_ids = [chapter['id'] for chapter in all_chapters()]
    rows = []
    for chapter_id in chapter_ids:
        raw, title, book_title = chapter_source(chapter_id)
        sentences = prepare_text(raw, title, book_title)
        numbers = read_keep(os.path.join(OUTPUT_DIR, chapter_id + '.keep.txt'))
        if not numbers:
            raise ValueError('%s: review produced no kept sentences' % chapter_id)
        validate_keep(chapter_id, numbers, len(sentences))
        write_keep(chapter_id, numbers, {
            'source': chapter_id,
            'title': title,
            'offered': len(sentences),
            'sentences': sentences,
        })
        rows.append({
            'id': chapter_id,
            'kept': len(set(numbers)),
            'offered': len(sentences),
        })
    return rows


def main(argv):
    if not argv or argv[0] not in ('prepare', 'import'):
        print('usage: python scripts/ctet_source_gate.py prepare|import [id ...]')
        return 2
    command, chapter_ids = argv[0], argv[1:] or None
    if command == 'prepare':
        for row in prepare_all(chapter_ids):
            print('%(id)s offered=%(offered)d chars=%(chars)d' % row)
    else:
        for row in import_keep(chapter_ids):
            print('%(id)s %(kept)d/%(offered)d' % row)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
