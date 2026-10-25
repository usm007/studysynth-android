const fs = require('fs');
const path = require('path');

if (!Uint8Array.prototype.toHex) {
  Uint8Array.prototype.toHex = function () {
    return Buffer.from(this).toString('hex');
  };
}
if (!Math.sumPrecise) {
  Math.sumPrecise = function (arr) {
    let sum = 0;
    for (const n of arr) sum += Number(n) || 0;
    return sum;
  };
}

async function testScan() {
  const pdfjs = await import('../vendor/pdfjs/pdf.mjs');
  const dir = 'C:/Users/Admin/Desktop/NCERT/8.2';
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.pdf'));

  console.log('Found files:', files);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const buffer = new Uint8Array(fs.readFileSync(fullPath));
    const doc = await pdfjs.getDocument({
      data: buffer,
      isEvalSupported: false,
      useSystemFonts: true,
      disableFontFace: true
    }).promise;

    // Read first page to get title
    const p1 = await doc.getPage(1);
    const c1 = await p1.getTextContent();
    const t1 = c1.items.map(i => i.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 150);
    p1.cleanup();

    console.log(`${file}: ${doc.numPages} pages | Preview: ${t1}`);
  }
}

testScan().catch(console.error);
