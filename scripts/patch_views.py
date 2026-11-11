with open('pwa/index.html', 'r', encoding='utf-8') as f:
    c = f.read()

c = c.replace('<div id="quizView" class="view quiz-view">', '<div id="quizView" class="view quiz-view" style="display:none;">')
c = c.replace('<div id="libraryView" class="view library-view" style="display:none;">', '<div id="libraryView" class="view library-view" style="display:block;">')

with open('pwa/index.html', 'w', encoding='utf-8') as f:
    f.write(c)

print('pwa/index.html updated successfully!')

