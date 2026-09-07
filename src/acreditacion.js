require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
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
  if (!rutaPlantilla) throw new Error('No se encontró la plantilla credencial_acreditacion.pdf.');

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
    lineGap: 9,
  };
  let y = 98.43;
  for (const s of datos.sesiones || []) {
    const nombre = s.taller || s.nombre || 'Taller';
    const lineasNombre = divisionEnLineas(`• ${nombre}`, fontBold, 6, TAL.maxWidth);
    for (const ln of lineasNombre) {
      if (y < 16) break;
      page.drawText(ln, { x: TAL.x, y, size: 6, font: fontBold, color: colorOscuro });
      y -= TAL.lineGap;
    }
    const detalle = [
      s.fecha ? `Fecha: ${formatoFecha(s.fecha)}` : '',
      s.hora ? `Hora: ${s.hora}` : '',
      s.lugar ? `Lugar: ${s.lugar}` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
    if (detalle) {
      const lineasDetalle = divisionEnLineas(detalle, font, 6, TAL.maxWidth);
      for (const ld of lineasDetalle) {
        if (y < 16) break;
        page.drawText(ld, { x: TAL.x + 8, y, size: 6, font, color: colorMutado });
        y -= TAL.lineGap;
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
  resolverImagen,
  base64DeArchivo,
  tipoMime,
  carpetaEntradas,
};
