import json

with open('output/ctet_english_questions_all.json', 'r', encoding='utf-8') as f:
    all_raw = json.load(f)

for bname in ['CTET CDP (Child Development & Pedagogy)', 'CTET Social Studies (SST)', 'SST CTET YCT', 'CTET 2021 Solved Papers (YCT Expert Team)', 'CTET Practice Book Primary Level (Class I-V)']:
    sample = next((q for q in all_raw if q.get('source_book') == bname), None)
    print(f"\n--- Book: {bname} ---")
    if sample:
        print("Keys:", sample.keys())
        print("Question:", sample.get('question')[:100])
        print("Section:", sample.get('section'))
        print("Explanation:", sample.get('explanation')[:100] if sample.get('explanation') else "None")

