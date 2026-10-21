require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb, degrees } = require('pdf-lib');
const logs = require('./logs');

function generarCodigo() {
  return 'DSLA-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function formatoFecha(fechaStr) {
  const partes = String(fechaStr || '').trim().split('-');
  if (partes.length < 3) return fechaStr || '';
  return `${partes[2].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[0].length === 2 ? `20${partes[0]}` : partes[0]}`;
}

function construirPayload({ id, dni, nombre, apellido, email, sesiones, alimentacion }) {
  return JSON.stringify({
    version: 1,
    id,
    dni,
    apellido,
    nombre,
    email,
    alimentacion: alimentacion || '',
    sesiones: (sesiones || []).map((s) => ({
      taller: s.taller,
      fecha: s.fecha || '',
      hora: s.hora || '',
      lugar: s.lugar || '',
    })),
  });
}

function parsearPayload(payload) {
  if (typeof payload === 'string') {
    try {
      return JSON.parse(payload);
    } catch (e) {
      return null;
    }
  }
  return payload || null;
}

function resolverImagen(envVar, defecto) {
  const ruta = process.env[envVar] || defecto;
  const absoluta = path.isAbsolute(ruta) ? ruta : path.join(__dirname, '..', ruta);
  return fs.existsSync(absoluta) ? absoluta : null;
}

function base64DeArchivo(ruta) {
  if (!ruta) return null;
  try {
    return fs.readFileSync(ruta).toString('base64');
  } catch (e) {
    return null;
  }
}

function tipoMime(ruta) {
  const ext = path.extname(ruta).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'image/png';
}

async function generarPng(payload, { size = 512 } = {}) {
  return QRCode.toBuffer(payload, {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'M',
  });
}

// ── QR PULSERA (Tyvek 2cm x 25cm, QR 1,8x1,8cm) ─────────────────────────
// Payload = SOLO DNI ("30123456"). En modo numérico ocupa QR Versión 1
// (21x21 módulos) contra Versión 8-10 del QR JSON actual → módulos ~3x más
// grandes y legibles a 1,8cm. No reemplaza al QR del email (se conserva).
// EC 'H' (30%): misma densidad (sigue V1 con 7-8 dígitos) pero aguanta
// agua/dobleces/desgaste de la pulsera.
function normalizarDniPulsera(dni) {
  const limpio = String(dni ?? '').replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(limpio)) throw new Error('DNI inválido para pulsera (7 u 8 dígitos).');
  return limpio;
}

async function generarPngPulsera(dni, { size = 600 } = {}) {
  const soloDni = normalizarDniPulsera(dni);
  return QRCode.toBuffer(soloDni, {
    type: 'png',
    width: size,
    margin: 2,
    errorCorrectionLevel: 'H',
  });
}

// PDF tira exacta 25cm x 2cm (1 página = 1 pulsera).
// QR 1,8cm a la izquierda + Apellido Nombre y DNI a la derecha.
// Medidas en puntos PDF (1cm = 28,3465pt).
function cmApt(cm) {
  return cm * 28.3465;
}

