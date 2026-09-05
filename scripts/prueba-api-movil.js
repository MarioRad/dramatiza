/* Prueba de integración de los endpoints /api/mobile/* con db simulado. */
process.env.PORT = '3577';
process.env.WHATSAPP_ENABLED = 'false';

const path = require('path');
const Module = require('module');

// ── Mock del módulo db antes de cargar server.js ──────────────────────
const inscripciones = {
  '26555444': {
    dni: '26555444',
    nombre: 'María',
    apellido: 'González',
    email: 'maria@example.com',
    qr_code: 'ENC-A1B2C3D4E5',
  },
};

let servicioActivo = null;
const logAcreditaciones = [];
const comidasRegistradas = [];

const dbMock = {
  HttpError: class HttpError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
  async init() {},
  async hayUsuarios() {
    return true;
  },
  async buscarUsuario(username) {
    if (username !== 'operador') return null;
    // hash de "secreto": scrypt con salt fijo
    const crypto = require('crypto');
    const salt = 'ab12cd34ef56ab12cd34ef56ab12cd34';
    const hash = crypto.scryptSync('secreto', salt, 64).toString('hex');
    return { username, password_hash: `${salt}:${hash}`, nombre: 'Operador Prueba', rol: 'operador', activo: 1, perm_acreditacion: 1 };
  },
  async queryOne(sql, params) {
    if (sql.includes('qr_code = ?')) {
      const fila = Object.values(inscripciones).find((i) => i.qr_code === params[0]);
      return fila ? { ...fila } : null;
    }
    return null;
  },
  async buscarAcreditacionPorDni(dni) {
    return inscripciones[dni] ? { ...inscripciones[dni] } : null;
  },
  async listarInscripcionesPorDni(dni) {
    if (!inscripciones[dni]) return [];
    return [
      { taller: 'Gaga Teatral', fecha: '2026-10-09', hora: '15:00', lugar: 'Sala A' },
      { taller: 'Musicoterapia comunicativa', fecha: '2026-10-10', hora: '15:30', lugar: 'Sala B' },
    ];
  },
  async registrarEvento() {},
  async registrarAcreditacion(datos) {
    logAcreditaciones.push(datos);
  },
  async contarAcreditados() {
    return new Set(logAcreditaciones.map((a) => a.dni)).size;
  },
  async contarAsistentesUnicos() {
    return Object.keys(inscripciones).length;
  },
  async listarAcreditacionesPorTaller() {
    const acreditados = new Set(logAcreditaciones.map((a) => a.dni));
    return [
      { taller_id: 1, taller: 'Gaga Teatral', fecha: '2026-10-09', hora: '15:00', inscriptos: 1, acreditados: acreditados.has('26555444') ? 1 : 0 },
      { taller_id: 2, taller: 'Musicoterapia comunicativa', fecha: '2026-10-10', hora: '15:30', inscriptos: 1, acreditados: acreditados.has('26555444') ? 1 : 0 },
    ];
  },
  async obtenerServicioComidaActivo() {
    return servicioActivo;
  },
  async tieneAsistenciaComida(dni, bloqueId) {
    return comidasRegistradas.some((c) => c.dni === dni && c.bloqueId === bloqueId);
  },
  async registrarAsistenciaComida(dni, bloqueId) {
    comidasRegistradas.push({ dni, bloqueId });
  },
  async resumenComidas() {
    return {
      servicios: [
        { bloque_id: 7, dia: '2026-10-09', titulo: 'Desayuno y Acreditaciones', hora_inicio: '08:00', hora_fin: '10:00', asistentes: comidasRegistradas.filter((c) => c.bloqueId === 7).length },
        { bloque_id: 8, dia: '2026-10-09', titulo: 'Merienda', hora_inicio: '18:00', hora_fin: '18:30', asistentes: comidasRegistradas.filter((c) => c.bloqueId === 8).length },
      ],
      dietas: [],
      porAsistente: [
        { dni: '30111222', primera_acreditacion: new Date('2026-10-09T08:15:00'), apellido: 'Perez', nombre: 'Lucia', alimentacion: 'vegano', desayunos: 1, meriendas: 0, total_servicios: 1 },
      ],
    };
  },
};

