"""Convert the bundled NCERT Social Science chapters into PWA study modules.

The engine contract is unchanged: analyzeSource(rawText, title, sourceMeta, 25).
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

from ctet_sources import NCERT_BASE as BASE_NCERT, NCERT_BOOK_TITLE, NCERT_CHAPTERS as CHAPTERS
import ctet_source_gate as gate

sys.stdout.reconfigure(encoding='utf-8')

ROOT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT_DIR, "output", "ctet_modules")

os.makedirs(OUT_DIR, exist_ok=True)

# We use a Node worker script for fast in-memory execution of analyze.js
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
    const result = Analysis.analyzeSource(input.rawText, input.title, input.sourceMeta, 25);
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


def extract_clean_text(pdf_path):
    reader = PdfReader(pdf_path)
    pages = []
    for p in reader.pages:
        txt = p.extract_text() or ""
        pages.append(txt)
    return "\n\n".join(pages), len(reader.pages)


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


def main(argv=None):
    parser = argparse.ArgumentParser(description="Convert the bundled NCERT chapters.")
    parser.add_argument("--force", action="store_true", help="re-run even when a cached module exists")
    parser.add_argument("--only", default="", help="comma-separated chapter ids to convert")
    args = parser.parse_args(argv)
    only = {part.strip() for part in args.only.split(",") if part.strip()}

    print(f"Loaded {len(CHAPTERS)} chapters to process.")

    worker_script_path = os.path.join(ROOT_DIR, "node_analyze_worker.js")
    with open(worker_script_path, "w", encoding="utf-8") as f:
        f.write(NODE_WORKER_CODE)

    print("Starting Node worker process...")
    try:
        proc = subprocess.Popen(
            ["node", worker_script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            encoding="utf-8"
        )
    except OSError:
        try:
            os.remove(worker_script_path)
        except Exception:
            pass
        raise

    all_modules = []
    failures = []
    total_questions = 0
    total_facts = 0
    total_inventory = 0

    start_all = time.time()

    try:
        for idx, ch in enumerate(CHAPTERS):
            out_file = os.path.join(OUT_DIR, f"{ch['id']}.json")
            if not _should_process(out_file, args.force, only, ch["id"]):
                if only and ch["id"] not in only:
                    continue
                try:
                    with open(out_file, "r", encoding="utf-8") as f:
                        module = json.load(f)
                    all_modules.append(module)
                    qs_count = len(module.get("questions") or [])
                    inv_count = len(module.get("inventory") or [])
                    total_questions += qs_count
                    total_inventory += inv_count
                    print(f"[{idx+1}/{len(CHAPTERS)}] CACHED: {ch['title'][:50]:<50} | {qs_count:>2} Qs | {inv_count:>3} KUs")
                    continue
                except Exception:
                    print(f"[{idx+1}/{len(CHAPTERS)}] Corrupt cache, re-running: {out_file}")

            pdf_full = os.path.join(BASE_NCERT, ch["pdf"])
            if not os.path.isfile(pdf_full):
                print(f"[{idx+1}/{len(CHAPTERS)}] MISSING FILE: {pdf_full}")
                failures.append(ch["id"])
                continue

            t0 = time.time()
            raw_text, page_count = extract_clean_text(pdf_full)
            fsize = os.path.getsize(pdf_full)
            chapter_title = ch["title"].split(" - ")[-1]
            source_text, used_gate = _source_text(ch["id"], raw_text, chapter_title, NCERT_BOOK_TITLE)

            source_meta = {
                "name": os.path.basename(pdf_full),
                "size": fsize,
                "type": "application/pdf",
                "pageCount": page_count,
                "class": ch["class"]
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
                print(f"[{idx+1}/{len(CHAPTERS)}] ERROR in {ch['title']}: {resp.get('message')}")
                failures.append(ch["id"])
                continue

            duration_ms = int((time.time() - t0) * 1000)
            qs_count = resp["questionsCount"]
            inv_count = resp["inventoryCount"]
            facts_count = resp["factsCount"]

            total_questions += qs_count
            total_facts += facts_count
            total_inventory += inv_count

            # Build the full study module object
            module = {
                "id": ch["id"],
                "title": ch["title"],
                "createdAt": "2026-10-23T12:00:00.000Z",
                "durationMs": duration_ms,
                "sectionsCount": resp["sectionsCount"],
                "inventory": resp["inventory"],
                "validation": resp["validation"],
                "generation": resp["generation"],
                "sourceMeta": source_meta,
                "questions": resp["questions"]
            }

            # Save individual JSON
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(module, f, ensure_ascii=False, indent=2)

            all_modules.append(module)
            gate.record_result(ch["id"], qs_count, inv_count)

            print(
                f"[{idx+1}/{len(CHAPTERS)}] {ch['title'][:55]:<55} | {qs_count:>2} Qs | "
                f"{inv_count:>3} KUs | {facts_count:>3} Facts | {duration_ms:>4}ms | "
                f"{_gate_note(ch['id'], used_gate)}"
            )
    finally:
        proc.stdin.close()
        proc.terminate()
        try:
            os.remove(worker_script_path)
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
    PWA_DATA_FILE = build_ctet_payload.OUT_INDEX

    total_time = time.time() - start_all
    print(f"\n=======================================================")
    print(f"ALL {len(all_modules)} NCERT CHAPTERS CONVERTED SUCCESSFULLY!")
    print(f"Total Questions Generated: {total_questions}")
    print(f"Total Knowledge Units:     {total_inventory}")
    print(f"Total Facts Extracted:     {total_facts}")
    print(f"Total Elapsed Time:        {total_time:.1f}s")
    print(f"Output Modules Saved In:   {OUT_DIR}")
    print(f"PWA Bundled Asset:         {PWA_DATA_FILE}")
    print(f"=======================================================\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
