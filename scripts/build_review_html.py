"""Build a self-contained HTML review page for the extracted questions."""
import json, os, html
from collections import Counter

ROOT = r'C:\Users\Admin\Desktop\NET Ed'
SRC = os.path.join(ROOT, 'output', 'ctet_english_questions_all.json')
OUT = os.path.join(ROOT, 'output', 'review.html')

records = json.load(open(SRC, encoding='utf-8'))
books = sorted({r.get('source_book', '?') for r in records})
counts = Counter(r.get('source_book', '?') for r in records)
quality = Counter(r['quality'] for r in records)

slim = []
for r in records:
    slim.append({
        'b': r.get('source_book', ''),
        's': r.get('section', ''),
        'p': r.get('page') or '',
        'n': r.get('qno', ''),
        'q': r.get('question', ''),
        'o': r.get('options') or ['', '', '', ''],
        'a': r.get('answer') or 0,
        't': r['quality'],
    })

data = json.dumps(slim, ensure_ascii=False, separators=(',', ':'))

book_options = '\n'.join(
    f'<option value="{html.escape(b)}">{html.escape(b)} ({counts[b]})</option>' for b in books)

page = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>CTET English questions - review</title>
<style>
:root {{ --ink:#1b2430; --muted:#68727e; --line:#e3e7ec; --bg:#f6f7f9; --accent:#1d6f42; }}
* {{ box-sizing:border-box; }}
body {{ margin:0; font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; color:var(--ink); background:var(--bg); }}
header {{ position:sticky; top:0; z-index:5; background:#fff; border-bottom:1px solid var(--line); padding:14px 18px; }}
h1 {{ font-size:17px; margin:0 0 2px; }}
.sub {{ color:var(--muted); font-size:13px; }}
.controls {{ display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; }}
input[type=search], select {{ padding:7px 10px; border:1px solid var(--line); border-radius:8px; font:inherit; background:#fff; }}
input[type=search] {{ flex:1 1 260px; }}
main {{ max-width:900px; margin:0 auto; padding:16px 14px 60px; }}
.card {{ background:#fff; border:1px solid var(--line); border-radius:12px; padding:14px 16px; margin-bottom:12px; }}
.meta {{ color:var(--muted); font-size:12px; margin-bottom:6px; display:flex; gap:8px; flex-wrap:wrap; }}
.tag {{ background:#eef2f5; border-radius:999px; padding:1px 8px; }}
.tag.complete {{ background:#e7f4ec; color:#1d6f42; }}
.tag.questions_only {{ background:#fdf3e3; color:#8a5a00; }}
.tag.partial {{ background:#fdeaea; color:#a02222; }}
.q {{ font-weight:600; margin:6px 0 8px; }}
ol {{ margin:0; padding-left:22px; }}
li {{ margin:3px 0; }}
li.ans {{ font-weight:700; color:var(--accent); }}
footer {{ position:fixed; bottom:0; left:0; right:0; background:#fff; border-top:1px solid var(--line); padding:10px; text-align:center; }}
button {{ padding:8px 16px; border-radius:8px; border:1px solid var(--line); background:#fff; font:inherit; cursor:pointer; }}
button:hover {{ background:#f0f2f4; }}
</style>
</head>
<body>
<header>
  <h1>CTET English questions &mdash; review</h1>
  <div class="sub">{len(records)} questions &middot; {quality["complete"]} with answer key &middot; {quality["questions_only"]} without key &middot; {quality["partial"]} need a look</div>
  <div class="controls">
    <input type="search" id="q" placeholder="Search question or option text...">
    <select id="book"><option value="">All sources</option>
{book_options}
    </select>
    <select id="tier">
      <option value="">All qualities</option>
      <option value="complete">With answer key</option>
      <option value="questions_only">No answer key</option>
      <option value="partial">Needs a look</option>
    </select>
  </div>
</header>
<main id="list"></main>
<footer><button id="more">Show more</button></footer>
<script>
const DATA = {data};
const PAGE = 300;
let filtered = DATA, shown = 0;
const list = document.getElementById('list');
const more = document.getElementById('more');

function esc(s) {{ return (s||'').replace(/[&<>]/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;'}}[c])); }}

function card(r) {{
  const opts = r.o.map((o, i) => {{
    const cls = (r.a === i + 1) ? ' class="ans"' : '';
    return `<li${{cls}}>${{esc(o)}}</li>`;
  }}).join('');
  const ans = r.a ? ` &middot; key: ${{r.a}}` : '';
  return `<article class="card">
    <div class="meta"><span class="tag">${{esc(r.b)}}</span>
    <span class="tag ${{r.t}}">${{r.t.replace('_',' ')}}</span>
    <span>${{esc(r.s)}}</span><span>Q${{r.n}}</span>${{ans}}</div>
    <div class="q">${{esc(r.q)}}</div>
    <ol type="1">${{opts}}</ol>
  </article>`;
}}

function render() {{
  const chunk = filtered.slice(shown, shown + PAGE);
  list.insertAdjacentHTML('beforeend', chunk.map(card).join(''));
  shown += chunk.length;
  more.style.display = shown < filtered.length ? 'inline-block' : 'none';
  more.textContent = `Show more (${{filtered.length - shown}} left)`;
}}

function reset() {{
  const term = document.getElementById('q').value.toLowerCase().trim();
  const book = document.getElementById('book').value;
  const tier = document.getElementById('tier').value;
  filtered = DATA.filter(r => {{
    if (book && r.b !== book) return false;
    if (tier && r.t !== tier) return false;
    if (!term) return true;
    return (r.q + ' ' + r.o.join(' ')).toLowerCase().includes(term);
  }});
  list.innerHTML = '';
  shown = 0;
  render();
}}

document.getElementById('q').addEventListener('input', reset);
document.getElementById('book').addEventListener('change', reset);
document.getElementById('tier').addEventListener('change', reset);
more.addEventListener('click', render);
reset();
</script>
</body>
</html>
'''

open(OUT, 'w', encoding='utf-8').write(page)
print('written', OUT, round(os.path.getsize(OUT) / 1e6, 2), 'MB')
