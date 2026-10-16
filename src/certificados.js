require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const QRCode = require('qrcode');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const FIRMA_SECRET = process.env.CERT_SECRET || process.env.JWT_SECRET || 'dramatiza-cert-secret';

function generarCodigoCertificado() {
  return 'CERT-' + crypto.randomBytes(5).toString('hex').toUpperCase();
}
function generarHashFirma(codigo, datos) {
  const base = `${codigo}|${datos.dni || ''}|${datos.nombre || ''}|${datos.apellido || ''}|${datos.tipo || ''}`;
  return crypto.createHmac('sha256', FIRMA_SECRET).update(base).digest('hex').slice(0, 32).toUpperCase();
}
function construirQrPayload(codigo) {
  // QR verificable por el momento en http://192.168.100.20/verificar.html?c=CODIGO (luego https://dramatiza.vercel.app)
  // Prioridad: BASE_URL / APP_URL / VERCEL_URL > host de request (server.js) > default local
  const baseUrl = (process.env.BASE_URL || process.env.APP_URL || process.env.VERCEL_URL || '').replace(/\/$/, '');
  if (baseUrl) {
    const normalized = baseUrl.startsWith('http') ? baseUrl : `http://${baseUrl}`;
    return `${normalized}/verificar.html?c=${codigo}`;
  }
  return `https://dramatiza.vercel.app/verificar.html?c=${codigo}`;
}
async function generarQrPng(payload, size = 220) {
  return QRCode.toBuffer(payload, { type: 'png', width: size, margin: 1, errorCorrectionLevel: 'M' });
}
function esModeloPonente(tipo) {
  const t = String(tipo || '').trim().toLowerCase();
  return t === 'ponente' || t === 'tallerista';
}
function resolverFondoCertificado(tipo) {
  // Dos modelos: asistente y ponente/tallerista. Si el fondo específico aún
  // no existe, se usa el fondo único actual (compatibilidad hacia atrás).
  const especificos = esModeloPonente(tipo)
    ? ['Certificado_ponente.png', 'certificado_ponente.png']
    : ['Certificado_asistente.png', 'certificado_asistente.png'];
  const candidatos = [...especificos, 'Certificado.png', 'certificado.png'];
  for (const n of candidatos) {
    const p = path.join(__dirname, '..', 'public', n);
    if (fs.existsSync(p)) return p;
  }
  return null;
}
function resolverFirmaImagen(num) {
  const nombres = [
    `firma${num}.png`, `Firma${num}.png`, `firma${num}.jpg`, `Firma${num}.jpg`,
    `firma_fondo${num}.png`, `firma_${num}.png`,
    `Firma_${num}.png`, `Firma_${num}.jpg`,
  ];
  for (const n of nombres) {
    const p = path.join(__dirname, '..', 'public', n);
    if (fs.existsSync(p)) return p;
  }
  const p2 = path.join(__dirname, '..', 'public', 'uploads', `firma${num}.png`);
  if (fs.existsSync(p2)) return p2;
  return null;
}
function formatearFechaLarga(fecha) {
  if (!fecha) fecha = new Date();
  else fecha = new Date(fecha);
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Salta',
    day: '2-digit', month: 'long', year: 'numeric',
  }).format(fecha);
}
function dividirTextoEnLineas(texto, font, size, maxWidth) {
  const palabras = String(texto || '').split(/\s+/).filter(Boolean);
  const lineas = [];
  let actual = '';
  for (const palabra of palabras) {
    const propuesta = actual ? `${actual} ${palabra}` : palabra;
    if (font.widthOfTextAtSize(propuesta, size) > maxWidth && actual) {
      lineas.push(actual);
      actual = palabra;
    } else actual = propuesta;
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Helpers del nuevo modelo de 2 páginas (public/certifica/base_cert.pdf)
// Coordenadas en "margen superior" (origen arriba-izquierda, como el diseño).
function topY(pageH, y) { return pageH - y; }
function formatearDniPuntos(dni) {
  const d = String(dni || '').replace(/\D/g, '');
  if (d.length === 8) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5)}`;
  if (d.length === 7) return `${d.slice(0, 1)}.${d.slice(1, 4)}.${d.slice(4)}`;
  return String(dni || '');
}
function resolverTalleresDetalle(detalle = {}) {
  const arr = Array.isArray(detalle.talleres) ? detalle.talleres : [];
  return arr.map((t) => String(t.nombre || t.taller || '').trim()).filter(Boolean);
}
function calcularHorasTotales(tipo, detalle = {}) {
  if (detalle.horasTotal != null && String(detalle.horasTotal).trim() !== '') {
    const n = parseInt(detalle.horasTotal, 10);
    if (Number.isFinite(n) && n > 0) return n;
  }
  const porTaller = parseInt(detalle.horas, 10) || 3;
  if (String(tipo || '').toLowerCase() === 'asistente') {
    const n = resolverTalleresDetalle(detalle).length || 1;
    return n * porTaller;
  }
  return porTaller;
}
// Troza segmentos [{t, bold}] en líneas que entran en maxWidth (greedy por palabras)
// Sin espacio delante de signos de puntuación (",", ".", ".-", ")", "”", etc.)
const SIN_ESPACIO_PREVIO = /^[,.;:!?)\]}»”"']+/;
function dividirRicoEnLineas(segmentos, font, fontBold, size, maxWidth) {
  const palabras = [];
  for (const seg of segmentos) {
    for (const w of String(seg.t || '').split(/\s+/).filter(Boolean)) {
      palabras.push({ w, bold: Boolean(seg.bold) });
    }
  }
  const medir = (w, bold) => (bold ? fontBold : font).widthOfTextAtSize(w, size);
  const espacio = font.widthOfTextAtSize(' ', size);
  const lineas = [];
  let actual = [];
  let ancho = 0;
  for (const p of palabras) {
    const ww = medir(p.w, p.bold);
    const pega = actual.length === 0 || SIN_ESPACIO_PREVIO.test(p.w);
    const extra = pega ? 0 : espacio;
    if (actual.length && ancho + extra + ww > maxWidth) {
      lineas.push(actual);
      actual = [p];
      ancho = ww;
    } else {
      actual.push(p);
      ancho += extra + ww;
    }
  }
  if (actual.length) lineas.push(actual);
  return lineas;
}

async function generarPdfCertificado(opts) {
  const {
    codigo,
    tipo = 'asistente',
    nombre = '',
    apellido = '',
    dni = '',
    detalle = {},
    emitidoEn = new Date(),
    firma1 = { nombre: 'Referente Nacional Nodo Salta', cargo: 'Red Dramatiza Salta' },
    firma2 = { nombre: 'Referente Provincial Nodo Salta', cargo: 'Red Dramatiza Salta' },
    avales = null, // array de hasta 4 textos (declaraciones/avales) o null/vacío para no dibujar recuadro
    hashFirma = '',
    qrPayloadOverride = null,
  } = opts;

  // Nuevo modelo 2 páginas (public/certifica/base_cert.pdf, 842x596 apaisado)
  const PAGE_W = 842;
  const PAGE_H = 596;
  const pdf = await PDFDocument.create();
  const page1 = pdf.addPage([PAGE_W, PAGE_H]);
  const page2 = pdf.addPage([PAGE_W, PAGE_H]);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const colNegro = rgb(0x11 / 255, 0x11 / 255, 0x11 / 255);
  const colSuave = rgb(0.35, 0.35, 0.35);
  const colLinea = rgb(0.45, 0.43, 0.43);

  function fondoDraw(pagina, cual) {
    const candidatos = [
      path.join(__dirname, '..', 'public', 'certifica', `fondo_${cual}.jpg`),
      path.join(__dirname, '..', 'public', 'certifica', `fondo_${cual}.png`),
    ];
    return (async () => {
      for (const fp of candidatos) {
        if (!fs.existsSync(fp)) continue;
        try {
          const bytes = fs.readFileSync(fp);
          const img = /\.png$/i.test(fp) ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          pagina.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
          return true;
        } catch (e) { console.warn('[certificados] fondo error', e.message); }
      }
      pagina.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: rgb(0.98, 0.97, 0.94) });
      return false;
    })();
  }
  await fondoDraw(page1, 'p1');
  await fondoDraw(page2, 'p2');

  function textoC1(texto, xCenter, yTop, size, f, color) {
    const w = f.widthOfTextAtSize(texto, size);
    page1.drawText(texto, { x: xCenter - w / 2, y: topY(PAGE_H, yTop), size, font: f, color });
  }
  function textoC2(texto, xCenter, yTop, size, f, color) {
    const w = f.widthOfTextAtSize(texto, size);
    page2.drawText(texto, { x: xCenter - w / 2, y: topY(PAGE_H, yTop), size, font: f, color });
  }
  // Dibuja una línea de palabras con estilos mixtos; x puede ser borde izquierdo o centro
  function lineaRica(pagina, palabras, { xLeft = null, xCenter = null, yTop, size }) {
    const espacio = font.widthOfTextAtSize(' ', size);
    let total = 0;
    palabras.forEach((p, i) => {
      const pega = i === 0 || SIN_ESPACIO_PREVIO.test(p.w);
      total += (p.bold ? fontBold : font).widthOfTextAtSize(p.w, size) + (pega ? 0 : espacio);
    });
    let x = xLeft != null ? xLeft : xCenter - total / 2;
    const y = topY(PAGE_H, yTop);
    palabras.forEach((p, i) => {
      if (i && !SIN_ESPACIO_PREVIO.test(p.w)) x += espacio;
      const f = p.bold ? fontBold : font;
      pagina.drawText(p.w, { x, y, size, font: f, color: colNegro });
      x += f.widthOfTextAtSize(p.w, size);
    });
    return total;
  }

  const tipoNorm = String(tipo || 'asistente').toLowerCase();
  const calidad = tipoNorm === 'ponente' ? 'PONENTE' : tipoNorm === 'tallerista' ? 'TALLERISTA' : 'ASISTENTE';
  const apellidoNombre = `${String(apellido || '').trim()}, ${String(nombre || '').trim()}`.replace(/^,\s*/, '').replace(/,\s*$/, '') || '—';
  const dniFmt = formatearDniPuntos(dni) || String(dni || '');
  const horasTotal = calcularHorasTotales(tipoNorm, detalle);
  const nombresTalleres = resolverTalleresDetalle(detalle);
  const tituloUnico = String(detalle.titulo || nombresTalleres[0] || '').trim();

  // ===== PÁGINA 1 =====
  // Logo Red (extraído del modelo)
  try {
    const logoPath = path.join(__dirname, '..', 'public', 'certifica', 'logo_red.png');
    if (fs.existsSync(logoPath)) {
      const img = await pdf.embedPng(fs.readFileSync(logoPath));
      const w = 147, h = 60, x = 66.7, yTop = 39.7;
      page1.drawImage(img, { x, y: topY(PAGE_H, yTop + h), width: w, height: h });
    }
  } catch (_) {}

  // Título
  textoC1('Certificado', 421, 150, 48, fontBold, colNegro);

  // Avales arriba-derecha (recuadro del modelo)
  const avalesRaw = Array.isArray(avales) ? avales.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 4) : [];
  if (avalesRaw.length > 0) {
    const ax0 = 612, ax1 = 812, ayTop = 75;
    const padX = 8, padY = 5;
    const maxW = ax1 - ax0 - padX * 2;
    let tam = 6.5, lineas = [];
    while (tam >= 5) {
      lineas = [];
      for (const t of avalesRaw) {
        lineas.push(...dividirTextoEnLineas(t, font, tam, maxW));
        lineas.push('');
      }
      if (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
      if (lineas.length * (tam + 1.5) + padY * 2 <= 66) break;
      tam -= 0.5;
    }
    const inter = tam + 1.5;
    const alto = Math.min(68, lineas.length * inter + padY * 2);
    page1.drawRectangle({ x: ax0, y: topY(PAGE_H, ayTop + alto), width: ax1 - ax0, height: alto, color: rgb(1, 1, 1), borderColor: colLinea, borderWidth: 0.8 });
    let ay = ayTop + padY + tam;
    const cx = (ax0 + ax1) / 2;
    for (const l of lineas) {
      if (l) {
        const w = font.widthOfTextAtSize(l, tam);
        page1.drawText(l, { x: cx - w / 2, y: topY(PAGE_H, ay), size: tam, font, color: colNegro });
      }
      ay += inter;
    }
  }

  // Cuerpo principal (igual redacción que el modelo, con datos reales)
  // Anchos del modelo: líneas 1-2 hasta x=773; líneas 3-4 hasta x~623 (zona de la mascota)
  const cuerpoSize = 15.5;
  const cuerpoX = 83;
  const cuerpoWFull = 690; // 83 -> 773
  const cuerpoWcorto = 540; // 83 -> 623 (evita la mascota)
  const segLinea1 = [
    { t: 'Se certifica que' },
    { t: apellidoNombre, bold: true },
    { t: ', DNI N°' },
    { t: dniFmt, bold: true },
    { t: ', ha participado en calidad de' },
    { t: calidad, bold: true },
  ];
  const segLinea2 = [
    { t: 'en el' },
    { t: '“XXVI Encuentro Nacional de Profesores de Teatro - Dramatiza 2026”', bold: true },
    { t: ', bajo el lema:' },
    { t: '“Ser Teatro”', bold: true },
    { t: ', de modalidad presencial.' }
  ];
  const segLinea3 = [];
  const segLinea4 = [
    { t: 'Con una carga horaria de' },
    { t: String(horasTotal), bold: true },
    { t: 'horas reloj, desde el 09/10/2026 hasta el 11/10/2026.-' },
  ];
  let yCuerpo = 205;
  const interCuerpo = 24;
  for (const segs of [segLinea1, segLinea2]) {
    const lineas = dividirRicoEnLineas(segs, font, fontBold, cuerpoSize, cuerpoWFull);
    for (const ln of lineas) {
      lineaRica(page1, ln, { xLeft: cuerpoX, yTop: yCuerpo, size: cuerpoSize });
      yCuerpo += interCuerpo;
    }
  }
  for (const segs of [segLinea3, segLinea4]) {
    const lineas = dividirRicoEnLineas(segs, font, fontBold, cuerpoSize, cuerpoWcorto);
    for (const ln of lineas) {
      lineaRica(page1, ln, { xLeft: cuerpoX, yTop: yCuerpo, size: cuerpoSize });
      yCuerpo += interCuerpo;
    }
  }

  // "Se extiende el presente..." (centrado en zona libre izquierda por la mascota;
  // baja si el cuerpo ocupó más líneas por nombres largos)
  const yExtiende = Math.max(340, yCuerpo + 8);
  textoC1('Se extiende el presente en la ciudad de Salta', 385, yExtiende, 16, font, colNegro);
  textoC1('a los once días del mes de octubre del año dos mil veintiseis.-', 385, yExtiende + 20, 16, font, colNegro);

  // Firmas: líneas + nombres/cargos + imágenes configuradas
  const lineaY = 490, f1Cx = 180, f2Cx = 610, fAncho = 190;
  async function drawFirma(pagina, firma, centerX, escala = 1) {
    const imgPath = firma.imagenPath || resolverFirmaImagen(firma.num);
    if (imgPath && fs.existsSync(imgPath)) {
      try {
        const bytes = fs.readFileSync(imgPath);
        const isJpg = /\.jpe?g$/i.test(imgPath);
        const img = isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        const dims = img.scale(1);
        const ratio = Math.min(1, (130 * escala) / dims.width, (42 * escala) / dims.height);
        const w = dims.width * ratio, h = dims.height * ratio;
        // Base de la imagen apenas por encima de la línea de firma
        pagina.drawImage(img, { x: centerX - w / 2, y: topY(PAGE_H, lineaY) + 4, width: w, height: h });
      } catch (_) {}
    }
  }
  await drawFirma(page1, { ...firma1, num: 1 }, f1Cx, 1.45);
  await drawFirma(page1, { ...firma2, num: 2 }, f2Cx, 0.9);
  page1.drawLine({ start: { x: f1Cx - fAncho / 2, y: topY(PAGE_H, lineaY) }, end: { x: f1Cx + fAncho / 2, y: topY(PAGE_H, lineaY) }, thickness: 0.8, color: colNegro });
  page1.drawLine({ start: { x: f2Cx - fAncho / 2, y: topY(PAGE_H, lineaY) }, end: { x: f2Cx + fAncho / 2, y: topY(PAGE_H, lineaY) }, thickness: 0.8, color: colNegro });
  textoC1(firma1.nombre || 'Referente Nacional Nodo Salta', f1Cx, 518, 11, font, colNegro);
  textoC1(firma1.cargo || 'Red Dramatiza Salta', f1Cx, 532, 10, font, colNegro);
  textoC1(firma2.nombre || 'Referente Provincial Nodo Salta', f2Cx, 518, 11, font, colNegro);
  textoC1(firma2.cargo || 'Red Dramatiza Salta', f2Cx, 532, 10, font, colNegro);

  // QR + firma electrónica + verificación (igual que el modelo)
  const qrPayload = qrPayloadOverride || construirQrPayload(codigo);
  const qrBytes = await generarQrPng(qrPayload, 260);
  const qrImg = await pdf.embedPng(qrBytes);
  const qrX = 329, qrTop = 415, qrS = 86;
  page1.drawRectangle({ x: qrX - 3, y: topY(PAGE_H, qrTop + qrS) - 3, width: qrS + 6, height: qrS + 6, color: rgb(1, 1, 1) });
  page1.drawImage(qrImg, { x: qrX, y: topY(PAGE_H, qrTop + qrS), width: qrS, height: qrS });
  if (hashFirma) {
    const hashTxt = `Firma electrónica: ${hashFirma.slice(0, 16)}-${hashFirma.slice(16)}`;
    const hs = 4.7;
    const hw = font.widthOfTextAtSize(hashTxt, hs);
    page1.drawText(hashTxt, { x: qrX + qrS / 2 - hw / 2, y: topY(PAGE_H, 516), size: hs, font, color: colNegro });
    const verif = `Verificar: https://dramatiza.vercel.app/verificar.html?c=${codigo}`;
    const vs = 4.7;
    const vw = font.widthOfTextAtSize(verif, vs);
    page1.drawText(verif, { x: qrX + qrS / 2 - vw / 2, y: topY(PAGE_H, 524), size: vs, font, color: colNegro });
  }
  // Código discreto arriba-derecha (dentro del borde)
  {
    const s = 6.5;
    const w = font.widthOfTextAtSize(codigo, s);
    page1.drawText(codigo, { x: PAGE_W - w - 48, y: topY(PAGE_H, 42), size: s, font, color: colSuave });
  }

  // ===== PÁGINA 2: cuadro "Contenido" con el detalle de talleres =====
  const tX0 = 125, tX1 = 717, tTop = 82, tHead = 110, tFoot = 240, tBot = 268;
  page2.drawRectangle({ x: tX0, y: topY(PAGE_H, tBot), width: tX1 - tX0, height: tBot - tTop, borderColor: colLinea, borderWidth: 0.75 });
  for (const yy of [tHead, tFoot, tBot]) {
    page2.drawLine({ start: { x: tX0, y: topY(PAGE_H, yy) }, end: { x: tX1, y: topY(PAGE_H, yy) }, thickness: yy === tHead ? 0.5 : 0.75, color: colLinea });
  }
  textoC2('Contenido', (tX0 + tX1) / 2, 102, 12, fontBold, colNegro);

  // Entradas del contenido según modalidad
  let entradas = [];
  if (tipoNorm === 'asistente') {
    entradas = nombresTalleres.map((n) => `• “${n}”`);
  } else if (tituloUnico) {
    const rotulo = tipoNorm === 'tallerista' || detalle.esTaller === true || String(detalle.tipoPonencia || '').toLowerCase() === 'taller'
      ? 'Taller' : 'Ponencia';
    entradas = [`• ${rotulo}: “${tituloUnico}”`];
    if (nombresTalleres.length > 1) {
      for (const n of nombresTalleres.slice(1)) entradas.push(`• “${n}”`);
    }
  }
  if (!entradas.length) entradas = ['—'];
  const bodyX = 140, bodyW = tX1 - bodyX - 15;
  let tamBody = 11;
  let lineasBody = [];
  while (tamBody >= 8) {
    lineasBody = [];
    for (const e of entradas) {
      lineasBody.push(...dividirTextoEnLineas(e, tamBody > 10 ? fontBold : font, tamBody, bodyW));
    }
    if (lineasBody.length * (tamBody + 4) <= (tFoot - tHead - 16)) break;
    tamBody -= 1;
  }
  {
    const inter = tamBody + 4;
    const totalH = lineasBody.length * inter;
    let yy = tHead + 10 + tamBody + Math.max(0, (tFoot - tHead - 16 - totalH) / 2 - 8);
    const fBody = tamBody > 10 ? fontBold : font;
    for (const l of lineasBody) {
      page2.drawText(l, { x: bodyX, y: topY(PAGE_H, yy), size: tamBody, font: fBody, color: colNegro });
      yy += inter;
      if (yy > tFoot - 4) break;
    }
  }
  // Fila inferior: carga horaria total
  textoC2(`Carga horaria total: ${horasTotal} horas reloj`, (tX0 + tX1) / 2, 261, 11, fontBold, colNegro);
  // Código de verificación al pie de la página 2
  textoC2(`${codigo} · Verificar: https://dramatiza.vercel.app/verificar.html?c=${codigo}`, PAGE_W / 2, 560, 6, font, colSuave);

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function escapeXml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function generarXmlCertificado(opts){
  // Genera XML conforme a src/esquema_cert.xml (certificado data, no SVG visual)
  const { codigo, nombre='', apellido='', tituloHonorifico='', dni='', rol='Asistente', tipoActividad='Taller', tituloActividad='', cargaHoraria='3', fechaEmision=new Date(), firmantes, firmaElectronica='' } = opts;
  const fechaStr = (()=>{ try{ return new Date(fechaEmision).toISOString().slice(0,10);}catch{ return '2026-10-11'; }})();
  const f1 = (firmantes && firmantes[0]) || { nombre:'Mónica E. Yapura', cargo:'Referente Nacional Nodo Salta' };
  const f2 = (firmantes && firmantes[1]) || { nombre:'Romina Ayub', cargo:'Referente Provincial Nodo Salta' };
  const hash = firmaElectronica || '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<certificado xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <encabezado>
        <institucion>Red de Profesores de Teatro</institucion>
        <nodo>Nodo Salta</nodo>
        <evento>
            <nombre>26° Encuentro Nacional de Profesores de Teatro</nombre>
            <edicion>Dramatiza Salta 2026</edicion>
            <lugar><ciudad>Salta</ciudad><provincia>Salta</provincia><pais>Argentina</pais></lugar>
            <fechaInicio>2026-10-09</fechaInicio>
            <fechaFin>2026-10-11</fechaFin>
        </evento>
    </encabezado>
    <participante>
        <nombre>${escapeXml(nombre)}</nombre>
        <apellido>${escapeXml(apellido)}</apellido>
        <tituloHonorifico>${escapeXml(tituloHonorifico)}</tituloHonorifico>
        <documento tipo="DNI"><numero>${escapeXml(dni)}</numero></documento>
        <rol>${escapeXml(rol)}</rol>
    </participante>
    <emision>
        <lugarEmision>Salta</lugarEmision>
        <fechaEmision>${escapeXml(fechaStr)}</fechaEmision>
    </emision>
    <firmantes>
        <firmante id="1"><nombre>${escapeXml(f1.nombre)}</nombre><cargo>${escapeXml(f1.cargo)}</cargo></firmante>
        <firmante id="2"><nombre>${escapeXml(f2.nombre)}</nombre><cargo>${escapeXml(f2.cargo)}</cargo></firmante>
    </firmantes>
    <validacion>
        <codigoCertificado>${escapeXml(codigo)}</codigoCertificado>
        <firmaElectronica>${escapeXml(hash)}</firmaElectronica>
        <estado>Valido</estado>
    </validacion>
</certificado>`;
}

module.exports = {
  generarCodigoCertificado,
  generarHashFirma,
  construirQrPayload,
  generarQrPng,
  generarPdfCertificado,
  generarXmlCertificado,
  resolverFondoCertificado,
  resolverFirmaImagen,
  formatearDniPuntos,
  calcularHorasTotales,
  resolverTalleresDetalle,
};
