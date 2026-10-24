"""Before/after quality report for the gated bundled chapters.

Compares two directories of generated module JSONs and prints how many
questions each side produced and how many of those have a topic a learner can
actually follow. Numbers come from the committed rule in ctet_subject_quality,
so the comparison is auditable rather than impressionistic.
"""

import io
import json
import os
import sys

import ctet_subject_quality

sys.stdout.reconfigure(encoding='utf-8')


def _load(directory, chapter_id):
    path = os.path.join(directory, chapter_id + '.json')
    if not os.path.exists(path):
        return None
    with io.open(path, encoding='utf-8') as handle:
        return json.load(handle)


def compare(before_dir, after_dir, ids):
    """One row per chapter: both sides' quality dicts, or None where a file is missing."""
    rows = []
    for chapter_id in ids:
        before = _load(before_dir, chapter_id)
        after = _load(after_dir, chapter_id)
        rows.append({
            'id': chapter_id,
            'before': ctet_subject_quality.module_quality(before) if before else None,
            'after': ctet_subject_quality.module_quality(after) if after else None,
        })
    return rows


def _fmt(value):
    return 'missing' if value is None else str(value)


def _rate(side):
    return '-' if side is None else '%.0f%%' % (100 * side['usable_rate'])


def report(rows):
    header = '%-14s %10s %10s %8s %8s %10s %10s' % (
        'chapter', 'questions', '', 'usable', '', 'rate', ''
    )
    print(header)
    totals = {'before': [0, 0], 'after': [0, 0]}
    for row in rows:
        before, after = row['before'], row['after']
        for side_name, side in (('before', before), ('after', after)):
            if side:
                totals[side_name][0] += side['questions']
                totals[side_name][1] += side['usable']
        print('%-14s %10s %10s %8s %8s %10s %10s' % (
            row['id'],
            _fmt(before and before['questions']),
            _fmt(after and after['questions']),
            _fmt(before and before['usable']),
            _fmt(after and after['usable']),
            _rate(before),
            _rate(after),
        ))

    print()
    for side_name in ('before', 'after'):
        questions, usable = totals[side_name]
        rate = (100 * usable / questions) if questions else 0
        print('%s: %d questions, %d usable (%.0f%%)' % (side_name, questions, usable, rate))

    drops = []
    for row in rows:
        if row['before'] and row['after']:
            drops.append((row['after']['usable'] - row['before']['usable'], row['id']))
    drops.sort()
    print()
    print('largest usable-count drops:')
    for delta, chapter_id in drops[:5]:
        print('  %s %+d' % (chapter_id, delta))
    return 0


def main(argv):
    if len(argv) != 2:
        print('usage: python scripts/ctet_gate_report.py <before_dir> <after_dir>')
        return 2
    import ctet_sources
    rows = compare(argv[0], argv[1], [c['id'] for c in ctet_sources.all_chapters()])
    return report(rows)


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
