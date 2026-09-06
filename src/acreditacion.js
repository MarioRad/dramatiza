require('dotenv').config();

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const logs = require('./logs');

function generarCodigo() {
  return 'DSLA-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}

function formatoFecha(fechaStr) {
  const partes = String(fechaStr || '').trim().split('-');
  if (partes.length < 3) return fechaStr || '';
  return `${partes[2].padStart(2, '0')}/${partes[1].padStart(2, '0')}/${partes[0].length === 2 ? `20${partes[0]}` : partes[0]}`;
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
  const W = 311.81; // 110 mm
  const H = 198.43; // 70 mm
  const doc = new PDFDocument({ size: [W, H], margin: 0 });
  const buffers = [];
  doc.on('data', (c) => buffers.push(c));
  const terminado = new Promise((resolve) => doc.on('end', resolve));

  const colorPrimario = '#323136';
  const colorTexto = '#0f172a';
  const colorMutado = '#334155';
  const logo = resolverImagen('ENCUENTRO_LOGO_IMG', 'public/logo.png');
  const personaje = resolverImagen('ENCUENTRO_PERSONAJE_IMG', 'public/personaje.png');

  doc.rect(0, 0, W, 46).fill(colorPrimario);
  if (logo) {
    doc.image(logo, 8, 8, { fit: [120, 30] });
  }
  if (personaje) {
    doc.image(personaje, W - 8 - 60, 2, { fit: [60, 42] });
  }
  doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#ffffff')
    .text('ACREDITACIÓN AL ENCUENTRO', 10, 11, { align: 'center', width: W - 20 });
  doc.font('Helvetica-Bold').fontSize(4.5).fillColor('#ffffff')
    .text('Encuentro Nacional Dramatiza Salta 2026', 10, 24, { align: 'center', width: W - 20 });

  const anchoTexto = 198;
  let y = 52;
  const lineaNombre = `Apellido y Nombre: ${datos.apellido || ''} ${datos.nombre || ''}`.trim();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(colorTexto)
    .text(lineaNombre, 10, y, { width: anchoTexto });
  y += doc.heightOfString(lineaNombre, { width: anchoTexto }) + 3;

  doc.font('Helvetica').fontSize(6).fillColor(colorMutado);
  doc.text(`DNI: ${datos.dni || ''}`, 10, y);
  y += 11;
  if (datos.email) {
    doc.text(`Correo: ${datos.email}`, 10, y);
    y += 11;
  }
  doc.text(`Código único: ${datos.id}`, 10, y);
  y += 12;

  doc.font('Helvetica-Bold').fontSize(6).fillColor(colorPrimario);
  doc.text('Talleres:', 10, y);
  y += 10;
  doc.font('Helvetica').fontSize(7).fillColor(colorTexto);
  const sesiones = datos.sesiones || [];
  if (sesiones.length === 0) {
    doc.text('—', 10, y, { width: anchoTexto });
  } else {
    for (const s of sesiones) {
      const partes = [s.taller || 'Taller'];
      if (s.fecha) partes.push(`Fecha: ${formatoFecha(s.fecha)}`);
      if (s.hora) partes.push(`Hora: ${s.hora}`);
      if (s.lugar) partes.push(`Lugar: ${s.lugar}`);
      const texto = partes.join(' · ');
      doc.text(texto, 10, y, { width: anchoTexto });
      y += doc.heightOfString(texto, { width: anchoTexto }) + 3;
    }
  }

  const qrTam = 70;
  doc.image(qrBuffer, W - 10 - qrTam, 52, { width: qrTam, height: qrTam });

  doc.end();
  await terminado;
  return Buffer.concat(buffers);
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
