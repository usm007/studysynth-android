"""Single source of truth for the bundled chapter sources.

Both chapter converters and the AI source gate read their tables from here,
so a chapter id means the same file, title and page range everywhere.
"""

import os

from pypdf import PdfReader

NCERT_BASE = r"C:\Users\Admin\Desktop\NCERT"
NCERT_BOOK_TITLE = "Exploring Society: India and Beyond"

NCERT_CHAPTERS = [
    # Class 6
    {"id": "ctet_c6_ch01", "class": 6, "pdf": r"6\fees101.pdf", "title": "Social Science - Class 6 - Locating Places on the Earth"},
    {"id": "ctet_c6_ch02", "class": 6, "pdf": r"6\fees102.pdf", "title": "Social Science - Class 6 - Oceans and Continents"},
    {"id": "ctet_c6_ch03", "class": 6, "pdf": r"6\fees103.pdf", "title": "Social Science - Class 6 - Landforms and Life"},
    {"id": "ctet_c6_ch04", "class": 6, "pdf": r"6\fees104.pdf", "title": "Social Science - Class 6 - Timeline and Sources of History"},
    {"id": "ctet_c6_ch05", "class": 6, "pdf": r"6\fees105.pdf", "title": "Social Science - Class 6 - India, That Is Bharat"},
    {"id": "ctet_c6_ch06", "class": 6, "pdf": r"6\fees106.pdf", "title": "Social Science - Class 6 - The Beginnings of Indian Civilisation"},
    {"id": "ctet_c6_ch07", "class": 6, "pdf": r"6\fees107.pdf", "title": "Social Science - Class 6 - India's Cultural Roots"},
    {"id": "ctet_c6_ch08", "class": 6, "pdf": r"6\fees108.pdf", "title": "Social Science - Class 6 - Unity in Diversity, or 'Many in the One'"},
    {"id": "ctet_c6_ch09", "class": 6, "pdf": r"6\fees109.pdf", "title": "Social Science - Class 6 - Family and Community"},
    {"id": "ctet_c6_ch10", "class": 6, "pdf": r"6\fees110.pdf", "title": "Social Science - Class 6 - Grassroots Democracy — Part 1: Governance"},
    {"id": "ctet_c6_ch11", "class": 6, "pdf": r"6\fees111.pdf", "title": "Social Science - Class 6 - Grassroots Democracy — Part 2: Local Government in Rural Areas"},
    {"id": "ctet_c6_ch12", "class": 6, "pdf": r"6\fees112.pdf", "title": "Social Science - Class 6 - Grassroots Democracy — Part 3: Local Government in Urban Areas"},
    {"id": "ctet_c6_ch13", "class": 6, "pdf": r"6\fees113.pdf", "title": "Social Science - Class 6 - The Value of Work"},
    {"id": "ctet_c6_ch14", "class": 6, "pdf": r"6\fees114.pdf", "title": "Social Science - Class 6 - Economic Activities Around Us"},

    # Class 7 Part 1
    {"id": "ctet_c7_ch01", "class": 7, "pdf": r"7.1\gees101.pdf", "title": "Social Science - Class 7 - Geographical Diversity of India"},
    {"id": "ctet_c7_ch02", "class": 7, "pdf": r"7.1\gees102.pdf", "title": "Social Science - Class 7 - Understanding the Weather"},
    {"id": "ctet_c7_ch03", "class": 7, "pdf": r"7.1\gees103.pdf", "title": "Social Science - Class 7 - Climates of India"},
    {"id": "ctet_c7_ch04", "class": 7, "pdf": r"7.1\gees104.pdf", "title": "Social Science - Class 7 - New Beginnings: Cities and States"},
    {"id": "ctet_c7_ch05", "class": 7, "pdf": r"7.1\gees105.pdf", "title": "Social Science - Class 7 - The Rise of Empires"},
    {"id": "ctet_c7_ch06", "class": 7, "pdf": r"7.1\gees106.pdf", "title": "Social Science - Class 7 - The Age of Reorganisation"},
    {"id": "ctet_c7_ch07", "class": 7, "pdf": r"7.1\gees107.pdf", "title": "Social Science - Class 7 - The Gupta Era: An Age of Tireless Creativity"},
    {"id": "ctet_c7_ch08", "class": 7, "pdf": r"7.1\gees108.pdf", "title": "Social Science - Class 7 - How the Land Becomes Sacred"},
    {"id": "ctet_c7_ch09", "class": 7, "pdf": r"7.1\gees109.pdf", "title": "Social Science - Class 7 - From the Rulers to the Ruled: Types of Government"},
    {"id": "ctet_c7_ch10", "class": 7, "pdf": r"7.1\gees110.pdf", "title": "Social Science - Class 7 - The Constitution of India — An Introduction"},
    {"id": "ctet_c7_ch11", "class": 7, "pdf": r"7.1\gees111.pdf", "title": "Social Science - Class 7 - From Barter to Money"},
    {"id": "ctet_c7_ch12", "class": 7, "pdf": r"7.1\gees112.pdf", "title": "Social Science - Class 7 - Understanding Markets"},

    # Class 7 Part 2
    {"id": "ctet_c7_ch13", "class": 7, "pdf": r"7.2\gees201.pdf", "title": "Social Science - Class 7 - The Story of Indian Farming"},
    {"id": "ctet_c7_ch14", "class": 7, "pdf": r"7.2\gees202.pdf", "title": "Social Science - Class 7 - India and Her Neighbours"},
    {"id": "ctet_c7_ch15", "class": 7, "pdf": r"7.2\gees203.pdf", "title": "Social Science - Class 7 - Empires and Kingdoms: 6th to 10th Centuries"},
    {"id": "ctet_c7_ch16", "class": 7, "pdf": r"7.2\gees204.pdf", "title": "Social Science - Class 7 - Turning Tides: 11th and 12th Centuries"},
    {"id": "ctet_c7_ch17", "class": 7, "pdf": r"7.2\gees205.pdf", "title": "Social Science - Class 7 - India, a Home to Many"},
    {"id": "ctet_c7_ch18", "class": 7, "pdf": r"7.2\gees206.pdf", "title": "Social Science - Class 7 - The State, the Government, and You"},
    {"id": "ctet_c7_ch19", "class": 7, "pdf": r"7.2\gees207.pdf", "title": "Social Science - Class 7 - Infrastructure: Engine of India's Development"},
    {"id": "ctet_c7_ch20", "class": 7, "pdf": r"7.2\gees208.pdf", "title": "Social Science - Class 7 - Banks and the Magic of Finance"},

    # Class 8 Part 1
    {"id": "ctet_c8_ch01", "class": 8, "pdf": r"8.1\hees101.pdf", "title": "Social Science - Class 8 - Natural Resources and Their Use"},
    {"id": "ctet_c8_ch02", "class": 8, "pdf": r"8.1\hees102.pdf", "title": "Social Science - Class 8 - Reshaping India's Political Map"},
    {"id": "ctet_c8_ch03", "class": 8, "pdf": r"8.1\hees103.pdf", "title": "Social Science - Class 8 - The Rise of the Marathas"},
    {"id": "ctet_c8_ch04", "class": 8, "pdf": r"8.1\hees104.pdf", "title": "Social Science - Class 8 - The Colonial Era in India"},
    {"id": "ctet_c8_ch05", "class": 8, "pdf": r"8.1\hees105.pdf", "title": "Social Science - Class 8 - Universal Franchise and India's Electoral System"},
    {"id": "ctet_c8_ch06", "class": 8, "pdf": r"8.1\hees106.pdf", "title": "Social Science - Class 8 - The Parliamentary System: Legislature and Executive"},
    {"id": "ctet_c8_ch07", "class": 8, "pdf": r"8.1\hees107.pdf", "title": "Social Science - Class 8 - Factors of Production"},

    # Class 8 Part 2
    {"id": "ctet_c8_ch08", "class": 8, "pdf": r"8.2\hees201.pdf", "title": "Social Science - Class 8 - World Geography: Some Glimpses"},
    {"id": "ctet_c8_ch09", "class": 8, "pdf": r"8.2\hees202.pdf", "title": "Social Science - Class 8 - India's Long Road to Independence"},
    {"id": "ctet_c8_ch10", "class": 8, "pdf": r"8.2\hees203.pdf", "title": "Social Science - Class 8 - A Journey through Indian Architecture"},
    {"id": "ctet_c8_ch11", "class": 8, "pdf": r"8.2\hees204.pdf", "title": "Social Science - Class 8 - The Role of the Judiciary in Our Society"},
    {"id": "ctet_c8_ch12", "class": 8, "pdf": r"8.2\hees205.pdf", "title": "Social Science - Class 8 - Citizenship: Rights and Duties"},
    {"id": "ctet_c8_ch13", "class": 8, "pdf": r"8.2\hees206.pdf", "title": "Social Science - Class 8 - Dynamics of Population"},
    {"id": "ctet_c8_ch14", "class": 8, "pdf": r"8.2\hees207.pdf", "title": "Social Science - Class 8 - India's Urban Landscape"},
    {"id": "ctet_c8_ch15", "class": 8, "pdf": r"8.2\hees209.pdf", "title": "Social Science - Class 8 - Cultural Currents: 13th to 17th Centuries"}
]

