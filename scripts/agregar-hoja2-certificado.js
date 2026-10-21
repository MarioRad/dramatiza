const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function agregarHoja2() {
  const originalPath = path.join(__dirname, '../public/certifica/base_cert_original.pdf');
  const outputPath = path.join(__dirname, '../public/certifica/base_cert.pdf');

  const existingPdfBytes = fs.readFileSync(originalPath);
  const pdfDoc = await PDFDocument.load(existingPdfBytes);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const margin = 50;

  // ==================== PÁGINA 2 ====================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  // Título página 2
  page2.drawText('DETALLE DE ACTIVIDADES Y CARGA HORARIA', {
    x: margin,
    y,
    size: 18,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 35;

  page2.drawLine({
    start: { x: margin, y },
    end: { x: pageWidth - margin, y },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 25;

  // Datos del participante (placeholders)
  page2.drawText('Apellido y Nombre:', {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page2.drawText('XXXXXX, XXXXXX', {
    x: margin + 150,
    y,
    size: 12,
    font,
    color: rgb(0.3, 0.3, 0.3),
  });
  y -= 25;

  page2.drawText('Código:', {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
  page2.drawText('XXXXXXXX', {
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

  // Encabezado tabla
  page2.drawRectangle({
    x: margin - 5,
    y: y - 3,
    width: pageWidth - 2 * margin + 10,
    height: 22,
    color: rgb(0.1, 0.1, 0.4),
  });

  page2.drawText('ACTIVIDAD', {
    x: col1,
    y: y + 3,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page2.drawText('TIPO', {
    x: col2,
    y: y + 3,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page2.drawText('HORAS', {
    x: col3,
    y: y + 3,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  y -= 30;

  // Datos
  const talleres = [
    { nombre: 'Taller de Improvisación Teatral', horas: 8 },
    { nombre: 'Taller de Expresión Corporal', horas: 6 },
    { nombre: 'Taller de Técnica Vocal', horas: 6 },
    { nombre: 'Taller de Puesta en Escena', horas: 8 },
  ];

  const ponencias = [
    { nombre: 'Ponencia: El Teatro en la Escuela', horas: 2 },
    { nombre: 'Ponencia: Dramaturgia Contemporánea', horas: 2 },
    { nombre: 'Ponencia: Teatro y Comunidad', horas: 2 },
  ];

  const conversatorios = [
    { nombre: 'Conversatorio: Experiencias Pedagógicas', horas: 3 },
    { nombre: 'Conversatorio: Desafíos del Teatro Actual', horas: 3 },
  ];

  const drawRow = (page, actividad, tipo, horas, rowY, isEven) => {
    if (isEven) {
      page.drawRectangle({
        x: margin - 5,
        y: rowY - 3,
        width: pageWidth - 2 * margin + 10,
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
  if (talleres.length > 0) {
    page2.drawText('TALLERES (Optativos - Según inscripción)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.4),
    });
    y -= 22;

    talleres.forEach((t) => {
      y = drawRow(page2, t.nombre, 'Taller', t.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 10;
  }

  // Ponencias
  if (ponencias.length > 0) {
    page2.drawText('PONENCIAS (Para todos los asistentes)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.1),
    });
    y -= 22;

    ponencias.forEach((p) => {
      y = drawRow(page2, p.nombre, 'Ponencia', p.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 10;
  }

  // Conversatorios
  if (conversatorios.length > 0) {
    page2.drawText('CONVERSATORIOS (Para todos los asistentes)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.4, 0.1, 0.1),
    });
    y -= 22;

    conversatorios.forEach((c) => {
      y = drawRow(page2, c.nombre, 'Conversatorio', c.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 15;
  }

  // Total
  const totalHoras = [...talleres, ...ponencias, ...conversatorios].reduce((sum, a) => sum + a.horas, 0);

  page2.drawLine({
    start: { x: margin - 5, y: y + 5 },
    end: { x: pageWidth - margin + 5, y: y + 5 },
    thickness: 2,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 25;

  page2.drawRectangle({
    x: margin - 5,
    y: y - 3,
    width: pageWidth - 2 * margin + 10,
    height: 30,
    color: rgb(0.1, 0.1, 0.4),
  });

  page2.drawText('TOTAL HORAS RELOJ:', {
    x: col1,
    y: y + 5,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page2.drawText(`(${totalHoras} hs)`, {
    x: col3,
    y: y + 5,
    size: 13,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  y -= 50;

  page2.drawText('Nota: Las ponencias y conversatorios son de asistencia obligatoria para todos los participantes.', {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
  y -= 18;

  page2.drawText('Los talleres son optativos según la inscripción previa de cada participante.', {
    x: margin,
    y,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Guardar
  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Certificado final generado en: ${outputPath}`);
  console.log(`Total horas: ${totalHoras}`);
}

agregarHoja2().catch(console.error);