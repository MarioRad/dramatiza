require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

/* Flyer del programa Día 2 (sáb 10/10) y Día 3 (dom 11/10).
 * Lee programa_bloques + talleres de la base y genera un PDF A4 vertical
 * (1 página por día) con diseño de flyer: logo, personaje, línea de tiempo
 * de actividades con horarios, talleres con talleristas, ponencias y obras.
 * Salida: flyer_programa_dia2_dia3.pdf
 */

const OUT = path.join(__dirname, '..', 'flyer_programa_dia2_dia3.pdf');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const PERSONAJE = path.join(__dirname, '..', 'public', 'personaje.png');

const DIAS = ['2026-10-10', '2026-10-11'];

/* Paleta tomada del logo (figuras + SALTA) y del personaje:
 * rojo #D84818, naranja #F09018, azul #1890C0, verde #489030, amarillo #F2B705 */
const MARCA = {
  rojo: '#D84818',
  rojoOscuro: '#A93226',
  naranja: '#E8820C',
  azul: '#1890C0',
  amarillo: '#F2B705',
  verde: '#489030',
  marron: '#7B2D0E',
};

const TIPO_STYLE = {
  break: { pill: MARCA.naranja, fg: '#FFFFFF', bg: '#FDEBD0' },
  talleres: { pill: MARCA.rojo, fg: '#FFFFFF', bg: '#FBE3D8' },
  ponencia: { pill: MARCA.azul, fg: '#FFFFFF', bg: '#D6ECF7' },
  conversatorio: { pill: MARCA.amarillo, fg: '#5C3D00', bg: '#FEF3D3' },
  obra: { pill: MARCA.rojoOscuro, fg: '#FFFFFF', bg: '#F2DCDC' },
  inauguracion: { pill: MARCA.rojoOscuro, fg: '#FFFFFF', bg: '#F2DCDC' },
  general: { pill: MARCA.verde, fg: '#FFFFFF', bg: '#DFF0D8' },
};
const DEFAULT_STYLE = { pill: '#44403C', fg: '#FFFFFF', bg: '#E7E5E4' };

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

function nombreDia(fechaISO) {
  const d = new Date(`${fechaISO}T12:00:00`);
  const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Argentina/Salta' });
  const parts = Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]));
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  return { titulo: `${cap(parts.weekday)} ${parts.day} de ${parts.month}` };
}

// Nombres de talleres: la base trae uno truncado "(2° pa" -> normalizar
function nombreTaller(t) {
  return String(t.nombre || '').replace(/\(2°\s*pa\b[^)]*/gi, '(2° parte)');
}

function rangoHorario(b) {
  const ini = String(b.hora_inicio || '').slice(0, 5);
  const fin = String(b.hora_fin || '').slice(0, 5);
  return fin ? `${ini} – ${fin}` : `desde ${ini}`;
}

