import json
import pathlib
import shutil
import sys
import tempfile

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))


@pytest.fixture
def workdir():
    """A throwaway directory under the system temp root.

    Not pytest's `tmp_path`: its shared base directory can be left
    unreadable by another account on the machine, which fails the whole
    file instead of the test that needs a directory.
    """
    path = pathlib.Path(tempfile.mkdtemp(prefix="ssgate-"))
    try:
        yield path
    finally:
        shutil.rmtree(path, ignore_errors=True)


def test_source_tables_cover_58_sets():
    import ctet_sources

    ncert = ctet_sources.NCERT_CHAPTERS
    ped = ctet_sources.PEDAGOGY_CHAPTERS
    assert len(ncert) == 49
    assert len(ped) == 9
    ids = [c["id"] for c in ncert] + [c["id"] for c in ped]
    assert len(ids) == len(set(ids)) == 58
    assert ctet_sources.chapter_entry("ctet_c6_ch01")["title"].endswith("Locating Places on the Earth")
    assert ctet_sources.chapter_entry("ctet_ped_ch09")["end_page"] == 190
    assert all(c["kind"] == "ncert" for c in ctet_sources.all_chapters()[:49])


def test_pedagogy_entries_have_page_ranges():
    import ctet_sources

    for chapter in ctet_sources.PEDAGOGY_CHAPTERS:
        assert 0 < chapter["start_page"] < chapter["end_page"]


@pytest.mark.parametrize("subject", [
    "we say", "= 500 m", "years", "high", "There", "This", "months",
    "Instead, a symbol",
    "In Bengal, the Anushilan Samiti was set up in 1902, with centres in numerous towns and villages to",
    "Popular hill stations, such as Nainital (Uttarakhand), Darjeeling (West Bengal), Shimla (Himachal Pradesh), and Mussoorie (Uttarakhand)",
])
def test_usable_subject_rejects_known_junk(subject):
    import ctet_subject_quality as quality

    assert quality.usable_subject(subject) is False


@pytest.mark.parametrize("subject", [
    "Tropic of Cancer", "the scale", "Anushilan Samiti", "Himalayan Range", "Rowlatt Act",
])
def test_usable_subject_accepts_good_topics(subject):
    import ctet_subject_quality as quality

    assert quality.usable_subject(subject) is True


def test_module_quality_counts_only_typed_questions():
    import ctet_subject_quality as quality

    def fact(fid, subject):
        return {"fact_id": fid, "subject": subject}

    module = {
        "inventory": [
            {"revision_facts": [fact("f1", "Tropic of Cancer")]},
            {"revision_facts": [fact("f2", "we say")]},
            {"revision_facts": [{"fact_id": "f3", "object": "no subject"}]},
        ],
        "questions": [
            {"evidence": {"fact_ids": ["f1"]}},
            {"evidence": {"fact_ids": ["f2"]}},
            {"evidence": {"fact_ids": ["f3"]}},
            {"evidence": {"fact_ids": []}},
        ],
    }
    assert quality.module_quality(module) == {
        "usable": 1, "questions": 2, "inventory": 3, "usable_rate": 0.5,
    }



BODY = ("Maps help us locate places on the earth. "
        "The scale tells us the ratio of map to ground. "
        "India lies entirely in the northern hemisphere.")


