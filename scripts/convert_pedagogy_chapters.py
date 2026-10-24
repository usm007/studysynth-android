"""Convert the bundled pedagogy chapters into PWA study modules.

The engine contract is unchanged: analyzeSource(rawText, title, sourceMeta, 30).
When a committed gate decision exists for a chapter, the engine reads only the
sentences that decision kept, verbatim, in their original order.
"""

import argparse
import json
import os
import subprocess
import sys
import time

from pypdf import PdfReader

from ctet_sources import PEDAGOGY_BOOK as book_pdf, PEDAGOGY_BOOK_TITLE, PEDAGOGY_CHAPTERS
import ctet_source_gate as gate

sys.setrecursionlimit(5000)
sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT_DIR, "output", "ctet_modules")
os.makedirs(OUT_DIR, exist_ok=True)

PEDAGOGY_SOURCE_NAME = "CTET_&_STETs__Child_Development Himanshi singh.pdf"

# Node worker
NODE_WORKER_CODE = """
const fs = require('fs');
const readline = require('readline');
const Analysis = require('./pwa/engine/analyze.js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const input = JSON.parse(line);
    const result = Analysis.analyzeSource(input.rawText, input.title, input.sourceMeta, 30);
    const output = {
      status: 'ok',
      sectionsCount: result.sections.length,
      factsCount: result.facts.length,
      inventoryCount: result.inventory.length,
      questionsCount: result.questions.length,
      validation: result.validation,
      generation: result.generation,
      questions: result.questions,
      inventory: result.inventory
    };
    process.stdout.write(JSON.stringify(output) + '\\n');
  } catch (err) {
    process.stdout.write(JSON.stringify({ status: 'error', message: err.message, stack: err.stack }) + '\\n');
  }
});
"""


def _should_process(out_file, force, only, chapter_id):
    """Whether this chapter needs a run: forced, uncached, or explicitly asked for."""
    if only and chapter_id not in only:
        return False
    if force:
        return True
    return not os.path.isfile(out_file)


def _source_text(chapter_id, raw_text, title, book_title):
    """(text for the engine, did the gate decide it).

    No committed decision means today's behaviour: the raw pages.
    """
    gated = gate.gated_source(chapter_id, raw_text, title, book_title)
    if gated is None:
        return raw_text, False
    return gated, True


def _gate_note(chapter_id, used_gate):
    stats = gate.keep_stats(chapter_id) if used_gate else None
    if not stats:
        return "raw (no keep file)" if not used_gate else "gated"
    kept, offered = stats
    return "gated %d/%d" % (kept, offered)


def _chapter_text(reader, ch):
    pages_text = []
    # 0-indexed: start_page - 1 to end_page
    for p in range(ch["start_page"] - 1, min(ch["end_page"], len(reader.pages))):
        txt = reader.pages[p].extract_text() or ""
        txt = txt.replace('□', ' ')
        pages_text.append(txt)
    return "\n\n".join(pages_text)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Convert the bundled pedagogy chapters.")
    parser.add_argument("--force", action="store_true", help="re-run even when a cached module exists")
    parser.add_argument("--only", default="", help="comma-separated chapter ids to convert")
    args = parser.parse_args(argv)
    only = {part.strip() for part in args.only.split(",") if part.strip()}

    print(f"Reading {book_pdf}...")
    reader = PdfReader(book_pdf)
    print(f"Total pages in book: {len(reader.pages)}")

    worker_path = os.path.join(ROOT_DIR, "node_ped_worker.js")
    with open(worker_path, "w", encoding="utf-8") as f:
        f.write(NODE_WORKER_CODE)

    proc = subprocess.Popen(
        ["node", worker_path],
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        encoding="utf-8",
        cwd=ROOT_DIR
    )

    generated_modules = []
    failures = []

    try:
        for idx, ch in enumerate(PEDAGOGY_CHAPTERS):
            out_file = os.path.join(OUT_DIR, f"{ch['id']}.json")
            if not _should_process(out_file, args.force, only, ch["id"]):
                if only and ch["id"] not in only:
                    continue
                try:
                    with open(out_file, "r", encoding="utf-8") as f:
                        module = json.load(f)
                    generated_modules.append(module)
                    print(f"[{idx+1}/{len(PEDAGOGY_CHAPTERS)}] CACHED: {ch['title']}")
                    continue
                except Exception:
                    print(f"[{idx+1}/{len(PEDAGOGY_CHAPTERS)}] Corrupt cache, re-running: {out_file}")

            t0 = time.time()
            raw_text = _chapter_text(reader, ch)
            chapter_title = ch["title"].split(" - ")[-1]
            source_text, used_gate = _source_text(ch["id"], raw_text, chapter_title, PEDAGOGY_BOOK_TITLE)

            source_meta = {
                "name": PEDAGOGY_SOURCE_NAME,
                "size": len(raw_text),
                "type": "application/pdf",
                "pageCount": ch["end_page"] - ch["start_page"] + 1,
                "class": "Child Development"
            }

            req_payload = {
                "rawText": source_text,
                "title": ch["title"],
                "sourceMeta": source_meta
            }

            proc.stdin.write(json.dumps(req_payload) + "\n")
            proc.stdin.flush()

            resp_line = proc.stdout.readline()
            if not resp_line.strip():
                raise RuntimeError("engine worker stopped: " + (proc.stderr.read() or "").strip())
            resp = json.loads(resp_line)

            if resp.get("status") != "ok":
                print(f"Error processing {ch['title']}: {resp.get('message')}")
                failures.append(ch["id"])
                continue

            duration_ms = int((time.time() - t0) * 1000)

            module = {
                "id": ch["id"],
                "title": ch["title"],
                "createdAt": "2026-10-24T12:00:00.000Z",
                "durationMs": duration_ms,
                "sectionsCount": resp["sectionsCount"],
                "inventory": resp["inventory"],
                "questions": resp["questions"]
            }

            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(module, f, indent=2, ensure_ascii=False)

            generated_modules.append(module)
            gate.record_result(ch["id"], len(module["questions"]), len(module["inventory"]))
            print(
                f"[{idx+1}/{len(PEDAGOGY_CHAPTERS)}] {ch['title']} -> "
                f"{len(module['questions'])} verified MCQs, {len(module['inventory'])} KUs "
                f"({duration_ms}ms) | {_gate_note(ch['id'], used_gate)}"
            )
    finally:
        proc.stdin.close()
        proc.terminate()
        try:
            os.remove(worker_path)
        except Exception:
            pass

    # Publishing globs every module on disk, so a failed chapter would silently
    # ship its previous body. Stop before that happens.
    if failures:
        raise RuntimeError(
            "not publishing: %d chapter(s) failed: %s"
            % (len(failures), ", ".join(failures))
        )

    # Publish through the shared payload builder: it writes the lightweight index
    # plus one body file per set, and removes the legacy single-file bundle.
    print("\nPublishing the bundled PWA payload...")
    import build_ctet_payload
    build_ctet_payload.main()
    return 0


if __name__ == "__main__":
    sys.exit(main())