const rutaDb = require.resolve(path.join(__dirname, '..', 'src', 'db.js'));
require.cache[rutaDb] = { id: rutaDb, filename: rutaDb, loaded: true, exports: dbMock };

require(path.join(__dirname, '..', 'src', 'server.js'));

const BASE = 'http://127.0.0.1:3577';
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await esperar(800);
  let fallos = 0;

  const verificar = (nombre, condicion) => {
    console.log(`${condicion ? '✔' : '✖'} ${nombre}`);
    if (!condicion) fallos++;
  };

  // 1. Login correcto
  let res = await fetch(`${BASE}/api/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador', password: 'secreto' }),
  });
  const login = await res.json();
  verificar('login ok devuelve token', res.status === 200 && Boolean(login.token));
  verificar('login respeta perm_acreditacion', login.nombre === 'Operador Prueba');

  // 2. Login incorrecto
  res = await fetch(`${BASE}/api/mobile/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador', password: 'mala' }),
  });
  verificar('login con contraseña incorrecta da 401', res.status === 401);

  // 3. Verificar sin token
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ codigo: 'x' }),
  });
  verificar('acreditar sin token da 401', res.status === 401);

  const auth = { 'Content-Type': 'application/json', Authorization: `Bearer ${login.token}` };

  // 4. QR con payload JSON completo (como el generado por el backend)
  const payloadQr = JSON.stringify({
    version: 1,
    id: 'ENC-A1B2C3D4E5',
    dni: '26555444',
    apellido: 'González',
    nombre: 'María',
    email: 'maria@example.com',
    sesiones: [],
  });
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: payloadQr }),
  });
  const rOk = await res.json();
  verificar('QR válido → encontrado:true', res.status === 200 && rOk.encontrado === true);
  verificar('QR válido → coincideCodigo:true', rOk.coincideCodigo === true);
  verificar('QR válido → devuelve nombre y talleres', rOk.nombre === 'María' && Array.isArray(rOk.talleres) && rOk.talleres.length === 2);

  // 5. QR solo código ENC-
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: 'ENC-A1B2C3D4E5' }),
  });
  const rCodigo = await res.json();
  verificar('Código ENC- suelto → encontrado:true', res.status === 200 && rCodigo.encontrado === true);

  // 6. DNI inscripto sin QR a mano (por dni en texto)
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: '26555444' }),
  });
  const rDni = await res.json();
  verificar('DNI inscripto → encontrado:true vía fallback por dni', res.status === 200 && rDni.encontrado === true && rDni.coincideCodigo === false);

  // 7. Asistente inexistente
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: 'ENC-0000000000' }),
  });
  const rMal = await res.json();
  verificar('Asistente inexistente → encontrado:false', res.status === 200 && rMal.encontrado === false);

  // 8. Texto aleatorio escaneado
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: 'https://ejemplo.com/promocion' }),
  });
  const rRaro = await res.json();
  verificar('Texto ajeno → encontrado:false', res.status === 200 && rRaro.encontrado === false);

  // ── Panel admin: perfil, resúmenes y comidas ────────────────────────

  // Login de panel para obtener cookie
  const resLoginPanel = await fetch(`${BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'operador', password: 'secreto' }),
  });
  const loginPanel = await resLoginPanel.json();
  verificar('login panel devuelve perm_acreditacion:true', loginPanel.perm_acreditacion === true);
  const cookie = (resLoginPanel.headers.get('set-cookie') || '').split(';')[0];
  verificar('login panel entrega cookie de sesión', Boolean(cookie));

  const authCookie = { 'Content-Type': 'application/json', Cookie: cookie };

  // Perfil con permiso
  res = await fetch(`${BASE}/api/admin/perfil`, { headers: authCookie });
  const perfil = await res.json();
  verificar('perfil expone perm_acreditacion', res.status === 200 && perfil.perm_acreditacion === true);

  // Resumen de acreditaciones sin sesión → 401
  res = await fetch(`${BASE}/api/admin/acreditaciones/resumen`);
  verificar('resumen acreditaciones sin sesión da 401', res.status === 401);

  // Hubo 3 verificaciones exitosas antes (payload, ENC-, DNI)
  verificar('se registró el log de acreditaciones (3)', logAcreditaciones.length === 3);
  verificar('log de acreditación guarda usuario operador', logAcreditaciones.every((a) => a.usuario === 'operador'));

  // Resumen de acreditaciones
  res = await fetch(`${BASE}/api/admin/acreditaciones/resumen`, { headers: authCookie });
  const resAcc = await res.json();
  verificar(
    'resumen acreditaciones: total y por taller',
    res.status === 200 &&
      resAcc.total === 1 &&
      Array.isArray(resAcc.porTaller) &&
      resAcc.porTaller.length === 2 &&
      resAcc.porTaller[0].acreditados === 1 &&
      resAcc.porTaller[0].inscriptos === 1
  );

  // Comidas sin servicio activo: no registra nada
  verificar('sin servicio activo no cuenta comidas', comidasRegistradas.length === 0);

  // Con desayuno activo, acreditar cuenta para ese servicio
  servicioActivo = { id: 7, dia: '2026-10-09', titulo: 'Desayuno y Acreditaciones' };
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: payloadQr }),
  });
  const rComida1 = await res.json();
  verificar('escaneo en horario de desayuno suma al servicio', comidasRegistradas.length === 1 && comidasRegistradas[0].bloqueId === 7);
  verificar('respuesta incluye servicio con categoria y yaRetirado:false', rComida1.servicio && rComida1.servicio.categoria === 'desayuno' && rComida1.servicio.yaRetirado === false);
  verificar('respuesta incluye alimentacion del asistente', Boolean(rComida1.alimentacion));

  // Segundo escaneo en el mismo servicio: aviso de porción repetida, sin duplicar registro
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: payloadQr }),
  });
  const rComida2 = await res.json();
  verificar(
    'segundo escaneo → yaRetirado:true y no duplica registro',
    rComida2.servicio && rComida2.servicio.yaRetirado === true && comidasRegistradas.length === 1
  );
  servicioActivo = null;

  // Resumen de comidas sin sesión → 401
  res = await fetch(`${BASE}/api/admin/comidas/resumen`);
  verificar('resumen comidas sin sesión da 401', res.status === 401);

  // Resumen de comidas
  res = await fetch(`${BASE}/api/admin/comidas/resumen`, { headers: authCookie });
  const resCom = await res.json();
  verificar(
    'resumen comidas: servicios con categoría y dietas',
    res.status === 200 &&
      resCom.servicios.length === 2 &&
      resCom.servicios[0].categoria === 'desayuno' &&
      resCom.servicios[0].asistentes === 1 &&
      resCom.servicios[1].categoria === 'merienda' &&
      typeof resCom.servicios[0].dietas.sin_restriccion === 'number'
  );
  verificar(
    'resumen comidas: porAsistente incluye fecha de acreditación',
    Array.isArray(resCom.porAsistente) &&
      resCom.porAsistente.length === 1 &&
      /^\d{2}\/\d{2}\/\d{4}/.test(resCom.porAsistente[0].fechaAcreditacion || '')
  );

  // 9. Logout revoca el token
  await fetch(`${BASE}/api/mobile/logout`, { method: 'POST', headers: auth });
  res = await fetch(`${BASE}/api/mobile/acreditar`, {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ codigo: 'ENC-A1B2C3D4E5' }),
  });
  verificar('logout revoca el token (401 luego)', res.status === 401);

  console.log(fallos === 0 ? '\nTODAS LAS PRUEBAS PASARON' : `\n${fallos} PRUEBA(S) FALLARON`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Error en la prueba:', e);
  process.exit(1);
});