def test_keep_round_trip(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [3, 1, 2, 3],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    assert gate.load_keep("ctet_x") == [1, 2, 3]
    assert (workdir / "ctet_x.keep.txt").read_text().split() == ["1", "2", "3"]


def test_gated_source_returns_none_without_keep(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") is None


def test_gated_source_keeps_verbatim_sentences_in_order(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [3, 1],
                    {"source": "a.pdf", "title": "T",
                     "sentences": gate.prepare_text(BODY, "Chapter", "Book")})
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") == (
        "Maps help us locate places on the earth.\n"
        "India lies entirely in the northern hemisphere."
    )


def test_gated_source_allows_a_single_sentence(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [2],
                    {"source": "a.pdf", "title": "T",
                     "sentences": gate.prepare_text(BODY, "Chapter", "Book")})
    assert gate.gated_source("ctet_x", BODY, "Chapter", "Book") == (
        "The scale tells us the ratio of map to ground."
    )


def test_gated_source_rejects_out_of_range(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [4],
                    {"source": "a.pdf", "title": "T",
                     "sentences": gate.prepare_text(BODY, "Chapter", "Book")})
    with pytest.raises(ValueError, match=r"ctet_x: keep index 4 out of range \(1\.\.3\)"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")


def test_gated_source_rejects_changed_source_text(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [1],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c"]})
    with pytest.raises(ValueError, match="ctet_x: source text changed"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")


def test_gated_source_rejects_keep_without_audit_record(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    (workdir / "ctet_x.keep.txt").write_text("1\n")
    with pytest.raises(ValueError, match="ctet_x: keep file has no audit record"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")


def test_gated_source_rejects_empty_keep(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    (workdir / "ctet_x.keep.txt").write_text("\n")
    with pytest.raises(ValueError, match="ctet_x: keep file is empty"):
        gate.gated_source("ctet_x", BODY, "Chapter", "Book")


def test_record_result_updates_manifest(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [1],
                    {"source": "a.pdf", "title": "T", "sentences": ["a"]})
    gate.record_result("ctet_x", questions=7, inventory=42)
    data = json.loads((workdir / "manifest.json").read_text(encoding="utf-8"))
    assert data["ctet_x"]["questions"] == 7 and data["ctet_x"]["inventory"] == 42


def test_bullet_block_splits_per_bullet():
    import ctet_source_gate as gate

    text = ("Growth and Development\n"
            "- Piaget gave four stages of cognitive growth.\n"
            "- Vygotsky stressed language and social interaction.\n"
            "- Kohlberg studied stages of moral reasoning.")
    assert gate.split_sentences(gate.reflow(text, "Other Title", "")) == [
        "Piaget gave four stages of cognitive growth.",
        "Vygotsky stressed language and social interaction.",
        "Kohlberg studied stages of moral reasoning.",
    ]


def test_prepare_all_writes_numbered_candidates(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "OUTPUT_DIR", str(workdir))
    monkeypatch.setattr(gate, "chapter_source", lambda chapter_id: (BODY, "Chapter", "Book"))
    rows = gate.prepare_all(["ctet_x"])
    assert rows[0]["offered"] == 3
    assert (workdir / "ctet_x.candidates.txt").read_text().splitlines()[1] == (
        "2. The scale tells us the ratio of map to ground."
    )


def test_keep_stats_reports_kept_and_offered(workdir, monkeypatch):
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [1, 3],
                    {"source": "a.pdf", "title": "T", "sentences": ["a", "b", "c", "d"]})
    assert gate.keep_stats("ctet_x") == (2, 4)
    assert gate.keep_stats("ctet_y") is None


def test_should_process_respects_cache_force_and_only(workdir):
    import convert_ncert_ctet as conv

    cached = workdir / "ctet_a.json"
    cached.write_text("{}", encoding="utf-8")
    assert conv._should_process(str(cached), force=False, only=set(), chapter_id="ctet_a") is False
    assert conv._should_process(str(cached), force=True, only=set(), chapter_id="ctet_a") is True
    assert conv._should_process(str(cached), force=False, only={"ctet_b"}, chapter_id="ctet_a") is False
    fresh = workdir / "ctet_c.json"
    assert conv._should_process(str(fresh), force=False, only={"ctet_c"}, chapter_id="ctet_c") is True


def test_source_text_prefers_gated_when_keep_exists(workdir, monkeypatch):
    import convert_ncert_ctet as conv
    import ctet_source_gate as gate

    monkeypatch.setattr(gate, "KEEP_DIR", str(workdir))
    gate.write_keep("ctet_x", [2],
                    {"source": "a.pdf", "title": "T", "sentences": gate.prepare_text(BODY, "Chapter", "Book")})
    text, used = conv._source_text("ctet_x", BODY, "Chapter", "Book")
    assert used is True
    assert text == "The scale tells us the ratio of map to ground."
    text, used = conv._source_text("ctet_y", BODY, "Chapter", "Book")
    assert used is False
    assert text == BODY


def test_every_gated_set_has_a_well_formed_keep_file():
    import ctet_sources

    for chapter in ctet_sources.all_chapters():
        path = ROOT / "data" / "ctet_gate" / (chapter["id"] + ".keep.txt")
        numbers = [int(line) for line in path.read_text(encoding="utf-8").split()]
        assert numbers, chapter["id"]
        assert numbers == sorted(set(numbers)), chapter["id"]
        assert numbers[0] >= 1


def test_manifest_covers_every_keep_file():
    import ctet_sources

    manifest = json.loads((ROOT / "data" / "ctet_gate" / "manifest.json").read_text(encoding="utf-8"))
    assert set(manifest) == {c["id"] for c in ctet_sources.all_chapters()}
    for entry in manifest.values():
        assert entry["kept"] and entry["offered"] >= entry["kept"]
        assert entry["fingerprint"].startswith("sha256:")


def test_compare_pairs_before_and_after_modules(workdir):
    import ctet_gate_report as report

    before = workdir / "before"
    after = workdir / "after"
    before.mkdir()
    after.mkdir()
    module = {
        "inventory": [{"revision_facts": [{"fact_id": "f1", "subject": "we say"}]}],
        "questions": [{"evidence": {"fact_ids": ["f1"]}}],
    }
    (before / "ctet_x.json").write_text(json.dumps(module), encoding="utf-8")
    module["inventory"][0]["revision_facts"][0]["subject"] = "Tropic of Cancer"
    (after / "ctet_x.json").write_text(json.dumps(module), encoding="utf-8")
    rows = report.compare(str(before), str(after), ["ctet_x"])
    assert rows[0]["before"]["usable"] == 0
    assert rows[0]["after"]["usable"] == 1


def test_compare_lists_a_missing_side_without_failing(workdir):
    import ctet_gate_report as report

    before = workdir / "before"
    before.mkdir()
    rows = report.compare(str(before), str(workdir / "after"), ["ctet_x"])
    assert rows[0]["before"] is None and rows[0]["after"] is None
