require('dotenv').config();

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const acreditacion = require('./acreditacion');
const whatsapp = require('./whatsapp');

const ETIQUETAS_TURNO = { manana: 'Mañana', tarde: 'Tarde' };
const ETIQUETAS_ALIMENTACION = {
  sin_restriccion: 'Sin restricción',
  vegano: 'Vegano',
  sin_tacc: 'Sin TACC',
  sin_lactosa: 'Sin lactosa',
  otro: 'Otro',
};

function smtpConfigurado() {
  return !!(process.env.SMTP_HOST && process.env.SMTP_HOST.trim());
}

let transporter = null;
function obtenerTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      auth:
        process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
      tls: { rejectUnauthorized: false },
    });
  }
  return transporter;
}

function registrarLog(contenido) {
  console.log(`\n[MAIL SIMULADO]\n${contenido}\n[FIN MAIL SIMULADO]\n`);
  try {
    const carpeta = path.join(__dirname, '..', 'logs');
    fs.mkdirSync(carpeta, { recursive: true });
    fs.appendFileSync(
      path.join(carpeta, 'emails.log'),
      `\n--- ${new Date().toISOString()} ---\n${contenido}\n`
    );
  } catch (e) {
    /* noop */
  }
}

function escaparHtml(texto) {
  return String(texto || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function imagenDataUrl(ruta, mime) {
  const base64 = acreditacion.base64DeArchivo(ruta);
  return base64 ? `data:${mime};base64,${base64}` : null;
}

function construirMensajeInscripcion({ nombre, apellido, email, telefono, alimentacion, talleres }) {
  const lineas = [];
  lineas.push(`Hola ${nombre} ${apellido}!`);
  lineas.push('Tu inscripción al encuentro fue registrada. Este es el detalle de los talleres:');
  lineas.push('');
  for (const t of talleres) {
    lineas.push(`• ${t.nombre} (Turno ${ETIQUETAS_TURNO[t.turno] || t.turno})`);
    lineas.push(`  Duración: ${t.duracion_hs === 6 ? '6 horas (se realiza en 2 días consecutivos)' : '3 horas (se realiza en un solo día)'}`);
    if (t.descripcion) lineas.push(`  Descripción: ${t.descripcion}`);
  }
  lineas.push('');
  lineas.push(`Tipo de alimentación registrado: ${ETIQUETAS_ALIMENTACION[alimentacion] || alimentacion}.`);
  if (telefono) lineas.push(`Teléfono de contacto: ${telefono}.`);
  lineas.push('');
  lineas.push('¡Nos vemos en el encuentro!');
  return lineas.join('\n');
}

function construirHtml({ datos, talleres, qrDataUrl, modoCid = false }) {
  const logo = acreditacion.resolverImagen('ENCUENTRO_LOGO_IMG', 'public/logo.png');
  const personaje = acreditacion.resolverImagen('ENCUENTRO_PERSONAJE_IMG', 'public/personaje.png');

  const logoSrc = modoCid ? 'cid:logo@inscripciones'
    : (logo ? imagenDataUrl(logo, acreditacion.tipoMime(logo)) : null);
  const personajeSrc = modoCid ? 'cid:personaje@inscripciones'
    : (personaje ? imagenDataUrl(personaje, acreditacion.tipoMime(personaje)) : null);
  const qrSrc = modoCid ? 'cid:qr@inscripciones' : qrDataUrl;

  const sesionesHtml = (datos.sesiones || [])
    .map((s) => {
      const turno = ETIQUETAS_TURNO[s.turno] || s.turno;
      const lineas = [
        `<li><strong>${escaparHtml(s.taller)}</strong> (Turno ${escaparHtml(turno)})`,
      ];
      if (s.fecha) lineas.push(`<br>Fecha: ${escaparHtml(s.fecha)}`);
      if (s.hora) lineas.push(` &middot; Hora: ${escaparHtml(s.hora)}`);
      if (s.lugar) lineas.push(` &middot; Lugar: ${escaparHtml(s.lugar)}`);
      lineas.push('</li>');
      return lineas.join('');
    })
    .join('');

  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:20px 24px;text-align:center;">
              ${logoSrc ? `<img src="${logoSrc}" alt="Logo" style="max-height:56px;background:#fff;border-radius:8px;padding:4px;">` : ''}
              ${personajeSrc ? `<img src="${personajeSrc}" alt="Personaje" style="max-height:64px;margin-left:12px;">` : ''}
            </td>
          </tr>
          <tr>
            <td style="padding:24px;">
              <h2 style="margin:0 0 12px;color:#4338ca;">Acreditación al Encuentro</h2>
              <p style="margin:0 0 8px;"><strong>${escaparHtml(datos.nombre)} ${escaparHtml(datos.apellido)}</strong></p>
              <p style="margin:0 0 8px;">DNI: <strong>${escaparHtml(datos.dni)}</strong></p>
              <p style="margin:0 0 16px;color:#64748b;">Código único: <strong>${escaparHtml(datos.id)}</strong></p>

              <p style="margin:0 0 6px;font-weight:bold;color:#4338ca;">Tus talleres:</p>
              <ul style="margin:0 0 20px;padding-left:18px;">${sesionesHtml || '<li>Sin talleres</li>'}</ul>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center;">
                <tr><td align="center">
                  ${qrSrc ? `<img src="${qrSrc}" alt="Código QR" width="300" height="300" style="width:300px;height:300px;">` : ''}
                  <p style="margin:10px 0 0;font-size:13px;color:#64748b;">Mostrá este código QR al ingresar para confirmar tu asistencia.</p>
                </td></tr>
              </table>

              <p style="margin:20px 0 0;font-size:14px;color:#334155;">También te adjuntamos tu acreditación en PDF. ¡Nos vemos en el encuentro!</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function notificarInscripcion(datos) {
  const texto = construirMensajeInscripcion(datos);
  const qrPayload = datos.qrPayload || '';
  const qrCode = datos.qrCode || '';

  let qrDataUrl = null;
  let pngBuffer = null;
  let rutaPng = null;
  let rutaPdf = null;
  let rutaHtml = null;

  try {
    if (qrPayload) {
      const carpeta = acreditacion.carpetaEntradas();
      const nombreBase = qrCode || `acreditacion-${Date.now()}`;
      rutaPng = path.join(carpeta, `${nombreBase}.png`);
      rutaPdf = path.join(carpeta, `${nombreBase}.pdf`);
      rutaHtml = path.join(carpeta, `${nombreBase}.html`);

      const png = await acreditacion.generarPng(qrPayload, { size: 512 });
      pngBuffer = png;
      fs.writeFileSync(rutaPng, png);
      qrDataUrl = `data:image/png;base64,${png.toString('base64')}`;

      const pdf = await acreditacion.generarPdf(qrPayload);
      fs.writeFileSync(rutaPdf, pdf);

      const datos = acreditacion.parsearPayload(qrPayload);
      fs.writeFileSync(rutaHtml, construirHtml({ datos, talleres: datos.sesiones || [], qrDataUrl }));
    }
  } catch (e) {
    console.error('[Mail] Error al generar QR/PDF:', e.message);
  }

  let salida = `Para: ${datos.email || '—'}\nAsunto: Confirmación de inscripción\n\n${texto}`;
  salida += `\n\n--- ACREDITACIÓN ---`;
  salida += `\nCódigo único: ${qrCode || '—'}`;
  salida += `\nQR (300x300+): ${qrDataUrl ? 'sí (incluido en el cuerpo del mensaje)' : 'no generado'}`;
  salida += `\nPDF adjunto: ${rutaPdf || 'no generado'}`;
  if (rutaPng) salida += `\nPNG QR: ${rutaPng}`;
  if (rutaHtml) salida += `\nVista HTML del cuerpo: ${rutaHtml}`;

  if (smtpConfigurado()) {
    try {
      const datosPayload = acreditacion.parsearPayload(qrPayload) || {};
      const attachments = [];
      if (rutaPdf && fs.existsSync(rutaPdf)) {
        attachments.push({ filename: `${qrCode || 'acreditacion'}.pdf`, path: rutaPdf });
      }
      const logo = acreditacion.resolverImagen('ENCUENTRO_LOGO_IMG', 'public/logo.png');
      if (logo) attachments.push({ filename: path.basename(logo), path: logo, cid: 'logo@inscripciones' });
      const personaje = acreditacion.resolverImagen('ENCUENTRO_PERSONAJE_IMG', 'public/personaje.png');
      if (personaje) attachments.push({ filename: path.basename(personaje), path: personaje, cid: 'personaje@inscripciones' });
      if (pngBuffer) attachments.push({ filename: `${qrCode || 'acreditacion'}.png`, content: pngBuffer, cid: 'qr@inscripciones' });

      const htmlCid = construirHtml({
        datos: datosPayload,
        talleres: datosPayload.sesiones || [],
        qrDataUrl: null,
        modoCid: true,
      });

      const opciones = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'inscripciones@localhost',
        to: datos.email,
        subject: 'Confirmación de inscripción',
        text: texto,
        html: htmlCid,
        attachments,
      };
      const info = await obtenerTransporter().sendMail(opciones);
      salida += `\n\nEnviado por SMTP: ${info.messageId}`;
      salida += `\nImágenes en el cuerpo: logo ${logo ? 'sí' : 'no'}, personaje ${personaje ? 'sí' : 'no'}, QR ${pngBuffer ? 'sí' : 'no'}`;
      console.log(`[Mail] Email enviado a ${datos.email} (${info.messageId})`);
      try {
        const carpeta = path.join(__dirname, '..', 'logs');
        fs.appendFileSync(
          path.join(carpeta, 'emails.log'),
          `\n--- ${new Date().toISOString()} ---\n${salida}\n`
        );
      } catch (e) {
        /* noop */
      }
    } catch (e) {
      console.error('[Mail] Error al enviar por SMTP:', e.message);
      salida += `\n\nERROR SMTP: ${e.message}`;
      registrarLog(salida);
    }
  } else {
    registrarLog(salida);
  }

  if (datos.telefono) {
    await whatsapp.enviarWhatsApp(datos.telefono, texto);
  }

  return { rutaPng, rutaPdf, rutaHtml, qrCode };
}

module.exports = {
  notificarInscripcion,
  construirMensajeInscripcion,
  construirHtml,
  ETIQUETAS_ALIMENTACION,
};
