import os, json

# Let's check scripts/inventory_paths.py or check git diff / old commits if git exists or search scripts
for root, dirs, files in os.walk('scripts'):
    for f in files:
        if 'classify' in f or 'module' in f or 'ctet' in f:
            p = os.path.join(root, f)
            with open(p, 'r', encoding='utf-8', errors='ignore') as fp:
                t = fp.read()
                if 'CTET' in t and ('Syllabus' in t or 'topics' in t or 'topic' in t):
                    print(f"Match in {p}")

