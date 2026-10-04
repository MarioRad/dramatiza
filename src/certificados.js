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

// Helper para convertir coordenadas SVG (origen arriba-izquierda) a PDF (abajo-izquierda)
function svgY(pageH, y) { return pageH - y; }

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

  // Dimensiones tomadas de esquema_cert.xml viewBox 1024x731
  const PAGE_W = 1024;
  const PAGE_H = 731;
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([PAGE_W, PAGE_H]);

  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const colNegro = rgb(0x11/255, 0x11/255, 0x11/255);
  const colSuave = rgb(0.35,0.35,0.35);

  // Fondo (un modelo por tipo: asistente o ponente/tallerista)
  const fondoPath = resolverFondoCertificado(tipo);
  if (fondoPath) {
    try {
      const bytes = fs.readFileSync(fondoPath);
      const isJpg = /\.jpe?g$/i.test(fondoPath);
      const img = isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
      page.drawImage(img, { x: 0, y: 0, width: PAGE_W, height: PAGE_H });
    } catch (e) { console.warn('[certificados] fondo error', e.message); }
  } else {
    page.drawRectangle({ x:0,y:0,width:PAGE_W,height:PAGE_H, color: rgb(0.98,0.97,0.94)});
  }

  // Util para texto centrado en x
  function textoCentrado(texto, xCenter, ySvg, size, f, color) {
    const w = f.widthOfTextAtSize(texto, size);
    page.drawText(texto, { x: xCenter - w/2, y: svgY(PAGE_H, ySvg), size, font: f, color });
  }

  // ====== TEXTOS PRINCIPALES (del esquema xml actualizado) ======
  // titulo bajado 0,5 cm (14 pt) -> y 62 -> 76
  textoCentrado('26° Encuentro Nacional de Profesores de Teatro Dramatiza Salta 2026', 512, 76, 28, fontBold, colNegro);
  // subtitulo (modificado en esquema_cert.xml)
  textoCentrado('El Nodo Salta, perteneciente a la Red de Profesores de Teatro hace constar que', 512, 95, 20, font, colNegro);

  // NOMBRE (no estaba en xml, lo insertamos entre subtitulo y DNI para que destaque)
  const nombreCompleto = `${nombre} ${apellido}`.trim() || '—';
  // Ajuste dinámico de tamaño si nombre es muy largo
  let nombreSize = 32;
  if (nombreCompleto.length > 26) nombreSize = 26;
  if (nombreCompleto.length > 36) nombreSize = 22;
  textoCentrado(nombreCompleto, 512, 145, nombreSize, fontBold, colNegro);

  // DNI
  const dniTexto = dni ? `D.N.I. ${dni}` : 'D.N.I. ';
  textoCentrado(dniTexto, 512, 185, 22, fontBold, colNegro);

  // Participación según tipo (esquema 2026-05 actualizado: "PARTICIPÓ en calidad de x" sin "del")
  let participacionTexto = 'PARTICIPÓ en calidad de ASISTENTE en';
  if (tipo === 'ponente') participacionTexto = 'PARTICIPÓ en calidad de PONENTE presentando';
  else if (tipo === 'tallerista') participacionTexto = 'PARTICIPÓ en calidad de TALLERISTA, presentando';
  textoCentrado(participacionTexto, 512, 235, 24, fontBold, colNegro);

  // Taller(es) base para evento y zona dinámica
  const talleres = detalle.talleres && detalle.talleres.length ? detalle.talleres : (detalle.titulo ? [{ nombre: detalle.titulo, taller: detalle.titulo }] : []);
  const nombresTalleres = talleres.map(t=> t.nombre || t.taller).filter(Boolean);

  // Detalle textual según tipo (requisito actualizado): ponente -> "presentando la ponencia", taller -> "presentando el taller", asistente -> "participando de los talleres"
  // Diferenciación automática taller/ponencia según detalle asociado a la persona
  const esTaller = detalle.esTaller === true || String(detalle.tipoPonencia || '').toLowerCase() === 'taller' || tipo === 'tallerista';
  let eventoTexto = '';
  if (tipo === 'ponente' || tipo === 'tallerista') {
    const t = detalle.titulo || nombresTalleres[0] || '—';
    if (esTaller) eventoTexto = ` "${t}"`;
    else eventoTexto = ` "${t}"`;
  } else { // asistente
    eventoTexto = 'participando de los talleres';
  }
  const eventoLineas = dividirTextoEnLineas(eventoTexto, fontBold, 18, 700);
  let yEvento = 273;
  for (const l of eventoLineas.slice(0,2)) { textoCentrado(l, 512, yEvento, 18, fontBold, colNegro); yEvento += 20; }

  // Zona dinámica para listar talleres de asistentes (ponente/tallerista ya mostrado en eventoTexto)
  let yTallerSvg = 315;
  const maxWidthTalleres = 720;
  if (tipo === 'asistente') {
    if (nombresTalleres.length === 0) {
      textoCentrado('—', 512, yTallerSvg, 15, font, colNegro);
      yTallerSvg += 18;
    } else {
      // listar todos los talleres del asistente
      let y = yTallerSvg;
      for (const n of nombresTalleres) {
        const lineas = dividirTextoEnLineas(`• "${n}"`, fontBold, 14, maxWidthTalleres);
        for (const linea of lineas) {
          textoCentrado(linea, 512, y, 14, fontBold, colNegro);
          y += 15;
        }
      }
      yTallerSvg = y;
    }
  } else {
    // ponente/tallerista: ya mostrado en evento, no duplicar lista
    yTallerSvg = yEvento + 5;
  }

  // Realizado y duración - ajustar y según cuánto ocupó la lista de talleres
  // Original esquema: realizado 358, duracion 391. Si talleres ocupó mucho, desplazamos levemente
  // Calculamos desplazamiento: si yTallerSvg > 350, mover ambos hacia abajo
  let offset = 0;
  if (yTallerSvg > 350) offset = yTallerSvg - 350;
  const yRealizado = 358 + offset;
  // Asegurar no bajar demasiado (máx 420, sino quedaría encima de logo)
  const yRealizadoClamped = Math.min(yRealizado, 400);
  const yDuracionClamped = yRealizadoClamped + 33;

  textoCentrado('Realizado en la ciudad de Salta, los días 9,10 y 11 de octubre', 512, yRealizadoClamped, 20, font, colNegro);
  // Emitido por Dramatiza Nodo Salta (siempre)
  const emitidoY = yDuracionClamped + 20;
  //if (emitidoY < 420) textoCentrado('Emitido por Dramatiza Nodo Salta', 512, emitidoY, 11, fontBold, colNegro);

  // ====== IMÁGENES ESQUEMA ======
  // Personaje eliminado del esquema_cert.xml actual (no se renderiza)

  // Logo Red - usa logo_borde_black.png, centrado y manteniendo proporciones, bajado 4cm (≈113pt)
  try {
    const logoPath = (() => {
      const p1 = path.join(__dirname, '..', 'public', 'logo_borde_black.png');
      if (fs.existsSync(p1)) return p1;
      return path.join(__dirname, '..', 'public', 'logo.png');
    })();
    if (fs.existsSync(logoPath)) {
      const bytes = fs.readFileSync(logoPath);
      const img = await pdf.embedPng(bytes);
      // centrado geométrico bajado 4cm (113pt): 365.5+113=478.5
      const boxCx = PAGE_W / 2; // 512
      const boxCy = PAGE_H / 2 + 113; // 478.5
      const maxW = 220, maxH = 110;
      const dims = img.scale(1);
      const scale = Math.min(maxW / dims.width, maxH / dims.height, 1);
      const w = dims.width * scale;
      const h = dims.height * scale;
      const x = boxCx - w/2;
      const yTopSvg = boxCy + h/2;
      const y = svgY(PAGE_H, yTopSvg);
      page.drawImage(img, { x, y, width: w, height: h});
    }
  } catch (_) {}

  // QR 668,432 86x86
  const qrPayload = qrPayloadOverride || construirQrPayload(codigo);
  const qrBytes = await generarQrPng(qrPayload, 260);
  const qrImg = await pdf.embedPng(qrBytes);
  const qrX = 668, qrYSvg = 432, qrW = 86, qrH = 86;
  // Dibujar fondo blanco detrás del QR para legibilidad
  page.drawRectangle({ x: qrX - 2, y: svgY(PAGE_H, qrYSvg + qrH) - 2, width: qrW + 4, height: qrH + 4, color: rgb(1,1,1) });
  page.drawImage(qrImg, { x: qrX, y: svgY(PAGE_H, qrYSvg + qrH), width: qrW, height: qrH });

  // Avales Box - declaraciones de interés / resoluciones (textos largos).
  // Se envuelven dentro del recuadro, la letra se achica hasta entrar y el
  // recuadro crece en alto según haga falta (sin invadir las firmas).
  const avalesTextosRaw = Array.isArray(avales) && avales.length
    ? avales.map((v) => String(v || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  if (avalesTextosRaw.length > 0) {
    const avalesX = 63, avalesYSvg = 432, avalesW = 273;
    const avalesCx = avalesX + avalesW / 2;
    const padX = 10, padY = 8;
    const maxAnchoTexto = avalesW - padX * 2;
    const maxAlto = 113; // hasta ySvg 545, antes de las firmas
    let tam = 10;
    let lineas = [];
    while (tam >= 7) {
      lineas = [];
      for (const t of avalesTextosRaw) {
        lineas.push(...dividirTextoEnLineas(t, font, tam, maxAnchoTexto));
        lineas.push(''); // separador entre avales
      }
      if (lineas.length && lineas[lineas.length - 1] === '') lineas.pop();
      if (lineas.length * (tam + 3) + padY * 2 <= maxAlto) break;
      tam -= 0.5;
    }
    const interlineado = tam + 3;
    const altoCaja = Math.min(maxAlto, lineas.length * interlineado + padY * 2);
    const avalesY = svgY(PAGE_H, avalesYSvg + altoCaja);
    page.drawRectangle({ x: avalesX, y: avalesY, width: avalesW, height: altoCaja, color: rgb(1,1,1), borderColor: colNegro, borderWidth: 1.8, opacity: 0.95 });
    let aySvg = avalesYSvg + padY + tam;
    for (const l of lineas) {
      if (l) textoCentrado(l, avalesCx, aySvg, tam, font, colNegro);
      aySvg += interlineado;
    }
  }

  // ====== FIRMAS (dos firmas gráfica + electrónica) ======
  // Firmas gráficas por encima de los pies (pies están en y 630)
  // Firma1 cerca de pie izquierdo (x220), Firma2 cerca de pie derecho (x800)
  const firmaAncho = 180;
  const firmaAlto = 56;
  const firma1Cx = 220;
  const firma2Cx = 800;
  const firmaYSvg = 560; // top de imagen firma

  async function drawFirma(firma, centerX) {
    const imgPath = firma.imagenPath || resolverFirmaImagen(firma.num);
    if (imgPath && fs.existsSync(imgPath)) {
      try {
        const bytes = fs.readFileSync(imgPath);
        const isJpg = /\.jpe?g$/i.test(imgPath);
        const img = isJpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
        const dims = img.scale(1);
        const ratio = Math.min(1, firmaAncho / dims.width, firmaAlto / dims.height);
        const w = dims.width * ratio;
        const h = dims.height * ratio;
        const x = centerX - w/2;
        const y = svgY(PAGE_H, firmaYSvg + h);
        page.drawImage(img, { x, y, width: w, height: h });
      } catch (_) {}
    }
  }
  await drawFirma({ ...firma1, num: 1 }, firma1Cx);
  await drawFirma({ ...firma2, num: 2 }, firma2Cx);

  // Pie Izquierdo 220,630 (actualizado: Nodo Salta)
  const pieY1Svg = 630;
  const pieY2Svg = 645;
  textoCentrado(firma1.nombre || 'Referente Nacional Nodo Salta', 220, pieY1Svg, 12, font, colNegro);
  textoCentrado(firma1.cargo || 'Red Dramatiza Salta', 220, pieY2Svg, 12, font, colNegro);
  // Pie Derecho 800,630 (actualizado: Nodo Salta)
  textoCentrado(firma2.nombre || 'Referente Provincial Nodo Salta', 800, pieY1Svg, 12, font, colNegro);
  textoCentrado(firma2.cargo || 'Red Dramatiza Salta', 800, pieY2Svg, 12, font, colNegro);

  // Línea de firma (opcional fina sobre el texto)
  page.drawLine({ start:{ x: firma1Cx - 90, y: svgY(PAGE_H, pieY1Svg - 10)}, end:{ x: firma1Cx + 90, y: svgY(PAGE_H, pieY1Svg - 10)}, thickness: 0.8, color: colNegro });
  page.drawLine({ start:{ x: firma2Cx - 90, y: svgY(PAGE_H, pieY1Svg - 10)}, end:{ x: firma2Cx + 90, y: svgY(PAGE_H, pieY1Svg - 10)}, thickness: 0.8, color: colNegro });

  // ====== CODIGO + FIRMA ELECTRÓNICA + QR verificación ======
  // Código pequeño arriba derecha (sobre el borde) y firma electrónica bajo QR
  const codigoSize = 8;
  const codigoTexto = codigo;
  const codigoW = font.widthOfTextAtSize(codigoTexto, codigoSize);
  page.drawText(codigoTexto, { x: PAGE_W - codigoW - 14, y: svgY(PAGE_H, 18), size: codigoSize, font, color: colSuave });

  if (hashFirma) {
    // bajo el QR centrado
    const hashTexto = `Firma electrónica: ${hashFirma.slice(0,16)}-${hashFirma.slice(16)}`;
    const hs = 6;
    const hw = font.widthOfTextAtSize(hashTexto, hs);
    const hx = qrX + qrW/2 - hw/2;
    const hy = svgY(PAGE_H, qrYSvg + qrH + 14);
    page.drawText(hashTexto, { x: hx, y: hy, size: hs, font, color: colSuave });
    // pequeño "Verificar en https://dramatiza.vercel.app/verificar.html?c=CODIGO" debajo (temporal)
    const verif = `Verificar: https://dramatiza.vercel.app/verificar.html?c=${codigo}`;
    const vs = 5;
    const vw = font.widthOfTextAtSize(verif, vs);
    page.drawText(verif, { x: qrX + qrW/2 - vw/2, y: hy - 9, size: vs, font, color: colSuave });
  }

  // Fecha de emisión pequeña abajo centro (opcional)
  const fechaTxt = formatearFechaLarga(emitidoEn);
  textoCentrado(fechaTxt, 512, 720, 7, font, colSuave);

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
};
