require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');

function generarCodigo() {
  return 'ENC-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function formatoFecha(fechaStr) {
  const partes = String(fechaStr || '').trim().split('-');
  if (partes.length < 3) return fechaStr || '';
  return `${partes[2].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[0].slice(-2)}`;
}

function construirPayload({ id, dni, nombre, apellido, email, sesiones }) {
  return JSON.stringify({
    version: 1,
    id,
    dni,
    apellido,
    nombre,
    email,
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

async function generarPdf(payload) {
  const datos = parsearPayload(payload);
  if (!datos) throw new Error('Payload de acreditación inválido.');


  const qrBuffer = await generarPng(payload, { size: 420 });
  const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 30 });
  const buffers = [];
  doc.on('data', (c) => buffers.push(c));
  const terminado = new Promise((resolve) => doc.on('end', resolve));

  const colorPrimario = '#323136';
  const logo = resolverImagen('ENCUENTRO_LOGO_IMG', 'public/logo.png');
  const personaje = resolverImagen('ENCUENTRO_PERSONAJE_IMG', 'public/personaje.png');

  const anchoPagina = doc.page.width;

  const MARGIN = 30;

  //doc.rect(0, 0, doc.page.width, HEADER_HEIGHT).fill(colorPrimario);
  doc
  .roundedRect(10, 10, doc.page.width - 20, 80, 10).fill(colorPrimario);


  if (logo) {
    doc.image(logo, MARGIN, 30, { height: 48 });
  }
  

  if (personaje) {
    const anchoP = 90;
    doc.image(personaje, anchoPagina - MARGIN - anchoP, 30, { width: anchoP });
  } 
let y = 105;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(colorPrimario).text('ACREDITACIÓN AL ENCUENTRO', 30, y, {
    align: 'center',
    width: anchoPagina - 60,
  });
  y += 20;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(colorPrimario).text('Encuentro Nacional Dramatiza Salta 2026', 30, y, {
    align: 'center',
    width: anchoPagina - 60,
  });
  y += 20;
  doc.font('Helvetica').fontSize(11).fillColor('#334155').text(`Código único: ${datos.id}`, 30, y, {
    align: 'center',
    width: anchoPagina - 60,
  });

  const inicioX = 30;
  y = 170;
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f172a');
  doc.text(`Apellido y Nombre: ${datos.apellido || ''} ${datos.nombre || ''}`.trim(), inicioX, y);
  y += 18;
  doc.font('Helvetica').fontSize(11).fillColor('#334155');
  doc.text(`DNI: ${datos.dni || ''}`, inicioX, y);
  y += 16;
  if (datos.email) {
    doc.text(`Correo: ${datos.email}`, inicioX, y);
    y += 16;
  }

  y += 10;
  doc.font('Helvetica-Bold').fontSize(11).fillColor(colorPrimario);
  doc.text('Talleres:', inicioX, y);
  y += 16;
  doc.font('Helvetica').fontSize(10).fillColor('#0f172a');
  const sesiones = datos.sesiones || [];
  if (sesiones.length === 0) {
    doc.text('—', inicioX, y);
    y += 16;
  }
  for (const s of sesiones) {
    const partes = [`${s.taller || 'Taller'}`];
    if (s.fecha) partes.push(`Fecha: ${formatoFecha(s.fecha)}`);
    if (s.hora) partes.push(`Hora: ${s.hora}`);
    if (s.lugar) partes.push(`Lugar: ${s.lugar}`);
    const texto = partes.join(' · ');
    doc.text(texto, inicioX, y, { width: 270 });
    y += 42;
  }

  const qrX = anchoPagina - 30 - 250;
  const qrY = 165;
  doc.image(qrBuffer, qrX, qrY, { width: 250, height: 250 });

  doc.end();
  await terminado;
  return Buffer.concat(buffers);
}

function carpetaEntradas() {
  const carpeta = path.join(__dirname, '..', 'logs', 'entradas');
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
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
