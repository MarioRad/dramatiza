require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');

/* Programa 3 días en MEDIA HOJA vertical A4 (= A5 vertical 148x210mm).
 * 1 sola página, con nombres de talleres + QR a Facebook con logo al centro.
 * Salida: programa_3dias_media_hoja.pdf
 */
const OUT = path.join(__dirname, '..', 'programa_3dias_media_hoja.pdf');
const LOGO = path.join(__dirname, '..', 'public', 'logo.png');
const LOGO_ICON = path.join(__dirname, '..', 'public', 'logo_icon.png');
const FB_URL = 'https://www.facebook.com/dramatizasaltaoficial';

const ROJO = '#D84818';

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

function corto(b) {
  const t = String(b.titulo || '');
  if (/acreditaci/i.test(t)) return 'Acreditación y desayuno';
  if (/inauguraci/i.test(t)) return 'Inauguración + "El hielo que nos mira" (Jujuy)';
  if (/almuerzo/i.test(t)) return 'Almuerzo libre';
  if (/merienda/i.test(t)) return 'Merienda';
  if (/desayuno/i.test(t)) return 'Desayuno';
  if (/talleres en paralelo/i.test(t)) return 'Talleres en paralelo:';
  if (/ponencias/i.test(t)) return 'Bloque de ponencias';
  if (/las marrones/i.test(t)) return 'Obra "Las Marrones…" (Salta)';
  if (/hasta la muerte/i.test(t)) return 'Muestra "Hasta la muerte" (Jujuy)';
  if (/conversatorio/i.test(t) && /continuaci/i.test(t)) return 'Conversatorio J. Dubatti (cont.)';
  if (/conversatorio/i.test(t)) return 'Conversatorio con J. Dubatti';
  if (/rey muerto/i.test(t)) return 'Obra "A rey muerto" (Salta)';
  if (/medianera/i.test(t)) return 'Obra "Media medianera" (Tucumán)';
  if (/cierre/i.test(t)) return 'Acto de cierre';
  return t.length > 56 ? t.slice(0, 55).trim() + '…' : t;
}

// Nombre corto de taller + tallerista abreviado (1 línea)
function tallerCorto(t) {
  let n = String(t.nombre || '')
    .replace(/\(2°\s*pa[^)]*/gi, '(2° parte)')
    .replace(/\s+/g, ' ').trim();
  const d = String(t.disertante || '').split('–')[0].split('-')[0].trim();
  const apellido = d.split(' ').slice(-1)[0] || d;
  // Acortes conocidos
  const mapa = [
    [/aprender a producir y apreciar teatro/i, 'Producir y apreciar teatro'],
    [/cuerpo y la palabra como matriz/i, 'Cuerpo y palabra, matriz metafórica'],
    [/juego de improvisaci.n teatral/i, 'Juego de improvisación teatral'],
    [/llaves del aprendizaje/i, 'Llaves del aprendizaje: dramaterapia'],
    [/bunraku/i, 'Bunraku: marionetas'],
    [/escuelas porosas/i, 'Escuelas porosas'],
    [/gaga teatral/i, 'Gaga teatral'],
    [/sensorialidad y el teatro/i, 'Sensorialidad y teatro'],
    [/recursos con sentido/i, 'Recursos con sentido'],
    [/c.digos del mimo/i, 'Mimo y pantomima en el aula'],
    [/musicoterapia/i, 'Musicoterapia: identidad sonora'],
    [/dramaturgia de la inmersi/i, 'Dramaturgia de la inmersión'],
    [/teatro como dispositivo de salud/i, 'Teatro como dispositivo de salud'],
    [/miseria corporal/i, 'Miseria corporal: grotesco y Artaud'],
    [/inteligencia artificial/i, 'Teatro con IA'],
  ];
  for (const [re, s] of mapa) {
    if (re.test(n)) {
      n = /2° parte/i.test(n) && !/2° parte/i.test(s) ? `${s} (2° parte)` : s;
      break;
    }
  }
  if (n.length > 52) n = n.slice(0, 51).trim() + '…';
  return `• ${n} — ${apellido}`;
}

function rango(b) {
  const ini = String(b.hora_inicio || '').slice(0, 5);
  const fin = String(b.hora_fin || '').slice(0, 5);
  return fin ? `${ini}-${fin}` : ini;
}

const DIA_TITULO = {
  '2026-10-09': 'DÍA 1 • Vie 9/10',
  '2026-10-10': 'DÍA 2 • Sáb 10/10',
  '2026-10-11': 'DÍA 3 • Dom 11/10',
};