PEDAGOGY_BOOK = r"C:\Users\Admin\Desktop\NCERT\CTET_&_STETs__Child_Development Himanshi singh.pdf"
PEDAGOGY_BOOK_TITLE = ""
PEDAGOGY_CHAPTERS = [
    {
        "id": "ctet_ped_ch01",
        "title": "Pedagogy - Child Development - Growth and Development",
        "start_page": 17,
        "end_page": 37
    },
    {
        "id": "ctet_ped_ch02",
        "title": "Pedagogy - Child Development - Socialisation Process",
        "start_page": 38,
        "end_page": 47
    },
    {
        "id": "ctet_ped_ch03",
        "title": "Pedagogy - Child Development - Cognitive & Moral Development",
        "start_page": 48,
        "end_page": 75
    },
    {
        "id": "ctet_ped_ch04",
        "title": "Pedagogy - Child Development - Child Centered & Progressive Education",
        "start_page": 76,
        "end_page": 84
    },
    {
        "id": "ctet_ped_ch05",
        "title": "Pedagogy - Child Development - Concept of Intelligence",
        "start_page": 85,
        "end_page": 105
    },
    {
        "id": "ctet_ped_ch06",
        "title": "Pedagogy - Child Development - Language and Thought",
        "start_page": 106,
        "end_page": 109
    },
    {
        "id": "ctet_ped_ch07",
        "title": "Pedagogy - Child Development - Gender as a Social Construct",
        "start_page": 110,
        "end_page": 114
    },
    {
        "id": "ctet_ped_ch08",
        "title": "Pedagogy - Child Development - Learning Theories",
        "start_page": 115,
        "end_page": 153
    },
    {
        "id": "ctet_ped_ch09",
        "title": "Pedagogy - Child Development - Pedagogical Issues & Inclusive Education",
        "start_page": 154,
        "end_page": 190
    }
]


