require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

/* Planilla de ACREDITACIÓN en Excel (para completar a mano o en PC).
 * Misma lista que planilla_acreditacion.pdf: todas las personas
 * (encuentro + talleres), con logo y personaje incrustados como imagen,
 * encabezado con formato, filtros, filas congeladas y ajuste de impresión
 * apaisada. Salida: planilla_acreditacion.xlsx
 */

const OUT = path.join(__dirname, '..', 'planilla_acreditacion.xlsx');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const PERSONAJE = path.join(__dirname, '..', 'public', 'personaje.png');
const FILAS_VACIAS_EXTRA = 15;

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

async function main() {
  const db = pool();
  const res = await db.query(
    `SELECT dni, nombre, apellido,
            en_encuentro, estado_pago, cantidad_talleres,
            MIN(primera_acreditacion) AS acreditado_en
     FROM (
       SELECT i.dni AS dni, MIN(i.nombre) AS nombre, MIN(i.apellido) AS apellido,
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
       SELECT e.dni AS dni, e.nombre, e.apellido,
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
     GROUP BY dni, nombre, apellido, en_encuentro, estado_pago, cantidad_talleres
     ORDER BY apellido, nombre`
  );
  await db.end();
  const personas = res.rows;
  const yaAcreditados = personas.filter((p) => p.acreditado_en).length;

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Encuentro Dramatiza Salta 2026';
  const ws = wb.addWorksheet('Acreditación', {
    pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    pageMargins: { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 },
    printTitlesRow: '5:5',
    headerFooter: { oddFooter: { center: { text: 'Página &P de &N' } } },
  });

  // Imágenes: logo (izq.) y personaje (der.)
  if (fs.existsSync(LOGO)) {
    const id = wb.addImage({ filename: LOGO, extension: 'png' });
    ws.addImage(id, { tl: { col: 0.1, row: 0.1 }, ext: { width: 190, height: 79 } });
  }
  if (fs.existsSync(PERSONAJE)) {
    const id = wb.addImage({ filename: PERSONAJE, extension: 'png' });
    ws.addImage(id, { tl: { col: 10.2, row: 0.05 }, ext: { width: 110, height: 73 } });
  }

  ws.getRow(1).height = 28;
  ws.getRow(2).height = 24;
  ws.getRow(3).height = 18;
  ws.getRow(4).height = 6;
  ws.mergeCells('D1:I1');
  ws.mergeCells('D2:I2');
  ws.mergeCells('D3:I3');
  const c1 = ws.getCell('D1');
  c1.value = 'ENCUENTRO DRAMATIZA SALTA 2026';
  c1.font = { size: 16, bold: true, color: { argb: 'FF7C2D12' } };
  c1.alignment = { horizontal: 'center', vertical: 'middle' };
  const c2 = ws.getCell('D2');
  c2.value = 'PLANILLA DE ACREDITACIÓN';
  c2.font = { size: 13, bold: true, color: { argb: 'FF333333' } };
  c2.alignment = { horizontal: 'center', vertical: 'middle' };
  const c3 = ws.getCell('D3');
  c3.value = `Total: ${personas.length}  |  Ya acreditadas: ${yaAcreditados}  |  Pendientes: ${personas.length - yaAcreditados}`;
  c3.font = { size: 9, color: { argb: 'FF666666' } };
  c3.alignment = { horizontal: 'center', vertical: 'middle' };

  const HEADERS = ['N°', 'Apellido', 'Nombre', 'DNI', 'Encuentro', 'Talleres', 'Pago', 'Acreditado', 'Hora', 'Pulsera', 'Firma', 'Observaciones'];
  const WIDTHS = [6, 22, 22, 12, 11, 10, 12, 14, 9, 9, 20, 24];
  WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const thin = { style: 'thin', color: { argb: 'FF999999' } };
  function borde() { return { top: thin, left: thin, bottom: thin, right: thin }; }

  const hr = ws.getRow(5);
  hr.height = 22;
  HEADERS.forEach((h, i) => {
    const cell = hr.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C2D12' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = borde();
  });

  const filas = [
    ...personas.map((p) => ({
      ap: p.apellido || '', no: p.nombre || '', dni: String(p.dni || ''),
      enc: p.en_encuentro ? 'Sí' : '—',
      tall: Number(p.cantidad_talleres) > 0 ? Number(p.cantidad_talleres) : '—',
      pago: pagoCorto(p.estado_pago),
      acre: p.acreditado_en ? fechaCorta(p.acreditado_en) : '',
    })),
    ...Array.from({ length: FILAS_VACIAS_EXTRA }, () => ({ ap: '', no: '', dni: '', enc: '', tall: '', pago: '', acre: '' })),
  ];

  filas.forEach((f, idx) => {
    const r = ws.getRow(6 + idx);
    r.height = 17;
    const vals = [idx + 1, f.ap, f.no, f.dni, f.enc, f.tall, f.pago, f.acre, '', '', '', ''];
    vals.forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v;
      cell.border = borde();
      cell.alignment = { horizontal: i === 1 || i === 2 ? 'left' : 'center', vertical: 'middle' };
      cell.font = { size: 10, bold: i === 7 && v ? true : false };
      if (i === 3) cell.numFmt = '@'; // DNI como texto
      if (idx % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF3EC' } };
    });
  });

  const last = 5 + filas.length;
  ws.autoFilter = { from: 'A5', to: `L${last}` };
  ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 5 }];

  // Desplegable en columna Pulsera: ✓ / X
  for (let i = 6; i <= last; i++) {
    ws.getCell(`J${i}`).dataValidation = {
      type: 'list', allowBlank: true, formulae: ['"✓,X"'], showDropDown: false,
    };
  }

  await wb.xlsx.writeFile(OUT);
  console.log(`OK planilla_acreditacion.xlsx (${personas.length} personas + ${FILAS_VACIAS_EXTRA} filas vacías)`);
  console.log(`Salida: ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
