require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/* Planilla de ACREDITACIÓN para completar a mano en mesa de entrada.
 * Una sola lista alfabética con TODAS las personas (encuentro + talleres):
 *   N° | Apellido y Nombre | DNI | Encuentro | Talleres | Pago | Acreditado | Hora | Pulsera | Firma | Obs.
 * Las columnas Apellido/Nombre, DNI, Encuentro, Talleres, Pago y Acreditado
 * salen pre-impresas desde la base; Hora, Pulsera, Firma y Obs. se llenan a mano.
 * Encabezado con logo (public/logo.png) y personaje (public/personaje.png).
 * Salida: planilla_acreditacion.pdf
 */

const OUT = path.join(__dirname, '..', 'planilla_acreditacion.pdf');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const PERSONAJE = path.join(__dirname, '..', 'public', 'personaje.png');
const FILAS_VACIAS_EXTRA = 8;

function pool() {
  const { Pool } = require('pg');
  let cs = process.env.DATABASE_URL;
  if (!cs) {
    return new Pool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 5432),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'inscripciones',
    });
  }
  const u = new URL(cs);
  u.searchParams.delete('sslmode');
  return new Pool({ connectionString: u.toString(), ssl: { rejectUnauthorized: false } });
}

function pagoCorto(v) {
  const s = String(v || '').trim();
  if (s === 'pago_completo') return 'Completo';
  if (s === 'pago_parcial') return 'Parcial';
  if (s === 'no_pagado') return 'No pagó';
  return '—';
}

function fechaCorta(v) {
  if (!v) return '';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function cargarPersonas(db) {
  const res = await db.query(
    `SELECT dni, nombre, apellido, email, telefono,
            en_encuentro, estado_pago, cantidad_talleres,
            MIN(primera_acreditacion) AS acreditado_en
     FROM (
       SELECT i.dni AS dni, MIN(i.nombre) AS nombre, MIN(i.apellido) AS apellido,
              MIN(i.email) AS email, MIN(i.telefono) AS telefono,
              (BOOL_OR(i.en_encuentro) OR BOOL_OR(e.id IS NOT NULL)) AS en_encuentro,
              MIN(i.estado_pago) AS estado_pago,
              COUNT(*) AS cantidad_talleres,
              MIN(a.registrado_en) AS primera_acreditacion
       FROM inscripciones i
       JOIN talleres t ON t.id = i.taller_id
       LEFT JOIN encuentro_inscripciones e ON e.dni = i.dni AND e.oculto = FALSE
       LEFT JOIN acreditaciones a ON a.dni = i.dni
       GROUP BY i.dni
       UNION ALL
       SELECT e.dni AS dni, e.nombre, e.apellido, e.email, e.telefono,
              TRUE AS en_encuentro,
              COALESCE(NULLIF(e.pago, ''), 'no_pagado') AS estado_pago,
              0 AS cantidad_talleres,
              MIN(a.registrado_en) AS primera_acreditacion
       FROM encuentro_inscripciones e
       LEFT JOIN acreditaciones a ON a.dni = e.dni
       WHERE e.oculto = FALSE
         AND NOT EXISTS (SELECT 1 FROM inscripciones i2 WHERE i2.dni = e.dni)
       GROUP BY e.dni, e.nombre, e.apellido, e.email, e.telefono, e.pago
     ) AS unidos
     GROUP BY dni, nombre, apellido, email, telefono, en_encuentro, estado_pago, cantidad_talleres
     ORDER BY apellido, nombre`
  );
  return res.rows;
}

function dibujarEncabezado(doc, W, M) {
  const y0 = M * 0.6;
  try { if (fs.existsSync(LOGO)) doc.image(LOGO, M, y0, { width: 130 }); } catch (_) {}
  try { if (fs.existsSync(PERSONAJE)) doc.image(PERSONAJE, W - M - 80, y0, { width: 80 }); } catch (_) {}
  doc.fillColor('#7c2d12')
    .font('Helvetica-Bold').fontSize(13)
    .text('ENCUENTRO DRAMATIZA SALTA 2026', M + 140, y0 + 4, { width: W - 2 * M - 230, align: 'center' });
  doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
    .text('PLANILLA DE ACREDITACIÓN', M + 140, y0 + 22, { width: W - 2 * M - 230, align: 'center' });
  doc.fillColor('#666').font('Helvetica').fontSize(8)
    .text('Para completar a mano en mesa de acreditación', M + 140, y0 + 37, { width: W - 2 * M - 230, align: 'center' });
  const yLine = y0 + 58;
  doc.strokeColor('#7c2d12').lineWidth(1.5).moveTo(M, yLine).lineTo(W - M, yLine).stroke();
  return yLine + 8;
}

function dibujarInfo(doc, W, M, y, total, yaAcreditados) {
  doc.fillColor('#333').font('Helvetica').fontSize(9);
  doc.text(
    `Total personas: ${total}     |     Ya acreditadas (sistema): ${yaAcreditados}     |     Pendientes: ${total - yaAcreditados}`,
    M, y, { width: W - 2 * M }
  );
  doc.fillColor('#666').fontSize(8);
  doc.text('Acreditado = fecha/hora pre-impresa si ya pasó por sistema, o tilde a mano.  Pulsera = tildar al entregar.', M, doc.y, { width: W - 2 * M });
  return doc.y + 8;
}

const COLS = [
  { t: 'N°', w: 28 },
  { t: 'APELLIDO Y NOMBRE', w: 190 },
  { t: 'DNI', w: 68 },
  { t: 'ENC.', w: 38 },
  { t: 'TALL.', w: 38 },
  { t: 'PAGO', w: 62 },
  { t: 'ACREDITADO', w: 78 },
  { t: 'HORA', w: 48 },
  { t: 'PULS.', w: 40 },
  { t: 'FIRMA', w: 105 },
  { t: 'OBS.', w: 87 },
];

function dibujarTabla(doc, W, M, y, personas) {
  const totalW = COLS.reduce((a, c) => a + c.w, 0);
  const scale = (W - 2 * M) / totalW;
  const widths = COLS.map((c) => c.w * scale);
  const rowH = 18;
  const headH = 16;
  const bottomLimit = doc.page.height - 90;

  function header(yy) {
    doc.fillColor('#7c2d12').rect(M, yy, W - 2 * M, headH).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7);
    let x = M;
    COLS.forEach((c, i) => {
      doc.text(c.t, x + 1, yy + 5, { width: widths[i] - 2, align: 'center' });
      x += widths[i];
    });
    return yy + headH;
  }

  function fila(yy, idx, p, sombreada) {
    if (sombreada) doc.fillColor('#faf3ec').rect(M, yy, W - 2 * M, rowH).fill();
    doc.strokeColor('#bbb').lineWidth(0.5).rect(M, yy, W - 2 * M, rowH).stroke();
    let xv = M;
    for (let i = 0; i < widths.length - 1; i++) {
      xv += widths[i];
      doc.moveTo(xv, yy).lineTo(xv, yy + rowH).stroke();
    }
    const esVacia = !p;
    const apNom = p ? `${p.apellido}, ${p.nombre}` : '';
    const dni = p ? String(p.dni) : '';
    const enc = p ? (p.en_encuentro ? 'Sí' : '—') : '';
    const tall = p ? (Number(p.cantidad_talleres) > 0 ? String(p.cantidad_talleres) : '—') : '';
    const pago = p ? pagoCorto(p.estado_pago) : '';
    const acre = p ? (p.acreditado_en ? fechaCorta(p.acreditado_en) : '') : '';
    const vals = [String(idx), apNom, dni, enc, tall, pago, acre, '', '', '', ''];
    let x = M;
    vals.forEach((v, i) => {
      let align = 'center';
      let font = 'Helvetica';
      let size = 8;
      if (i === 1) { align = 'left'; font = esVacia ? 'Helvetica-Oblique' : 'Helvetica'; }
      if (i === 6 && v) { font = 'Helvetica-Bold'; size = 7; }
      doc.fillColor('#111').font(font).fontSize(size);
      doc.text(v, x + (i === 1 ? 3 : 1), yy + 5, { width: widths[i] - (i === 1 ? 4 : 2), align, ellipsis: true });
      x += widths[i];
    });
    return yy + rowH;
  }

  let yy = header(y);
  const todas = [...personas, ...Array.from({ length: FILAS_VACIAS_EXTRA }, () => null)];
  todas.forEach((p, i) => {
    if (yy + rowH > bottomLimit) {
      doc.addPage();
      yy = header(doc.page.margins.top);
    }
    yy = fila(yy, i + 1, p, i % 2 === 1);
  });
  return yy + 6;
}