def all_chapters():
    """Every source-derived set: 49 NCERT chapters, then 9 pedagogy chapters."""
    chapters = []
    for chapter in NCERT_CHAPTERS:
        chapters.append(dict(chapter, kind="ncert"))
    for chapter in PEDAGOGY_CHAPTERS:
        chapters.append(dict(chapter, kind="pedagogy"))
    return chapters


def chapter_entry(chapter_id):
    for chapter in all_chapters():
        if chapter["id"] == chapter_id:
            return chapter
    raise KeyError(chapter_id)


def chapter_source(chapter_id):
    """Return (raw_text, chapter_title, book_title) for one chapter."""
    entry = chapter_entry(chapter_id)
    if entry["kind"] == "pedagogy":
        reader = PdfReader(PEDAGOGY_BOOK)
        pages = reader.pages[entry["start_page"] - 1:min(entry["end_page"], len(reader.pages))]
        raw = "\n\n".join(((page.extract_text() or "").replace("\u25a1", " ")) for page in pages)
        return raw, entry["title"].split(" - ")[-1], PEDAGOGY_BOOK_TITLE
    reader = PdfReader(os.path.join(NCERT_BASE, entry["pdf"]))
    raw = "\n\n".join((page.extract_text() or "") for page in reader.pages)
    return raw, entry["title"].split(" - ")[-1], NCERT_BOOK_TITLE
