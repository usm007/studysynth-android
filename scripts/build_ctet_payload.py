"""
StudySynth CTET — builds the bundled study payload for the PWA.

Reads every generated module from output/ctet_modules/, applies the shared
quality gate, and writes:

  pwa/ctet_index.js   tiny synchronous index (id, title, counts) — parsed at startup
  pwa/ctet/<id>.json  full module bodies — fetched only when a set is opened

Keeping the index separate means startup never parses the whole corpus, and the
bodies are never duplicated into device storage.
"""

import io
import os
import re
import sys
import json
import glob
import hashlib

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

from ctet_quality import sanitize_module_titles

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_DIR = os.path.join(ROOT, "output", "ctet_modules")
OUT_INDEX = os.path.join(ROOT, "pwa", "ctet_index.js")
OUT_MANIFEST = os.path.join(ROOT, "pwa", "ctet_manifest.js")
OUT_BODIES = os.path.join(ROOT, "pwa", "ctet")
LEGACY = os.path.join(ROOT, "pwa", "ctet_data.js")


def module_summary(module):
    questions = module.get("questions") or []
    inventory = module.get("inventory") or []
    return {
        "id": module["id"],
        "title": module.get("title"),
        "createdAt": module.get("createdAt"),
        "durationMs": module.get("durationMs", 0),
        "sectionsCount": module.get("sectionsCount", 0),
        "questionCount": len(questions),
        "revisionCount": len(inventory),
        "revisionOnly": len(questions) == 0,
    }


def main():
    paths = sorted(glob.glob(os.path.join(SRC_DIR, "*.json")))
    if not paths:
        raise SystemExit("No module JSON files found in %s" % SRC_DIR)

    os.makedirs(OUT_BODIES, exist_ok=True)
    for stale in glob.glob(os.path.join(OUT_BODIES, "*.json")):
        os.remove(stale)

    summaries = []
    digest = hashlib.sha256()
    questions_total = 0

    for path in paths:
        module = json.load(io.open(path, encoding="utf-8"))
        module_id = module["id"]
        sanitize_module_titles(module, module.get("title"))
        body = json.dumps(module, ensure_ascii=False, separators=(",", ":"))
        digest.update(module_id.encode("utf-8"))
        digest.update(body.encode("utf-8"))
        with io.open(os.path.join(OUT_BODIES, module_id + ".json"), "w", encoding="utf-8") as handle:
            handle.write(body)
        summaries.append(module_summary(module))
        questions_total += len(module.get("questions") or [])

    version = digest.hexdigest()[:12]

    with io.open(OUT_INDEX, "w", encoding="utf-8") as handle:
        handle.write("/**\n")
        handle.write(" * StudySynth CTET — bundled set index (%d sets, %d questions).\n" % (len(summaries), questions_total))
        handle.write(" * Module bodies live in ./ctet/<id>.json and load only when opened.\n")
        handle.write(" */\n\n")
        handle.write("(function (global) {\n")
        handle.write("  'use strict';\n\n")
        handle.write('  global.CTET_BUNDLE_VERSION = "%s";\n' % version)
        handle.write("  global.CTET_INDEX = ")
        json.dump(summaries, handle, ensure_ascii=False, separators=(",", ":"))
        handle.write(";\n\n")
        handle.write("})(typeof globalThis !== 'undefined' ? globalThis : this);\n")

    if os.path.exists(LEGACY):
        os.remove(LEGACY)

    manifest_paths = ["./ctet/%s.json" % s["id"] for s in summaries]
    with io.open(OUT_MANIFEST, "w", encoding="utf-8") as handle:
        handle.write("/**\n")
        handle.write(" * StudySynth CTET — generated offline manifest (%d module bodies).\n" % len(manifest_paths))
        handle.write(" * Consumed by sw.js so the installed app works without a network.\n")
        handle.write(" */\n\n")
        handle.write("self.CTET_BUNDLED_BODIES = ")
        json.dump(manifest_paths, handle, ensure_ascii=False, indent=0)
        handle.write(";\n")

    print("module bodies : %d -> %s" % (len(summaries), OUT_BODIES))
    print("index         : %s" % OUT_INDEX)
    print("offline list  : %s" % OUT_MANIFEST)
    print("bundle version: %s" % version)
    print("questions     : %d" % questions_total)


if __name__ == "__main__":
    main()
