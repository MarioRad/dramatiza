const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

async function generarCertificadoFinal() {
  const basePath = path.join(__dirname, '../public/certifica/base_cert.pdf');
  const outputPath = path.join(__dirname, '../public/certifica/certificado_final.pdf');

  const existingPdfBytes = fs.readFileSync(basePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];
  const { width, height } = page1.getSize();

  const datos = {
    apellido: 'GARCÍA',
    nombre: 'María Elena',
    dni: '27.345.678',
    rol: 'PARTICIPANTE',
    codigo: 'CERT-2026-0042',
    totalHoras: 40,
  };

  // Generar QR code
  const verifyUrl = `https://dramatiza.vercel.app/verificar.html?c=${datos.codigo}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { width: 100, margin: 1 });
  const qrImage = await pdfDoc.embedPng(qrDataUrl);

  const bgColor = rgb(1, 1, 1);
  
  const coverAndWrite = (page, x, y, w, h, text, opts = {}) => {
    page.drawRectangle({ x: x - 10, y: y - 8, width: w + 20, height: h + 16, color: bgColor });
    page.drawText(text, { x, y, ...opts });
  };

  // ==================== PÁGINA 1 ====================
  coverAndWrite(page1, 336.3, 440.1, 200, 18, `${datos.apellido}, ${datos.nombre}`, {
    size: 15.1, font: fontBold, color: rgb(0, 0, 0)
  });
  coverAndWrite(page1, 521.4, 440.1, 120, 18, datos.dni, {
    size: 15.1, font: font, color: rgb(0, 0, 0)
  });
  coverAndWrite(page1, 458.6, 400.9, 150, 18, datos.rol, {
    size: 15.1, font: font, color: rgb(0, 0, 0)
  });
  coverAndWrite(page1, 538.7, 338.6, 50, 18, String(datos.totalHoras), {
    size: 15.1, font: fontBold, color: rgb(0.1, 0.1, 0.4)
  });

  // QR Code en página 1 (esquina inferior derecha)
  const qrSize = 60;
  page1.drawImage(qrImage, {
    x: width - qrSize - 30,
    y: 30,
    width: qrSize,
    height: qrSize,
  });
  page1.drawText('Verificar en:', {
    x: width - qrSize - 30,
    y: 30 + qrSize + 5,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });
  page1.drawText(verifyUrl, {
    x: 50,
    y: 15,
    size: 7,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // ==================== PÁGINA 2 ====================
  coverAndWrite(page2, 180, 114.3, 300, 16, `${datos.apellido}, ${datos.nombre}`, {
    size: 12, font: fontBold, color: rgb(0, 0, 0)
  });
  coverAndWrite(page2, 180, 99.2, 250, 16, datos.codigo, {
    size: 12, font: font, color: rgb(0.3, 0.3, 0.3)
  });

  // QR Code en página 2 también
  page2.drawImage(qrImage, {
    x: width - qrSize - 30,
    y: 30,
    width: qrSize,
    height: qrSize,
  });

  // Guardar
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Certificado final generado en: ${outputPath}`);
  console.log(`QR URL: ${verifyUrl}`);
}

generarCertificadoFinal().catch(console.error);