const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs = require('fs');
const path = require('path');

async function generateCertificadoBase() {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28; // A4 width
  const pageHeight = 841.89; // A4 height
  const margin = 50;

  // ==================== PÁGINA 1 ====================
  const page1 = pdfDoc.addPage([pageWidth, pageHeight]);
  const { width, height } = page1.getSize();
  let y = height - margin;

  // Título
  page1.drawText('CERTIFICADO DE PARTICIPACIÓN', {
    x: margin,
    y,
    size: 22,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 40;

  // Línea decorativa
  page1.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 2,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 30;

  // Texto principal
  const certText = [
    'Se certifica que XXXXXX, XXXXXX, DNI N° XX.XXX.XXX,',
    'ha participado en calidad de XXXXXXXX en el',
    '',
    '“XXVI Encuentro Nacional de Profesores de Teatro - Dramatiza 2026”,',
    'bajo el lema: “Ser Teatro”, realizado en la ciudad de Salta capital.',
    'Los días 9, 10 y 11 de octubre de 2026.',
    'De modalidad presencial. Con una carga total de XX horas reloj.',
  ];

  certText.forEach((line, i) => {
    const isBold = i === 3 || i === 4;
    page1.drawText(line, {
      x: margin,
      y,
      size: 13,
      font: isBold ? fontBold : font,
      color: rgb(0, 0, 0),
      lineHeight: 20,
    });
    y -= 20;
  });

  y -= 20;

  // Declaraciones de Interés
  page1.drawText('Declaraciones de Interés:', {
    x: margin,
    y,
    size: 12,
    font: fontBold,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 22;

  const declaraciones = [
    'Avales:',
    'RES - 2026 - 344 - CD-ART # UNNE',
    'Universidad Nacional del Nordeste',
    '',
    'Declarado de Interés Cultural',
    'Ministerio de Educación y Cultura',
    'Secretaría de Cultura - Res. 84/2026',
    '',
    'Declarado de Interés por la',
    'Cámara de Diputados de Salta Res. Nº 322/2026',
  ];

  declaraciones.forEach((line) => {
    const isBold = line === 'Avales:' || line === 'Declarado de Interés Cultural' || line === 'Declarado de Interés por la';
    page1.drawText(line, {
      x: margin + 10,
      y,
      size: 11,
      font: isBold ? fontBold : font,
      color: rgb(0.2, 0.2, 0.2),
      lineHeight: 18,
    });
    y -= 18;
  });

  y -= 30;

  // Firmas placeholder
  page1.drawLine({
    start: { x: margin, y },
    end: { x: margin + 200, y },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  page1.drawText('Firma Autoridad', {
    x: margin,
    y: y - 18,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  page1.drawLine({
    start: { x: width - margin - 200, y },
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.5, 0.5, 0.5),
  });
  page1.drawText('Firma Coordinación', {
    x: width - margin - 200,
    y: y - 18,
    size: 10,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });

  // ==================== PÁGINA 2 ====================
  const page2 = pdfDoc.addPage([pageWidth, pageHeight]);
  y = height - margin;

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
    end: { x: width - margin, y },
    thickness: 1,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 25;

  // Datos del participante
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

  // Encabezados de tabla
  const col1 = margin;
  const col2 = margin + 350;
  const col3 = margin + 450;

  page2.drawText('ACTIVIDAD', {
    x: col1,
    y,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page2.drawText('TIPO', {
    x: col2,
    y,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });
  page2.drawText('HORAS', {
    x: col3,
    y,
    size: 11,
    font: fontBold,
    color: rgb(1, 1, 1),
  });

  // Fondo encabezado
  const headerHeight = 22;
  page2.drawRectangle({
    x: margin - 5,
    y: y - 3,
    width: width - 2 * margin + 10,
    height: headerHeight,
    color: rgb(0.1, 0.1, 0.4),
  });

  // Re-dibujar texto sobre fondo
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

  // Datos de ejemplo - Talleres
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

  // Función para dibujar filas
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

  // Sección Talleres
  if (talleres.length > 0) {
    page2.drawText('TALLERES (Optativos - Según inscripción)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.4),
    });
    y -= 22;

    talleres.forEach((t, i) => {
      y = drawRow(page2, t.nombre, 'Taller', t.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 10;
  }

  // Sección Ponencias
  if (ponencias.length > 0) {
    page2.drawText('PONENCIAS (Para todos los asistentes)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.1, 0.4, 0.1),
    });
    y -= 22;

    ponencias.forEach((p, i) => {
      y = drawRow(page2, p.nombre, 'Ponencia', p.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 10;
  }

  // Sección Conversatorios
  if (conversatorios.length > 0) {
    page2.drawText('CONVERSATORIOS (Para todos los asistentes)', {
      x: margin,
      y,
      size: 11,
      font: fontBold,
      color: rgb(0.4, 0.1, 0.1),
    });
    y -= 22;

    conversatorios.forEach((c, i) => {
      y = drawRow(page2, c.nombre, 'Conversatorio', c.horas, y, rowNum % 2 === 0);
      rowNum++;
    });
    y -= 15;
  }

  // Total
  const totalHoras = [...talleres, ...ponencias, ...conversatorios].reduce((sum, a) => sum + a.horas, 0);

  page2.drawLine({
    start: { x: margin - 5, y: y + 5 },
    end: { x: width - margin + 5, y: y + 5 },
    thickness: 2,
    color: rgb(0.1, 0.1, 0.4),
  });
  y -= 25;

  page2.drawRectangle({
    x: margin - 5,
    y: y - 3,
    width: width - 2 * margin + 10,
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

  // Nota al pie
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
  const outputPath = path.join(__dirname, '../public/certifica/base_cert_nuevo.pdf');
  fs.writeFileSync(outputPath, pdfBytes);
  console.log(`Certificado generado en: ${outputPath}`);
  console.log(`Total horas calculadas: ${totalHoras}`);
}

generateCertificadoBase().catch(console.error);