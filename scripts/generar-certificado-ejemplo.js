const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generarCertificadoEjemplo() {
  const basePath = path.join(__dirname, '../public/certifica/base_cert.pdf');
  const outputPath = path.join(__dirname, '../public/certifica/certificado_ejemplo.pdf');

  const existingPdfBytes = fs.readFileSync(basePath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pages = pdfDoc.getPages();
  const page1 = pages[0];
  const page2 = pages[1];
  const { width, height } = page1.getSize();
  const margin = 50;

  // ==================== DATOS DEL EJEMPLO ====================
  const datos = {
    apellido: 'GARCÍA',
    nombre: 'María Elena',
    dni: '27.345.678',
    rol: 'PARTICIPANTE',
    codigo: 'CERT-2026-0042',
    totalHoras: 40,
    talleres: [
      { nombre: 'Taller de Improvisación Teatral', horas: 8 },
      { nombre: 'Taller de Expresión Corporal', horas: 6 },
      { nombre: 'Taller de Técnica Vocal', horas: 6 },
      { nombre: 'Taller de Puesta en Escena', horas: 8 },
    ],
    ponencias: [
      { nombre: 'Ponencia: El Teatro en la Escuela', horas: 2 },
      { nombre: 'Ponencia: Dramaturgia Contemporánea', horas: 2 },
      { nombre: 'Ponencia: Teatro y Comunidad', horas: 2 },
    ],
    conversatorios: [
      { nombre: 'Conversatorio: Experiencias Pedagógicas', horas: 3 },
      { nombre: 'Conversatorio: Desafíos del Teatro Actual', horas: 3 },
    ],
  };

  // ==================== PÁGINA 1 - Completar placeholders ====================
  // Buscar y reemplazar textos en página 1
  // Como pdf-lib no permite búsqueda/reemplazo directo, dibujamos sobre las posiciones

  // Nombre completo
  page1.drawText(`${datos.apellido}, ${datos.nombre}`, {
    x: margin + 120,
    y: height - margin - 85,
    size: 13,
    font: fontBold,
    color: rgb(0, 0, 0),
  });

  // DNI
  page1.drawText(`DNI N° ${datos.dni}`, {
    x: margin + 120,
    y: height - margin - 110,
    size: 13,
    font,
    color: rgb(0, 0, 0),
  });

  // Rol
  page1.drawText(datos.rol, {
    x: margin + 200,
    y: height - margin - 135,
    size: 13,
    font,
    color: rgb(0, 0, 0),
  });

  // Total horas
  page1.drawText(`${datos.totalHoras} horas reloj`, {
    x: margin + 280,
    y: height - margin - 185,
    size: 13,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Código de verificación
  page1.drawText(`Código: ${datos.codigo}`, {
    x: margin,
    y: margin + 20,
    size: 9,
    font,
    color: rgb(0.4, 0.4, 0.4),
  });

  // ==================== PÁGINA 2 - Completar placeholders ====================
  let y = height - margin - 80;

  // Apellido y Nombre
  page2.drawText(`${datos.apellido}, ${datos.nombre}`, {
    x: margin + 150,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  y -= 25;

  // Código
  page2.drawText(datos.codigo, {
    x: margin + 150,
    y,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 35;

  // Columnas
  const col1 = margin;
  const col2 = margin + 350;
  const col3 = margin + 450;

  const drawRow = (page, actividad, tipo, horas, rowY, isEven) => {
    if (isEven) {
      page.drawRectangle({
        x: margin - 5,
        y: rowY - 3,
        width: width - 2 * margin + 10,
        height: 20,
        color: rgb(0.95, 0.95, 0.98),
      });
    }
    page.drawText(actividad, {
      x: col1,
      y: rowY,
      size: 10,
      font,
      color: rgb(0, 0, 0),
      maxWidth: 340,
    });
    page.drawText(tipo, {
      x: col2,
      y: rowY,
      size: 10,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
    page.drawText(`(${horas} hs)`, {
      x: col3,
      y: rowY,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.4),
    });
    return rowY - 22;
  };

  let rowNum = 0;

  // Talleres
  y -= 22; // espacio después de "TALLERES (Optativos...)"
  datos.talleres.forEach((t) => {
    y = drawRow(page2, t.nombre, 'Taller', t.horas, y, rowNum % 2 === 0);
    rowNum++;
  });
  y -= 10;

  // Ponencias
  y -= 22; // espacio después de "PONENCIAS (Para todos...)"
  datos.ponencias.forEach((p) => {
    y = drawRow(page2, p.nombre, 'Ponencia', p.horas, y, rowNum % 2 === 0);
    rowNum++;
  });
  y -= 10;

  // Conversatorios
  y -= 22; // espacio después de "CONVERSATORIOS (Para todos...)"
  datos.conversatorios.forEach((c) => {
    y = drawRow(page2, c.nombre, 'Conversatorio', c.horas, y, rowNum % 2 === 0);
    rowNum++;
  });
  y -= 15;

  // Total actualizado
  page2.drawText(`${datos.totalHoras} hs`, {
    x: col3,
    y: y + 5,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Guardar
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Certificado ejemplo generado en: ${outputPath}`);
}

generarCertificadoEjemplo().catch(console.error);