async function generarPdfPulsera({ dni, nombre = '', apellido = '' }) {
  const soloDni = normalizarDniPulsera(dni);
  const qrBuffer = await generarPngPulsera(soloDni, { size: 600 });

  const ANCHO = cmApt(25);
  const ALTO = cmApt(2);
  const LADO_QR = cmApt(1.8);
  const MARGEN = cmApt(0.1);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImg = await pdf.embedPng(qrBuffer);

  const agregarPulsera = (dSolo, dNombre, dApellido) => {
    const page = pdf.addPage([ANCHO, ALTO]);
    // Fondo blanco (quiet zone + Tyvek)
    page.drawRectangle({ x: 0, y: 0, width: ANCHO, height: ALTO, color: rgb(1, 1, 1) });
    // QR 1,8x1,8 centrado vertical, margen izquierdo 0,1cm
    const qrX = MARGEN;
    const qrY = (ALTO - LADO_QR) / 2;
    page.drawImage(qrImg, { x: qrX, y: qrY, width: LADO_QR, height: LADO_QR });
    // Texto a la derecha del QR
    const textoX = qrX + LADO_QR + cmApt(0.3);
    const nombreCompleto = `${dApellido || ''} ${dNombre || ''}`.trim().slice(0, 60);
    if (nombreCompleto) {
      page.drawText(nombreCompleto, {
        x: textoX, y: ALTO / 2 + 4, size: 11, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page.drawText(`DNI ${dSolo}`, {
      x: textoX, y: ALTO / 2 - 10, size: 11, font, color: rgb(0, 0, 0),
    });
  };

  agregarPulsera(soloDni, nombre, apellido);
  return Buffer.from(await pdf.save());
}

// PDF masivo: 1 página (25x2cm) por asistente, para tanda de impresión.
async function generarPdfPulserasMasivo(personas) {
  if (!Array.isArray(personas) || personas.length === 0) {
    throw new Error('Sin personas para generar pulseras.');
  }
  const ANCHO = cmApt(25);
  const ALTO = cmApt(2);
  const LADO_QR = cmApt(1.8);
  const MARGEN = cmApt(0.1);

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (const p of personas) {
    let soloDni;
    try {
      soloDni = normalizarDniPulsera(p.dni);
    } catch (_) { continue; }
    const qrBuffer = await generarPngPulsera(soloDni, { size: 600 });
    const qrImg = await pdf.embedPng(qrBuffer);
    const page = pdf.addPage([ANCHO, ALTO]);
    page.drawRectangle({ x: 0, y: 0, width: ANCHO, height: ALTO, color: rgb(1, 1, 1) });
    const qrX = MARGEN;
    const qrY = (ALTO - LADO_QR) / 2;
    page.drawImage(qrImg, { x: qrX, y: qrY, width: LADO_QR, height: LADO_QR });
    const textoX = qrX + LADO_QR + cmApt(0.3);
    const nombreCompleto = `${p.apellido || ''} ${p.nombre || ''}`.trim().slice(0, 60);
    if (nombreCompleto) {
      page.drawText(nombreCompleto, {
        x: textoX, y: ALTO / 2 + 4, size: 11, font: fontBold, color: rgb(0, 0, 0),
      });
    }
    page.drawText(`DNI ${soloDni}`, {
      x: textoX, y: ALTO / 2 - 10, size: 11, font, color: rgb(0, 0, 0),
    });
  }
  return Buffer.from(await pdf.save());
}

// ── RELLENO PLANTILLA PULSERAS x10 (Tyvek) ─────────────────────────────
// Plantilla: 1 hoja con 10 pulseras en columnas (texto rotado, lectura de
// arriba hacia abajo). Se copia la hoja por cada grupo de 10 personas.
// El QR se centra en la columna (no en el marco impreso, que en algunas
// plantillas viene 1-2mm corrido y pisa la línea de corte) con un fondo
// blanco que tapa el marcador "QR". La franja de etiquetas "DNI:" /
// "Apellido y Nombre:" también se tapa (la plantilla trae duplicados y
// desalineaciones) y se reescribe en tipografía uniforme:
//   - "DNI: xxxxxxxx" (clave para el escáner, payload = solo DNI)
//   - "Apellido, Nombre" (truncado a 24 caracteres por el ancho útil)
// Coordenadas medidas sobre la plantilla Inkscape (origen arriba-izquierda).
// Columnas regulares de 53,94pt desde x=0,80. En pdf-lib (origen
// abajo-izquierda) se convierten con y = H - yMedido.
const PULSERA_COL_X0 = [0.80, 54.74, 108.68, 162.61, 216.55, 270.49, 324.43, 378.37, 432.30, 486.24];
const PULSERA_COL_W = 53.94;
const PULSERA_QR_Y0 = 101.91; // medido arriba-izquierda
const PULSERA_QR_COVER_W = 51;
const PULSERA_QR_COVER_H = 50;
const PULSERA_QR_LADO = 45.5;
const PULSERA_ETIQ_Y0 = 148; // franja de etiquetas (medido arriba-izq.)
const PULSERA_ETIQ_H = 92;
const PULSERA_TEXTO_Y0 = 160; // origen de los textos (medido arriba-izq.)
const PULSERA_ROT = () => degrees(270);

function rutaPlantillaPulsera() {
  return resolverImagen('PULSERA_TEMPLATE_PDF', 'public/pulseras_qr_10.pdf');
}

async function dibujarPulseraEnPagina(pdf, page, font, fontBold, slot, { dni, nombre, apellido }) {
  const H = page.getHeight();
  const soloDni = normalizarDniPulsera(dni);
  const qrBuffer = await generarPngPulsera(soloDni, { size: 600 });
  const qrImg = await pdf.embedPng(qrBuffer);
  const colX = PULSERA_COL_X0[slot];

  // 1) QR centrado en la columna (tapa marco impreso + marcador "QR")
  const covX = colX + (PULSERA_COL_W - PULSERA_QR_COVER_W) / 2;
  const covY = H - PULSERA_QR_Y0 - PULSERA_QR_COVER_H;
  page.drawRectangle({ x: covX, y: covY, width: PULSERA_QR_COVER_W, height: PULSERA_QR_COVER_H, color: rgb(1, 1, 1) });
  const imgX = colX + (PULSERA_COL_W - PULSERA_QR_LADO) / 2;
  page.drawImage(qrImg, {
    x: imgX,
    y: covY + (PULSERA_QR_COVER_H - PULSERA_QR_LADO) / 2,
    width: PULSERA_QR_LADO,
    height: PULSERA_QR_LADO,
  });

  // 2) Franja de etiquetas: se tapa (plantilla con duplicados) y se reescribe
  const etqY = H - PULSERA_ETIQ_Y0 - PULSERA_ETIQ_H;
  page.drawRectangle({ x: colX + 1, y: etqY, width: PULSERA_COL_W - 2, height: PULSERA_ETIQ_H, color: rgb(1, 1, 1) });
  const textoY = H - PULSERA_TEXTO_Y0;
  page.drawText(`DNI: ${soloDni}`, {
    x: colX + 5.5,
    y: textoY,
    size: 9,
    font: fontBold,
    color: rgb(0, 0, 0),
    rotate: PULSERA_ROT(),
  });
  const nombreCompleto = `${apellido || ''}${apellido && nombre ? ', ' : ''}${nombre || ''}`.trim().slice(0, 24);
  if (nombreCompleto) {
    page.drawText(nombreCompleto, {
      x: colX + 37,
      y: textoY,
      size: 8,
      font,
      color: rgb(0.15, 0.15, 0.15),
      rotate: PULSERA_ROT(),
    });
  }
}

// Rellena la plantilla con N personas (10 por hoja, en el orden recibido).
// Si `soloSlots` es un número, rellena solo esa cantidad de slots (p. ej.
// pulsera individual = 1 slot en 1 hoja).
async function rellenarPulserasPlantilla(personas, { porHoja = 10, slots = null } = {}) {
  const lista = (Array.isArray(personas) ? personas : [])
    .map((p) => ({ dni: String(p.dni || '').replace(/\D/g, ''), nombre: p.nombre || '', apellido: p.apellido || '' }))
    .filter((p) => /^\d{7,8}$/.test(p.dni));
  const recorte = slots ? lista.slice(0, slots) : lista;
  if (recorte.length === 0) throw new Error('Sin personas con DNI válido para pulseras.');

  const ruta = rutaPlantillaPulsera();
  if (!ruta) throw new Error('No se encontró la plantilla de pulseras (public/pulseras_qr_10.pdf).');
  const base = await PDFDocument.load(fs.readFileSync(ruta));
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  for (let i = 0; i < recorte.length; i += porHoja) {
    const grupo = recorte.slice(i, i + porHoja);
    const [pagina] = await pdf.copyPages(base, [0]);
    pdf.addPage(pagina);
    for (let s = 0; s < grupo.length; s++) {
      await dibujarPulseraEnPagina(pdf, pagina, font, fontBold, s, grupo[s]);
    }
  }
  return Buffer.from(await pdf.save());
}

const UMBRAL_ALIMENTACION = {
  sin_restriccion: 'Sin restricción',
  vegano: 'Vegano',
  sin_tacc: 'Sin TACC',
  sin_lactosa: 'Sin lactosa',
  otro: 'Otro',
};

const COLOR_ALIMENTACION = {
  vegano: rgb(0, 0.6, 0.28),
  sin_tacc: rgb(1, 0.6, 0.1),
  sin_restriccion: rgb(0, 0, 0),
  sin_lactosa: rgb(0.05, 0.45, 0.72),
  otro: rgb(0.55, 0.55, 0.55),
};

function divisionEnLineas(texto, font, size, maxWidth) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const propuesta = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(propuesta, size) > maxWidth && actual) {
      lineas.push(actual);
      actual = palabra;
    } else {
      actual = propuesta;
    }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

async function generarPdf(payload) {
  const datos = parsearPayload(payload);
  if (!datos) throw new Error('Payload de acreditación inválido.');

  const qrBuffer = await generarPng(payload, { size: 512 });
  const rutaPlantilla = resolverImagen('CREDENCIAL_TEMPLATE_PDF', 'public/credencial_acreditacion.pdf');
  if (!rutaPlantilla) throw new Error('No se encontró la plantilla credencial');

  const pdf = await PDFDocument.load(fs.readFileSync(rutaPlantilla));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImg = await pdf.embedPng(qrBuffer);

  const page = pdf.getPages()[0];
  const H = page.getHeight();
  const colorOscuro = rgb(0.055, 0.09, 0.16);
  const colorMutado = rgb(0.2, 0.255, 0.333);

  const QRD = {
    x: 205.512,
    top: 52.441,
    size: 297.638 - 205.512,
  };
  page.drawImage(qrImg, {
    x: QRD.x,
    y: H - QRD.top - QRD.size,
    width: QRD.size,
    height: QRD.size,
  });

  const campos = [
    {
      texto: `${datos.apellido || ''} ${datos.nombre || ''}`.trim(),
      x: 76,
      y: 138.642,
      size: 7,
      bold: true,
      color: colorOscuro,
    },
    { texto: datos.dni || '', x: 24, y: 126.227, size: 6, color: colorMutado },
    { texto: datos.email || '', x: 33, y: 115.228, size: 6, color: colorMutado },
    { texto: datos.id || '', x: 251, y: 39.628, size: 6, color: colorMutado },
  ];
  for (const c of campos) {
    if (c.texto) {
      page.drawText(c.texto, {
        x: c.x,
        y: c.y,
        size: c.size,
        font: c.bold ? fontBold : font,
        color: c.color,
      });
    }
  }

  const alimentacion = datos.alimentacion
    ? UMBRAL_ALIMENTACION[datos.alimentacion] || datos.alimentacion
    : '';
  if (alimentacion) {
    const colorBox = COLOR_ALIMENTACION[datos.alimentacion] || COLOR_ALIMENTACION.otro;
    const fontSize = 6;
    const padX = 3;
    const boxH = 9;
    const anchoTexto = fontBold.widthOfTextAtSize(alimentacion, fontSize);
    page.drawRectangle({
      x: 51,
      y: 12.897 - 2.5,
      width: anchoTexto + padX * 2 + 2,
      height: boxH,
      color: colorBox,
    });
    page.drawText(alimentacion, {
      x: 53,
      y: 12.897,
      size: fontSize,
      font: fontBold,
      color: rgb(1, 1, 1),
    });
  }

  const TAL = {
    x: 20,
    maxWidth: 205.512 - 24,
    lineGap: 6,
    sizeNombre: 4,
    sizeDetalle: 4,
    gapDetalle: 5,
  };

  const REG_SUFIJO_PARTE = /\s*\(\s*\d+\s*[º°]\s*parte\s*\)\s*$/gi;

  function baseNombre(tallerNombre) {
    return String(tallerNombre || '').replace(REG_SUFIJO_PARTE, '').trim();
  }

  const gruposSesiones = [];
  const indiceGrupos = new Map();
  for (const s of datos.sesiones || []) {
    const base = baseNombre(s.taller);
    if (!indiceGrupos.has(base)) {
      const g = {
        nombre: base,
        esMultiparte: REG_SUFIJO_PARTE.test(String(s.taller || '')),
        items: [],
      };
      indiceGrupos.set(base, g);
      gruposSesiones.push(g);
    }
    indiceGrupos.get(base).items.push(s);
  }
  gruposSesiones.forEach((g) => {
    g.esMultiparte = g.items.some((s) => REG_SUFIJO_PARTE.test(String(s.taller || '')));
    g.items.sort(
      (a, b) => String(a.fecha || '').localeCompare(String(b.fecha || ''))
        || String(a.hora || '').localeCompare(String(b.hora || ''))
    );
  });

  let y = 98.43;
  for (const g of gruposSesiones) {
    const items = g.items;
    const esMultiparte = g.esMultiparte && items.length > 1;
    const nombre = g.nombre + (esMultiparte ? ' (1º y 2º parte)' : '');
    const lineasNombre = divisionEnLineas(`• ${nombre}`, fontBold, TAL.sizeNombre, TAL.maxWidth);
    for (const ln of lineasNombre) {
      if (y < 16) break;
      page.drawText(ln, { x: TAL.x, y, size: TAL.sizeNombre, font: fontBold, color: colorOscuro });
      y -= TAL.lineGap;
    }

    let detalle;
    if (esMultiparte) {
      const jornadas = items.map((s, i) => {
        const partes = [
          s.fecha ? `Fecha: ${formatoFecha(s.fecha)}` : '',
          s.hora ? `Hora: ${s.hora}` : '',
          s.lugar ? `Lugar: ${s.lugar}` : '',
        ].filter(Boolean).join(' · ');
        return `Parte ${i + 1}º: ${partes}`;
      });
      detalle = jornadas.join('   ');
    } else {
      const s = items[0];
      detalle = [
        s.fecha ? `Fecha: ${formatoFecha(s.fecha)}` : '',
        s.hora ? `Hora: ${s.hora}` : '',
        s.lugar ? `Lugar: ${s.lugar}` : '',
      ]
        .filter(Boolean)
        .join('  ·  ');
    }

    if (detalle) {
      const lineasDetalle = divisionEnLineas(detalle, font, TAL.sizeDetalle, TAL.maxWidth);
      for (const ld of lineasDetalle) {
        if (y < 16) break;
        page.drawText(ld, {
          x: TAL.x + 8,
          y,
          size: TAL.sizeDetalle,
          font,
          color: colorMutado,
        });
        y -= TAL.gapDetalle;
      }
    }
  }

  return Buffer.from(await pdf.save());
}

function carpetaEntradas() {
  return logs.carpetaLogs('entradas');
}

module.exports = {
  generarCodigo,
  construirPayload,
  parsearPayload,
  generarPng,
  generarPdf,
  generarPngPulsera,
  generarPdfPulsera,
  generarPdfPulserasMasivo,
  rellenarPulserasPlantilla,
  rutaPlantillaPulsera,
  normalizarDniPulsera,
  resolverImagen,
  base64DeArchivo,
  tipoMime,
  carpetaEntradas,
};
