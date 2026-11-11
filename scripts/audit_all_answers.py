import glob
import json

missing_answers = 0
invalid_keys = 0
total_questions = 0

for path in glob.glob('pwa/ctet/*.json'):
    with open(path, 'r', encoding='utf-8') as f:
        d = json.load(f)
    for q in d.get('questions', []):
        total_questions += 1
        ak = q.get('answer_key')
        ea = q.get('expected_answer')
        if not ak or ak not in ['A', 'B', 'C', 'D']:
            invalid_keys += 1
        if not ea or not str(ea).strip():
            missing_answers += 1

print(f"Total files checked: {len(glob.glob('pwa/ctet/*.json'))}")
print(f"Total questions: {total_questions}")
print(f"Invalid answer keys: {invalid_keys}")
print(f"Missing expected answers: {missing_answers}")
assert invalid_keys == 0, "Found invalid answer keys!"
assert missing_answers == 0, "Found missing expected answers!"
print("100% VERIFICATION PASSED: Every question has a valid answer key and non-empty expected answer!")

