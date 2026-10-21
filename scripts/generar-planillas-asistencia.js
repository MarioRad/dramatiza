require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/* Genera planillas de asistencia manuales (una por taller lógico, agrupando 2° parte).
 * Incluye logo (public/logo.png) y personaje (public/personaje.png) en el encabezado,
 * lista de inscriptos pre-impresa (Apellido y Nombre + DNI) y columnas vacías para
 * firma a mano, presente/ausente y observaciones.
 * Salida: planillas_asistencia/*.pdf + planillas_asistencia_TODAS.pdf
 */

const OUT_DIR = path.join(__dirname, '..', 'planillas_asistencia');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const PERSONAJE = path.join(__dirname, '..', 'public', 'personaje.png');
const FILAS_VACIAS_EXTRA = 4;

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

function limpiarNombreBase(nombre) {
  return String(nombre || '').replace(/\s*\(\d+°\s*(parte|pa).*?\)\s*/gi, '').trim();
}

function formatearFecha(fecha) {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return String(fecha || '-');
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function nombreArchivo(nombre, gid) {
  const base = limpiarNombreBase(nombre).slice(0, 50)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `T${String(gid).padStart(2, '0')}_${base || 'Taller'}.pdf`;
}

function dibujarEncabezado(doc, W, M) {
  const y0 = M * 0.6;
  // Logo izquierda
  try { if (fs.existsSync(LOGO)) doc.image(LOGO, M, y0, { width: 130 }); } catch (_) {}
  // Personaje derecha
  try { if (fs.existsSync(PERSONAJE)) doc.image(PERSONAJE, W - M - 80, y0, { width: 80 }); } catch (_) {}
  doc.fillColor('#7c2d12')
    .font('Helvetica-Bold').fontSize(13)
    .text('ENCUENTRO DRAMATIZA SALTA 2026', M + 140, y0 + 4, { width: W - 2 * M - 230, align: 'center' });
  doc.fillColor('#333').font('Helvetica-Bold').fontSize(11)
    .text('PLANILLA DE ASISTENCIA', M + 140, y0 + 22, { width: W - 2 * M - 230, align: 'center' });
  doc.fillColor('#666').font('Helvetica').fontSize(8)
    .text('Para completar a mano el día del taller', M + 140, y0 + 37, { width: W - 2 * M - 230, align: 'center' });
  // línea
  const yLine = y0 + 58;
  doc.strokeColor('#7c2d12').lineWidth(1.5).moveTo(M, yLine).lineTo(W - M, yLine).stroke();
  return yLine + 8;
}

function dibujarInfoTaller(doc, W, M, y, grupo, partes, inscriptos) {
  const nombre = limpiarNombreBase(partes[0].nombre);
  const fechas = partes.map((p) => `${formatearFecha(p.fecha)} ${p.hora || ''}`.trim()).join('  |  ');
  const disert = partes[0].disertante || '-';
  const lugar = partes[0].lugar || '-';
  doc.fillColor('#111').font('Helvetica-Bold').fontSize(11);
  const yStart = doc.y;
  doc.text(`Taller: ${nombre}`, M, y, { width: W - 2 * M });
  doc.font('Helvetica').fontSize(9).fillColor('#333');
  doc.text(`Tallerista: ${disert}     |     Fecha/Hora: ${fechas}     |     Lugar: ${lugar}`, { width: W - 2 * M });
  doc.text(`Inscriptos: ${inscriptos.length}     |     Cupo: ${partes[0].cupo}`, { width: W - 2 * M });
  return doc.y + 8;
}

function dibujarTabla(doc, W, M, y, inscriptos, dosPartes) {
  const cols = dosPartes
    ? [
        { t: 'N°', w: 30 },
        { t: 'APELLIDO Y NOMBRE', w: 220 },
        { t: 'DNI', w: 75 },
        { t: 'FIRMA DÍA 1', w: 130 },
        { t: 'FIRMA DÍA 2', w: 130 },
        { t: 'P/A', w: 45 },
        { t: 'OBSERVACIONES', w: 142 },
      ]
    : [
        { t: 'N°', w: 32 },
        { t: 'APELLIDO Y NOMBRE', w: 250 },
        { t: 'DNI', w: 85 },
        { t: 'FIRMA', w: 170 },
        { t: 'P/A', w: 50 },
        { t: 'OBSERVACIONES', w: 185 },
      ];
  const totalW = cols.reduce((a, c) => a + c.w, 0);
  const scale = (W - 2 * M) / totalW;
  const widths = cols.map((c) => c.w * scale);
  const rowH = 18;
  const headH = 16;
  const bottomLimit = doc.page.height - 90;

  function header(yy) {
    let x = M;
    doc.fillColor('#7c2d12').rect(M, yy, W - 2 * M, headH).fill();
    doc.fillColor('#fff').font('Helvetica-Bold').fontSize(7.5);
    cols.forEach((c, i) => {
      doc.text(c.t, x + 2, yy + 5, { width: widths[i] - 4, align: 'center' });
      x += widths[i];
    });
    return yy + headH;
  }

  function fila(yy, idx, apNom, dni, sombreada) {
    let x = M;
    if (sombreada) { doc.fillColor('#faf3ec').rect(M, yy, W - 2 * M, rowH).fill(); }
    doc.strokeColor('#bbb').lineWidth(0.5).rect(M, yy, W - 2 * M, rowH).stroke();
    // verticales
    let xv = M;
    for (let i = 0; i < widths.length - 1; i++) {
      xv += widths[i];
      doc.moveTo(xv, yy).lineTo(xv, yy + rowH).stroke();
    }
    doc.fillColor('#111');
    // N°
    doc.font('Helvetica').fontSize(8).text(String(idx), x + 2, yy + 5, { width: widths[0] - 4, align: 'center' });
    x += widths[0];
    // Apellido y nombre (pre-impreso, fuente 8, truncado si es largo)
    doc.font(idx <= inscriptos.length ? 'Helvetica' : 'Helvetica-Oblique').fontSize(8);
    const txt = apNom || '';
    doc.text(txt, x + 3, yy + 5, { width: widths[1] - 6, align: 'left', ellipsis: true });
    x += widths[1];
    doc.font('Helvetica').fontSize(8).text(dni || '', x + 2, yy + 5, { width: widths[2] - 4, align: 'center' });
    return yy + rowH;
  }

  let yy = header(y);
  const todas = [
    ...inscriptos.map((p) => ({ apNom: `${p.apellido}, ${p.nombre}`, dni: String(p.dni) })),
    ...Array.from({ length: FILAS_VACIAS_EXTRA }, () => ({ apNom: '', dni: '' })),
  ];
  todas.forEach((f, i) => {
    if (yy + rowH > bottomLimit) {
      doc.addPage();
      yy = header(doc.page.margins.top);
    }
    yy = fila(yy, i + 1, f.apNom, f.dni, i % 2 === 1);
  });
  return yy + 6;
}

function dibujarPie(doc, W, M, y) {
  let yy = y + 4;
  if (yy + 80 > doc.page.height - 50) { doc.addPage(); yy = doc.page.margins.top; }
  doc.fillColor('#555').font('Helvetica').fontSize(8)
    .text('P = Presente   A = Ausente   (marcar con una X)   •   Total presentes Día 1: ______    Día 2: ______', M, yy, { width: W - 2 * M });
  const yf = doc.y + 22;
  doc.strokeColor('#333').lineWidth(0.7);
  doc.moveTo(M + 20, yf).lineTo(M + 240, yf).stroke();
  doc.moveTo(W - M - 240, yf).lineTo(W - M - 20, yf).stroke();
  doc.fillColor('#333').font('Helvetica').fontSize(8);
  doc.text('Firma Tallerista', M + 20, yf + 4, { width: 220, align: 'center' });
  doc.text('Firma Responsable / Acreditación', W - M - 240, yf + 4, { width: 220, align: 'center' });
  doc.fillColor('#999').fontSize(7)
    .text(`Generado ${new Date().toLocaleString('es-AR')} — Encuentro Dramatiza Salta 2026`, M, doc.y + 10, { width: W - 2 * M, align: 'center' });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const db = pool();
  const t = await db.query('SELECT id,nombre,fecha,hora,lugar,cupo,disertante,pareja_id FROM talleres ORDER BY fecha,hora,id');
  const grupos = new Map();
  for (const r of t.rows) {
    const gid = r.pareja_id || r.id;
    if (!grupos.has(gid)) grupos.set(gid, []);
    grupos.get(gid).push(r);
  }
  const orden = [...grupos.entries()].sort((a, b) => {
    const fa = a[1][0].fecha + a[1][0].hora, fb = b[1][0].fecha + b[1][0].hora;
    return fa < fb ? -1 : fa > fb ? 1 : a[0] - b[0];
  });

  // PDF combinado
  const combinadoPath = path.join(__dirname, '..', 'planillas_asistencia_TODAS.pdf');
  const comb = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 30, bottom: 40, left: 30, right: 30 } });
  comb.pipe(fs.createWriteStream(combinadoPath));
  const W = comb.page.width, M = 30;
  let primera = true;

  for (const [gid, partes] of orden) {
    const ids = partes.map((p) => p.id);
    const q = await db.query(
      'SELECT DISTINCT apellido,nombre,dni FROM inscripciones WHERE taller_id = ANY($1::int[]) ORDER BY apellido,nombre',
      [ids]
    );
    const dosPartes = partes.length > 1;
    const fname = nombreArchivo(partes[0].nombre, gid);
    const fpath = path.join(OUT_DIR, fname);

    // PDF individual
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margins: { top: 30, bottom: 40, left: 30, right: 30 } });
    doc.pipe(fs.createWriteStream(fpath));
    let y = dibujarEncabezado(doc, doc.page.width, 30);
    y = dibujarInfoTaller(doc, doc.page.width, 30, y, gid, partes, q.rows);
    y = dibujarTabla(doc, doc.page.width, 30, y, q.rows, dosPartes);
    dibujarPie(doc, doc.page.width, 30, y);
    doc.end();
    console.log(`OK ${fname} (${q.rows.length} inscriptos${dosPartes ? ', 2 partes' : ''})`);

    // Agregar al combinado
    if (!primera) comb.addPage({ size: 'A4', layout: 'landscape', margins: { top: 30, bottom: 40, left: 30, right: 30 } });
    primera = false;
    // Re-dibujar en el combinado (mismo contenido). Guardamos estado de página:
    const y0 = dibujarEncabezado(comb, W, M);
    const y1 = dibujarInfoTaller(comb, W, M, y0, gid, partes, q.rows);
    // Tabla en combinado con manejo de páginas: si desborda, sigue en páginas nuevas
    // (dibujarTabla ya hace addPage cuando hace falta)
    const y2 = dibujarTabla(comb, W, M, y1, q.rows, dosPartes);
    dibujarPie(comb, W, M, y2);
  }
  comb.end();
  await db.end();
  console.log(`\nCombinado: ${combinadoPath}`);
  console.log(`Individuales en: ${OUT_DIR}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
