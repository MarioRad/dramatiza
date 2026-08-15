require('dotenv').config();

const path = require('path');

const HABILITADO = String(process.env.WHATSAPP_ENABLED || '').trim().toLowerCase() === 'true';

let sock = null;
let conectando = null;

function normalizarNumero(numero) {
  const digitos = String(numero || '').replace(/\D/g, '');
  if (digitos.length < 8 || digitos.length > 15) return null;
  const prefijo = String(process.env.WHATSAPP_PREFIX || '').replace(/\D/g, '');
  if (prefijo && !digitos.startsWith(prefijo)) return prefijo + digitos;
  return digitos;
}

async function iniciar() {
  if (!HABILITADO || sock || conectando) return;
  conectando = (async () => {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
    const carpetaSesion = path.join(__dirname, '..', '.whatsapp-session');
    const { state, saveCreds } = await useMultiFileAuthState(carpetaSesion);
    const instancia = makeWASocket({
      auth: state,
      printQRInTerminal: true,
      syncFullHistory: false,
    });
    sock = instancia;
    instancia.ev.on('creds.update', saveCreds);
    instancia.ev.on('connection.update', (actualizacion) => {
      if (actualizacion.qr) {
        console.log('[WhatsApp] Escaneá el código QR en la consola para vincular el número.');
      }
      if (actualizacion.connection === 'open') {
        console.log('[WhatsApp] Número vinculado y conectado.');
      }
      if (actualizacion.lastDisconnect && actualizacion.lastDisconnect.error) {
        const motivo = actualizacion.lastDisconnect.error?.output?.statusCode;
        if (motivo === DisconnectReason.loggedOut) {
          console.error('[WhatsApp] La sesión se cerró. Eliminá la carpeta .whatsapp-session y reiniciá para volver a vincular.');
        }
      }
    });
  })();
  try {
    await conectando;
  } catch (e) {
    console.error('[WhatsApp] No se pudo iniciar la conexión:', e.message);
  } finally {
    conectando = null;
  }
}

async function enviarWhatsApp(numero, texto) {
  if (!sock || !HABILITADO) return false;
  const destino = normalizarNumero(numero);
  if (!destino) return false;
  try {
    await sock.sendMessage(`${destino}@s.whatsapp.net`, { text: texto });
    console.log(`[WhatsApp] Mensaje enviado a ${destino}.`);
    return true;
  } catch (e) {
    console.error('[WhatsApp] Error al enviar mensaje:', e.message);
    return false;
  }
}

module.exports = { iniciar, enviarWhatsApp, normalizarNumero, habilitado: HABILITADO };
