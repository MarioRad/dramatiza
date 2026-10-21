import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function renderPageToImage() {
  const pdfBytes = new Uint8Array(fs.readFileSync('/tmp/opencode/cert_prueba.pdf'));
  const pdfDoc = await pdfjsLib.getDocument({ data: pdfBytes }).promise;
  const page = await pdfDoc.getPage(1);
  
  const viewport = page.getViewport({ scale: 2.0 });
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const context = canvas.getContext('2d');
  
  await page.render({ canvasContext: context, viewport }).promise;
  
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync('certificado_page1.png', buffer);
  console.log('Page 1 rendered to certificado_page1.png');
}

renderPageToImage().catch(console.error);