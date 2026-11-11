import glob
import json
import random

ugc_files = glob.glob('pwa/ctet/ugc_net_unit_*.json')
cdp_files = glob.glob('pwa/ctet/ctet_cdp_*.json')
sst_files = glob.glob('pwa/ctet/ctet_sst_*.json')

print(f"UGC files: {len(ugc_files)}")
print(f"CDP files: {len(cdp_files)}")
print(f"SST files: {len(sst_files)}")

# Test UGC NET 100-question sample (10 per unit)
ugc_mock = []
for f in ugc_files:
    with open(f, 'r', encoding='utf-8') as fp:
        d = json.load(fp)
        qs = d.get('questions', [])
        sample = random.sample(qs, min(10, len(qs)))
        ugc_mock.extend(sample)

random.shuffle(ugc_mock)
print(f"UGC NET Mock generated: {len(ugc_mock)} questions")

# Test CTET Paper 2 90-question sample (30 CDP + 60 SST)
ctet_mock = []
for f in cdp_files:
    with open(f, 'r', encoding='utf-8') as fp:
        d = json.load(fp)
        qs = d.get('questions', [])
        sample = random.sample(qs, min(5, len(qs)))
        ctet_mock.extend(sample)

for f in sst_files:
    with open(f, 'r', encoding='utf-8') as fp:
        d = json.load(fp)
        qs = d.get('questions', [])
        count = 20 if 'history' in f else (10 if 'pedagogy' in f else 15)
        sample = random.sample(qs, min(count, len(qs)))
        ctet_mock.extend(sample)

random.shuffle(ctet_mock)
print(f"CTET Mock generated: {len(ctet_mock)} questions")

