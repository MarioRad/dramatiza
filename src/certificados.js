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
  // Suma en MINUTOS: talleres + ponencias + conversatorios (para todos)
  let totalMin = 0;
  const minsDe = (it, fallbackMin) => {
    if (it.minutos != null && Number(it.minutos) > 0) return Number(it.minutos);
    const h = Number(it.horas || it.duracion || 0);
    if (h > 0) return h * 60;
    return fallbackMin;
  };
  const talleres = Array.isArray(detalle.talleres) ? detalle.talleres : [];
  for (const t of talleres) totalMin += minsDe(t, porTaller * 60);
  const ponencias = Array.isArray(detalle.ponencias) ? detalle.ponencias : [];
  for (const p of ponencias) totalMin += minsDe(p, 15);
  const convs = Array.isArray(detalle.conversatorios) ? detalle.conversatorios : [];
  for (const c of convs) totalMin += minsDe(c, 60);
  if (totalMin === 0) {
    const n = talleres.length || 1;
    return String(tipo || '').toLowerCase() === 'asistente' ? n * porTaller : porTaller;
  }
  // Devuelve horas (puede ser fraccional, ej: 12.5)
  return Math.round((totalMin / 60) * 100) / 100;
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

  function fondoDraw(pagina, archivo) {
    const fp = path.join(__dirname, '..', 'public', 'certifica', archivo);
    return (async () => {
      if (fs.existsSync(fp)) {
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
  await fondoDraw(page1, 'pag1.png');
  await fondoDraw(page2, 'pag2.png');

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
  // Datos de talleres con horas (para la tabla de la hoja 2)
  const porTaller = parseInt(detalle.horas, 10) || 3;
  const talleresDetalle = Array.isArray(detalle.talleres) ? detalle.talleres : [];

  // ===== PÁGINA 1 =====
  // Logo, título "Certificado", avales, declaraciones de interés y firmas
  // ya vienen impresos en pag1.png. Solo se dibuja el cuerpo de texto y el QR.

  // Cuerpo principal (redacción del leyenda.txt, con datos reales)
  // Anchos del modelo: líneas 1-2 hasta x=773; líneas 3-4 hasta x~623 (zona de la mascota)
  const cuerpoSize = 15.5;
  const cuerpoX = 83;
  //const cuerpoWFull = 690; // 83 -> 773
  const cuerpoWFull = 560; // 83 -> 773
  const cuerpoWcorto = 540; // 83 -> 623 (evita la mascota)
  const segLinea1 = [
    { t: 'Se certifica que' },
    { t: apellidoNombre, bold: true },
    { t: ', DNI N°: ' },
    { t: dniFmt, bold: true },
    { t: ', ha participado en calidad de' },
    { t: calidad, bold: true },
    { t: ' en el' },
    { t: ' “XXVI Encuentro Nacional de Profesores de Teatro - Dramatiza 2026”', bold: true },
    { t: ', bajo el lema:' },
    { t: ' “Ser Teatro”', bold: true },
    { t: ', realizado en la ciudad de Salta capital los días 9,10 y 11 ' },
    { t: 'de octubre de 2026.'},
    { t: 'De '},
    { t: 'modalidad presencial.', bold: true},
  ];
  const segLinea2 = [
    { t: 'Con una carga horaria total de ' },
    { t: String(horasTotal), bold: true },
    { t: ' horas reloj.-' },
  ];
  const segLinea3 = [
    
  ];
  const segLinea4 = [
    
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
  // const yExtiende = Math.max(340, yCuerpo + 8);
  // textoC1('Se extiende el presente en la ciudad de Salta', 385, yExtiende, 16, font, colNegro);
  // textoC1('a los once días del mes de octubre del año dos mil veintiseis.-', 385, yExtiende + 20, 16, font, colNegro);

  // Firmas, avales y declaraciones ya vienen impresos en pag1.png.

  // QR dentro del recuadro de la esquina superior derecha de pag1.png
  const qrPayload = qrPayloadOverride || construirQrPayload(codigo);
  const qrBytes = await generarQrPng(qrPayload, 260);
  const qrImg = await pdf.embedPng(qrBytes);
  {
    const sx = PAGE_W / 1124, sy = PAGE_H / 796;
    const bx0 = 913 * sx, bx1 = 1068 * sx;
    const by0 = 84 * sy, by1 = 202 * sy;
    const qrS = Math.min(bx1 - bx0, by1 - by0) - 10;
    const qrX = (bx0 + bx1) / 2 - qrS / 2;
    const qrY = (by0 + by1) / 2 - qrS / 2;
    page1.drawImage(qrImg, { x: qrX, y: PAGE_H - qrY - qrS, width: qrS, height: qrS });
  }
  // Firma electrónica discreta bajo el QR
  if (hashFirma) {
    const hashTxt = `Firma: ${hashFirma.slice(0, 16)}-${hashFirma.slice(16)}`;
    const hs = 5;
    const hw = font.widthOfTextAtSize(hashTxt, hs);
    const cx = PAGE_W - 842 * (1 - 990 / 1124);
    page1.drawText(hashTxt, { x: cx - hw / 2, y: topY(PAGE_H, 160), size: hs, font, color: colSuave });
    const verif = `Verificar: https://dramatiza.vercel.app/verificar.html?c=${codigo}`;
    const vs = 5;
    const vw = font.widthOfTextAtSize(verif, vs);
    page1.drawText(verif, { x: cx - vw / 2, y: topY(PAGE_H, 168), size: vs, font, color: colSuave });
  }

  // ===== PÁGINA 2: contenido dentro del recuadro de pag2.png =====
  // Recuadro en imagen (1124x796): x=166..847, y=85..546 → PDF x≈124..635, topY≈64..410
  // Separador encabezado y=140 → topY 105; separador pie y=498 → topY 373

  // Formato de horas: si es < 1 hs mostrar minutos
  const fmtHoras = (h) => {
    const n = Number(h) || 0;
    if (n <= 0) return '';
    if (n < 1) return `(${Math.round(n * 60)} min)`;
    return `(${n} hs)`;
  };

  // Valores junto a las etiquetas impresas en pag2.png ("Apellido y Nombre:" / "Código:")
  page2.drawText(apellidoNombre, {
    x: 142, y: topY(PAGE_H, 458), size: 10.5, font: fontBold, color: colSuave,
  });
  page2.drawText(codigo, {
    x: 78, y: topY(PAGE_H, 485), size: 10.5, font: fontBold, color: colSuave,
  });

  // Contenido del recuadro: secciones con formato "Título. (X hs)" según leyenda
  const colIzq = 138;    // margen izquierdo dentro del recuadro
  const colHorasX = 575; // columna de horas dentro del recuadro
  const filaH = 14;
  let yCont = 118; // top-down: justo debajo del separador del encabezado (topY 105)

  function drawLinea(txt, bold, x, y, size, color) {
    page2.drawText(txt, { x, y: topY(PAGE_H, y), size, font: bold ? fontBold : font, color: color || colNegro });
  }

  function drawSeccion(titulo, items) {
    drawLinea(titulo, true, colIzq, yCont, 10, colNegro);
    yCont += filaH;
    for (const it of items) {
      const lineas = dividirTextoEnLineas(it.nombre, font, 8.5, colHorasX - colIzq - 10 - 55);
      for (let i = 0; i < lineas.length; i++) {
        drawLinea(lineas[i], false, colIzq + 10, yCont, 8.5, colNegro);
        if (i === lineas.length - 1) {
          const hTxt = fmtHoras(it.horas);
          if (hTxt) drawLinea(hTxt, true, colHorasX, yCont, 8.5, colNegro);
        }
        yCont += filaH - 1;
      }
    }
    yCont += 3;
  }

  const talleresSeccion = talleresDetalle.map((t) => ({
    nombre: String(t.nombre || t.taller || '').trim(),
    horas: Number(t.horas || t.duracion_hs || porTaller) || porTaller,
  })).filter((t) => t.nombre);
  // Ponencias/conversatorios pueden traer minutos en lugar de horas
  const minutosAHoras = (o) => {
    if (Number(o.horas)) return Number(o.horas);
    if (Number(o.duracion)) return Number(o.duracion);
    if (Number(o.minutos)) return Number(o.minutos) / 60;
    return 0;
  };
  const ponenciasSeccion = (Array.isArray(detalle.ponencias) ? detalle.ponencias : []).map((p) => ({
    nombre: String(p.titulo || p.nombre || '').trim(),
    horas: minutosAHoras(p),
  })).filter((p) => p.nombre);
  const convsSeccion = (Array.isArray(detalle.conversatorios) ? detalle.conversatorios : []).map((c) => ({
    nombre: String(c.titulo || c.nombre || '').trim(),
    horas: minutosAHoras(c),
  })).filter((c) => c.nombre);

  drawSeccion('Ponencias', ponenciasSeccion);
  drawSeccion('Conversatorio', convsSeccion);
  // Tallerista: figura el taller que dictó bajo el título "Taller Dictado"
  drawSeccion(detalle.tallerDictado ? 'Taller Dictado' : 'Talleres Optativos (según inscripción)', talleresSeccion);
  

  // Total en el pie del recuadro (zona topY 373..410)
  const totalTxt = `TOTAL HORAS RELOJ: ${horasTotal >= 1 ? `(${horasTotal} hs)` : `(${Math.round(horasTotal * 60)} min)`}`;
  drawLinea(totalTxt, true, colIzq, 392, 10.5, colNegro);

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