async function main() {
  const db = pool();
  const bq = await db.query('SELECT dia,hora_inicio,hora_fin,tipo,titulo FROM programa_bloques ORDER BY dia,orden,hora_inicio');
  const tq = await db.query('SELECT nombre,disertante,fecha,hora FROM talleres ORDER BY fecha,hora,nombre');
  await db.end();

  const porDia = {};
  for (const row of bq.rows) {
    const d = String(row.dia).slice(0, 10);
    (porDia[d] || (porDia[d] = [])).push(row);
  }
  // talleres por fecha+hora -> lista
  const talPorFechaHora = {};
  for (const t of tq.rows) {
    const k = `${String(t.fecha).slice(0, 10)}|${String(t.hora).slice(0, 5)}`;
    (talPorFechaHora[k] || (talPorFechaHora[k] = [])).push(t);
  }
  const dias = ['2026-10-09', '2026-10-10', '2026-10-11'];

  const doc = new PDFDocument({ size: 'A5', layout: 'portrait', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
  doc.pipe(fs.createWriteStream(OUT));
  const W = doc.page.width;
  const H = doc.page.height;
  const M = 12;
  const contentW = W - 2 * M;
  const horaW = 56;

  doc.fillColor('#FFF7ED').rect(0, 0, W, H).fill();

  // Cabecera compacta
  const bandH = 36;
  doc.fillColor(ROJO).rect(0, 0, W, bandH).fill();
  try {
    if (fs.existsSync(LOGO)) doc.image(LOGO, 8, 4, { width: 56 });
  } catch (_) {}
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(6.5)
    .text('ENCUENTRO DRAMATIZA • SALTA 2026', 70, 6, { width: W - 78 });
  doc.fillColor('#FDE68A').font('Helvetica-Bold').fontSize(12)
    .text('PROGRAMA • 3 DÍAS', 70, 15, { width: W - 78 });

  const FOOT_H = 66; // reserva para QR
  let y = bandH + 5;

  for (const d of dias) {
    const bloques = porDia[d] || [];
    doc.fillColor(ROJO).roundedRect(M, y, contentW, 13, 4).fill();
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.2)
      .text(DIA_TITULO[d] || d, M, y + 3, { width: contentW, align: 'center' });
    y += 15;

    for (const b of bloques) {
      const hh = rango(b);
      const tt = corto(b);
      doc.fillColor('#1C1917').font('Helvetica-Bold').fontSize(6).text(hh, M, y, { width: horaW });
      doc.fillColor('#1C1917').font('Helvetica-Bold').fontSize(6.3)
        .text(tt, M + horaW, y - 0.5, { width: contentW - horaW, ellipsis: true });
      y += 9.5;

      // Si es bloque de talleres: listar nombres
      if (b.tipo === 'talleres') {
        const k = `${d}|${String(b.hora_inicio).slice(0, 5)}`;
        let lista = talPorFechaHora[k] || [];
        if (!lista.length) {
          // fallback: buscar por fecha sola
          lista = tq.rows.filter((t) => String(t.fecha).slice(0, 10) === d);
        }
        doc.fillColor('#44403C').font('Helvetica').fontSize(5.2);
        for (const t of lista) {
          const line = tallerCorto(t);
          doc.text(line, M + horaW + 4, y, { width: contentW - horaW - 4, ellipsis: true });
          y += 7.6;
        }
      }
      doc.strokeColor('#E7E5E4').lineWidth(0.35)
        .moveTo(M + horaW, y + 0.5).lineTo(M + contentW, y + 0.5).stroke();
      y += 2.6;
      if (y > H - FOOT_H - 8) break;
    }
    y += 2;
  }

  // --- Pie con QR abajo a la izquierda ---
  const footY = H - FOOT_H;
  doc.fillColor(ROJO).rect(0, footY, W, FOOT_H).fill();
  const qrSize = 50;
  const qrX = M, qrY = footY + 8;
  try {
    const buf = await QRCode.toBuffer(FB_URL, { width: 220, margin: 1, errorCorrectionLevel: 'H' });
    doc.fillColor('#FFFFFF').roundedRect(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, 4).fill();
    doc.image(buf, qrX, qrY, { width: qrSize, height: qrSize });
    // Solo ícono (figuritas) al centro del QR, sin texto
    const iconSrc = fs.existsSync(LOGO_ICON) ? LOGO_ICON : LOGO;
    if (fs.existsSync(iconSrc)) {
      const ls = 13;
      doc.fillColor('#FFFFFF').rect(qrX + qrSize / 2 - ls / 2 - 1, qrY + qrSize / 2 - ls / 2 - 1, ls + 2, ls + 2).fill();
      doc.image(iconSrc, qrX + qrSize / 2 - ls / 2, qrY + qrSize / 2 - ls / 2, { width: ls, height: ls });
    }
    // Link clicable sobre el QR
    doc.link(qrX - 3, qrY - 3, qrSize + 6, qrSize + 6, FB_URL);
  } catch (e) {
    console.error('QR error', e.message);
  }
  const tx = qrX + qrSize + 12;
  const tw = W - tx - M;
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5)
    .text('Seguinos en Facebook', tx, qrY + 2, { width: tw });
  doc.fillColor('#FDE68A').font('Helvetica').fontSize(6.5)
    .text('facebook.com/dramatizasaltaoficial', tx, qrY + 13, { width: tw });
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(5.8)
    .text('Talleres con inscripción previa • Obras en La Ventolera (O’Higgins 585)', tx, qrY + 26, { width: tw });
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(5.8)
    .text('Escaneá el QR para más info', tx, qrY + 38, { width: tw });
  doc.link(tx, qrY + 13, tw, 10, FB_URL);

  doc.end();
  console.log(`OK ${OUT}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