function dibujarPagina(doc, W, H, M, diaISO, nroDia, bloques, talleresPorBloque) {
  // Fondo crema
  doc.fillColor('#FFF7ED').rect(0, 0, W, H).fill();

  // Franja superior rojo marca
  const bandH = 64;
  doc.fillColor(MARCA.rojo).rect(0, 0, W, bandH).fill();
  let logoW = 0;
  try {
    if (fs.existsSync(LOGO)) {
      doc.image(LOGO, 18, 8, { width: 110 });
      logoW = 128;
    }
  } catch (_) {}
  try {
    if (fs.existsSync(PERSONAJE)) doc.image(PERSONAJE, W - 78, 2, { width: 62 });
  } catch (_) {}
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11)
    .text('ENCUENTRO DRAMATIZA • SALTA 2026', 18 + logoW, 14, { width: W - 36 - logoW - 80 });
  doc.fillColor('#FDE68A').font('Helvetica-Bold').fontSize(19)
    .text(`PROGRAMA • DÍA ${nroDia}`, 18 + logoW, 30, { width: W - 36 - logoW - 80 });

  const { titulo: tituloDia } = nombreDia(diaISO);
  let y = bandH + 14;
  doc.fillColor(MARCA.marron).font('Helvetica-Bold').fontSize(17)
    .text(tituloDia, M, y, { width: W - 2 * M, align: 'center' });
  y = doc.y + 12;

  const contentW = W - 2 * M;
  const pillW = 108;

  for (const b of bloques) {
    const st = TIPO_STYLE[b.tipo] || DEFAULT_STYLE;
    const rango = rangoHorario(b);
    const tx = M + pillW + 8;
    const tw = contentW - pillW - 8;

    // Armar líneas del bloque para medir la altura antes de dibujar
    const lineas = []; // {texto, font, size, color, indent}
    if (b.tipo === 'talleres') {
      const lista = talleresPorBloque[b.id] || [];
      for (const t of lista) {
        lineas.push({
          texto: `• ${nombreTaller(t)}${t.disertante ? ` — ${t.disertante}` : ''}`,
          font: 'Helvetica', size: 9.5, color: '#44403C', indent: 6,
        });
      }
    } else if (b.tipo === 'ponencia' && b.datos) {
      try {
        const items = JSON.parse(b.datos);
        for (const it of items) {
          lineas.push({
            texto: `• ${it.hora ? `[${it.hora}] ` : ''}${it.titulo}${it.ponente ? ` — ${it.ponente}` : ''}`,
            font: 'Helvetica', size: 9.5, color: '#44403C', indent: 6,
          });
        }
      } catch (_) {}
    } else if (b.descripcion) {
      const txt = String(b.descripcion).split('\n')[0].slice(0, 220).trim();
      if (txt) lineas.push({ texto: txt, font: 'Helvetica-Oblique', size: 9, color: '#78716C', indent: 0 });
    }

    // Medir altura
    doc.font('Helvetica-Bold').fontSize(11.5);
    let h = doc.heightOfString(b.titulo, { width: tw }) + 1;
    for (const l of lineas) {
      doc.font(l.font).fontSize(l.size);
      h += doc.heightOfString(l.texto, { width: tw - l.indent }) + 1;
    }
    const blockH = Math.max(h + 4, 22);
    if (y + blockH > H - 48) break;

    // Fondo + pastilla + textos
    doc.save();
    doc.fillColor(st.bg).opacity(0.5).roundedRect(M - 4, y - 3, contentW + 8, blockH + 6, 6).fill();
    doc.restore();
    doc.fillColor(st.pill).roundedRect(M, y, pillW, 20, 10).fill();
    doc.fillColor(st.fg).font('Helvetica-Bold').fontSize(9)
      .text(rango, M, y + 6, { width: pillW, align: 'center' });

    doc.fillColor('#1C1917').font('Helvetica-Bold').fontSize(11.5);
    doc.text(b.titulo, tx, y - 1, { width: tw });
    let yy = doc.y + 2;
    for (const l of lineas) {
      doc.fillColor(l.color).font(l.font).fontSize(l.size);
      doc.text(l.texto, tx + l.indent, yy, { width: tw - l.indent });
      yy = doc.y + 2;
    }

    y += blockH + 10;
  }

  // Pie
  doc.fillColor(MARCA.rojo).rect(0, H - 34, W, 34).fill();
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(8.5)
    .text('Talleres con inscripción previa • Obras en La Ventolera Casa de Arte', M, H - 23, { width: contentW, align: 'center' });
}

async function main() {
  const db = pool();
  const bq = await db.query(
    `SELECT * FROM programa_bloques WHERE dia = ANY($1) ORDER BY dia, orden, hora_inicio`,
    [DIAS]
  );
  const bloquesPorDia = { [DIAS[0]]: [], [DIAS[1]]: [] };
  for (const r of bq.rows) (bloquesPorDia[r.dia] || (bloquesPorDia[r.dia] = [])).push(r);

  const tq = await db.query(
    `SELECT id, nombre, disertante, fecha, hora FROM talleres
     WHERE fecha = ANY($1) ORDER BY fecha, hora, nombre`,
    [DIAS]
  );
  // Asociar talleres al bloque de tipo 'talleres' cuyo rango contiene su hora
  const talleresPorBloque = {};
  for (const t of tq.rows) {
    const bloques = (bloquesPorDia[t.fecha] || []).filter((b) => b.tipo === 'talleres');
    const hora = String(t.hora || '').slice(0, 5);
    const match = bloques.find((b) =>
      String(b.hora_inicio || '').slice(0, 5) <= hora &&
      (String(b.hora_fin || '') === '' || hora < String(b.hora_fin).slice(0, 5))
    ) || bloques[0];
    if (match) {
      if (!talleresPorBloque[match.id]) talleresPorBloque[match.id] = [];
      talleresPorBloque[match.id].push(t);
    }
  }
  // Ordenar talleres alfabéticamente dentro de cada bloque
  for (const k of Object.keys(talleresPorBloque)) {
    talleresPorBloque[k].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)));
  }
  await db.end();

  const doc = new PDFDocument({ size: 'A4', layout: 'portrait', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.pipe(fs.createWriteStream(OUT));
  const W = doc.page.width, H = doc.page.height, M = 28;

  dibujarPagina(doc, W, H, M, DIAS[0], 2, bloquesPorDia[DIAS[0]], talleresPorBloque);
  doc.addPage({ size: 'A4', layout: 'portrait', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  dibujarPagina(doc, W, H, M, DIAS[1], 3, bloquesPorDia[DIAS[1]], talleresPorBloque);
  doc.end();
  console.log(`OK ${OUT}`);
  console.log(`Día 2: ${bloquesPorDia[DIAS[0]].length} bloques | Día 3: ${bloquesPorDia[DIAS[1]].length} bloques`);
}

main().catch((e) => { console.error(e); process.exit(1); });
