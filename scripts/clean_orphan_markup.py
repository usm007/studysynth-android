with open('pwa/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

target = """    </div>
  </div>
      </header>
      <div id="pdfCanvasContainer" class="pdf-canvas-container">
        <div id="pdfLoading" class="pdf-loading">Loading document...</div>
        <canvas id="pdfCanvas"></canvas>
      </div>
    </div>
  </div>"""

replacement = """    </div>
  </div>"""

assert target in c or target.replace('\n', '\r\n') in c, "Target not found!"
if target in c:
    c = c.replace(target, replacement)
else:
    c = c.replace(target.replace('\n', '\r\n'), replacement.replace('\n', '\r\n'))

with open('pwa/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print("Removed orphan pdfCanvasContainer successfully!")