function dibujarPie(doc, W, M, y) {
  let yy = y + 4;
  if (yy + 80 > doc.page.height - 50) { doc.addPage(); yy = doc.page.margins.top; }
  doc.fillColor('#555').font('Helvetica').fontSize(8)
    .text('Total acreditados en planilla: ______     |     Pulseras entregadas: ______', M, yy, { width: W - 2 * M });
  const yf = doc.y + 22;
  doc.strokeColor('#333').lineWidth(0.7);
  doc.moveTo(M + 20, yf).lineTo(M + 240, yf).stroke();
  doc.moveTo(W - M - 240, yf).lineTo(W - M - 20, yf).stroke();
  doc.fillColor('#333').font('Helvetica').fontSize(8);
  doc.text('Firma Responsable Acreditación', M + 20, yf + 4, { width: 220, align: 'center' });
  doc.text('Firma Organización', W - M - 240, yf + 4, { width: 220, align: 'center' });
  doc.fillColor('#999').fontSize(7)
    .text(`Generado ${new Date().toLocaleString('es-AR')} — Encuentro Dramatiza Salta 2026`, M, doc.y + 10, { width: W - 2 * M, align: 'center' });
}

async function main() {
  const db = pool();
  const personas = await cargarPersonas(db);
  await db.end();
  const yaAcreditados = personas.filter((p) => p.acreditado_en).length;

  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 30, bottom: 40, left: 30, right: 30 } });
  doc.pipe(fs.createWriteStream(OUT));
  const W = doc.page.width, M = 30;
  let y = dibujarEncabezado(doc, W, M);
  y = dibujarInfo(doc, W, M, y, personas.length, yaAcreditados);
  y = dibujarTabla(doc, W, M, y, personas);
  dibujarPie(doc, W, M, y);
  doc.end();
  console.log(`OK planilla_acreditacion.pdf (${personas.length} personas, ${yaAcreditados} ya acreditadas)`);
  console.log(`Salida: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
