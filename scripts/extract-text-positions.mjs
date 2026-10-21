import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function extractTextWithPositions() {
  const pdfBytes = new Uint8Array(fs.readFileSync('public/certifica/base_cert.pdf'));
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const pdfDoc = await loadingTask.promise;
  
  console.log('Total pages:', pdfDoc.numPages);
  
  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1.0 });
    console.log(`\n=== PAGE ${pageNum} (${viewport.width} x ${viewport.height}) ===`);
    
    const textContent = await page.getTextContent();
    
    textContent.items.forEach((item, i) => {
      if (item.str.trim()) {
        const x = item.transform[4];
        const y = item.transform[5];
        const fontSize = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1]);
        console.log(`  [${i}] "${item.str}" at (${x.toFixed(1)}, ${y.toFixed(1)}) size:${fontSize.toFixed(1)} font:${item.fontName}`);
      }
    });
  }
}

extractTextWithPositions().catch(console.error);