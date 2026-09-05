require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const db = require('./db');
const notificaciones = require('./notificaciones');
const acreditacion = require('./acreditacion');
const whatsapp = require('./whatsapp');
const { supabaseAdmin } = require('./supabase');

const STORAGE_BUCKET = 'ponentes-fotos';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const EN_VERCEL = String(process.env.VERCEL || '').toLowerCase() === '1';

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
    }
  },
}));

const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const ROLES_VALIDOS = ['admin', 'operador'];

function firmarToken(payload, duracionMs) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: Math.floor(duracionMs / 1000) });
}

function verificarToken(token) {
  if (!token) return null;
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verificarPassword(password, almacenado) {
  const [salt, hash] = String(almacenado || '').split(':');
  if (!salt || !hash) return false;
  const hashNuevo = crypto.scryptSync(password, salt, 64).toString('hex');
  return hashNuevo === hash;
}

function crearSesion(usuario) {
  return firmarToken(
    { usuario: usuario.username, nombre: usuario.nombre, rol: usuario.rol },
    DURACION_SESION_MS
  );
}

function sesionValida(token) {
  const s = verificarToken(token);
  if (!s || !s.usuario) return null;
  return { usuario: s.usuario, nombre: s.nombre, rol: s.rol };
}

function requireAuth(req, res, next) {
  const sesion = sesionValida(req.cookies.admin_token);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  req.sesion = sesion;
  next();
}

function requireAdmin(req, res, next) {
  const sesion = sesionValida(req.cookies.admin_token);
  if (!sesion) {
    return res.status(401).json({ error: 'No autorizado' });
  }
  if (sesion.rol !== 'admin') {
    return res.status(403).json({ error: 'No tenés permisos para realizar esta acción.' });
  }
  req.sesion = sesion;
  next();
}

function requirePermiso(permiso) {
  return async (req, res, next) => {
    if (req.sesion && req.sesion.rol === 'admin') return next();
    if (!req.sesion || !req.sesion.usuario) {
      return res.status(403).json({ error: 'No autenticado.' });
    }
    const usuario = await db.buscarUsuario(req.sesion.usuario);
    if (!usuario) {
      return res.status(403).json({ error: 'Usuario no encontrado.' });
    }
    if (!usuario[permiso]) {
      return res.status(403).json({ error: 'Esta operación no está habilitada por el administrador.' });
    }
    next();
  };
}

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const esIdValido = (valor) => /^\d+$/.test(String(valor || ''));
function parseIds(valor) {
  return String(valor || '').split(',').map(s => s.trim()).filter(s => /^\d+$/.test(s)).map(Number).filter(n => n > 0);
}
const ALIMENTACIONES_VALIDAS = ['sin_restriccion', 'vegano', 'sin_tacc', 'sin_lactosa', 'otro'];
const ESTADOS_PAGO = ['no_pagado', 'pago_parcial', 'pago_completo'];

function normalizarEtiqueta(valor) {
  return String(valor || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function dividirCampos(linea, delim) {
  const campos = [];
  let actual = '';
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === delim && !entreComillas) {
      campos.push(actual);
      actual = '';
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

function normalizarEstadoPago(valor) {
  const texto = String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  if (!texto) return '';
  if (texto.includes('parcial') || texto.includes('sena') || texto.includes('parte') || texto.includes('mitad')) {
    return 'pago_parcial';
  }
  if (texto.includes('no pagado') || texto.includes('no abonado') || texto.includes('sin pagar')
    || texto.includes('sin abonar') || texto.includes('impago') || texto.includes('pendiente')
    || texto.includes('adeuda') || texto.includes('debe') || texto === '0') {
    return 'no_pagado';
  }
  if (texto.includes('completo') || texto.includes('total') || texto.includes('pagado') || texto.includes('abonado')
    || texto.includes('cancelado') || texto === 'si' || texto === '1') {
    return 'pago_completo';
  }
  if (texto.includes('no')) {
    return 'no_pagado';
  }
  return '';
}

function parsearCsv(texto) {
  const lineas = texto.replace(/\r/g, '').split('\n').filter((l) => l.trim().length > 0);
  if (lineas.length === 0) return { personas: [], invalidos: 0 };

  const contadores = { ',': 0, ';': 0, '\t': 0 };
  for (const c of lineas[0]) if (c in contadores) contadores[c]++;
  const delim = Object.entries(contadores).sort((a, b) => b[1] - a[1])[0][0];

  const primera = dividirCampos(lineas[0], delim).map((c) => c.trim());
  const normalizadas = primera.map(normalizarEtiqueta);
  const esCabecera = normalizadas.some((c) => c.includes('dni') || c.includes('documento'));
  const inicio = esCabecera ? 1 : 0;

  const indexar = (claves, porDefecto) => {
    const i = normalizadas.findIndex((c) => claves.some((k) => c.includes(k)));
    return i === -1 ? porDefecto : i;
  };

  const columnas = esCabecera
    ? {
        dni: indexar(['dni', 'documento'], 0),
        email: indexar(['correo', 'email', 'mail'], -1),
        telefono: indexar(['telefono', 'celular', 'cel', 'movil'], -1),
        apellido: indexar(['apellido'], -1),
        nombre: indexar(['nombre'], -1),
        pago: indexar(['pago', 'pagado', 'abono', 'abonado'], -1),
      }
    : { dni: 0, apellido: 1, nombre: 2, email: 3, telefono: -1, pago: -1 };

  const apellidoYNombreCombinados = esCabecera && columnas.apellido !== -1 && columnas.apellido === columnas.nombre;

  const personas = [];
  let invalidos = 0;
  for (let i = inicio; i < lineas.length; i++) {
    const campos = dividirCampos(lineas[i], delim).map((c) => c.trim());
    const dni = String(campos[columnas.dni] || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) {
      invalidos++;
      continue;
    }
    let apellido = columnas.apellido !== -1 ? campos[columnas.apellido] || '' : '';
    let nombre = columnas.nombre !== -1 ? campos[columnas.nombre] || '' : '';
    if (apellidoYNombreCombinados) {
      const partes = apellido.split(',').map((p) => p.trim());
      apellido = partes[0] || '';
      nombre = partes[1] || '';
    }
    const email = columnas.email !== -1 ? campos[columnas.email] || '' : '';
    const telefono = columnas.telefono !== -1 ? String(campos[columnas.telefono] || '').replace(/\D/g, '') : '';
    const pago = columnas.pago !== -1 ? normalizarEstadoPago(campos[columnas.pago]) : '';
    personas.push({ dni, apellido, nombre, email, telefono, pago });
  }
  return { personas, invalidos };
}

function parsearArchivo(nombre, contenido, base64) {
  const ext = (nombre || '').toLowerCase().split('.').pop();
  if (ext === 'xlsx' || ext === 'xls') {
    const XLSX = require('xlsx');
    const datos = base64 ? Buffer.from(base64, 'base64') : Buffer.from(contenido);
    const libro = XLSX.read(datos, { type: 'buffer' });
    const hoja = libro.Sheets[libro.SheetNames[0]];
    return parsearCsv(XLSX.utils.sheet_to_csv(hoja));
  }
  return parsearCsv(contenido);
}

function validarTaller(body) {
  const nombre = String(body.nombre || '').trim();
  const descripcion = String(body.descripcion || '').trim();
  const cupo = Number(body.cupo);
  const lugar = String(body.lugar || '').trim();
  const disertante = String(body.disertante || '').trim();

  if (nombre.length < 2 || nombre.length > 100) {
    throw new db.HttpError(400, 'El nombre del taller debe tener entre 2 y 100 caracteres.');
  }
  if (!Number.isInteger(cupo) || cupo < 0) {
    throw new db.HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  }

  const rawParts = Array.isArray(body.parts) ? body.parts : [];
  const parts = rawParts.map((p, i) => {
    const fecha = String(p.fecha || '').trim();
    const hora = String(p.hora || '').trim();
    const duracionHs = Number(p.duracion_hs) || 3;
    if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
      throw new db.HttpError(400, `Parte ${i + 1}: la fecha debe tener formato AAAA-MM-DD.`);
    }
    if (!Number.isInteger(duracionHs) || duracionHs < 1) {
      throw new db.HttpError(400, `Parte ${i + 1}: la duración debe ser un número entero positivo.`);
    }
    const id = p.id ? Number(p.id) : null;
    return { id, fecha, hora, duracion_hs: duracionHs };
  });

  return { nombre, descripcion, cupo, lugar, disertante, parts };
}

async function regenerarAcreditacion(dni) {
  const inscripciones = await db.listarInscripcionesPorDni(dni);
  if (inscripciones.length === 0) return;
  const sesiones = inscripciones.map((i) => ({
    taller: i.taller,
    fecha: i.fecha || '',
    hora: i.hora || '',
    lugar: i.lugar || '',
  }));
  const qrCode = (inscripciones.find((i) => i.qr_code) || {}).qr_code || acreditacion.generarCodigo();
  const qrPayload = acreditacion.construirPayload({
    id: qrCode,
    dni,
    nombre: inscripciones[0].nombre,
    apellido: inscripciones[0].apellido,
    email: inscripciones[0].email,
    sesiones,
  });
  await db.guardarQrInscripcion(dni, qrCode, qrPayload);
}


app.get('/api/talleres', async (req, res, next) => {
  try {
    const talleres = await db.listarTalleres();
    res.json(talleres.map((t) => ({ ...t, inscriptos: Number(t.inscriptos), duracion_hs: Number(t.duracion_hs) })));
  } catch (e) {
    next(e);
  }
});

app.get('/api/ponentes', async (req, res, next) => {
  try {
    const filas = await db.listarPonentesConFecha();
    res.json(
      filas.map((p) => ({
        id: Number(p.id),
        nombre: p.nombre,
        tipo: p.tipo,
        dia: Number(p.dia),
        horario: p.horario || '',
        dia2: p.dia2 ? Number(p.dia2) : null,
        horario2: p.horario2 || '',
        titulo: p.titulo || '',
        descripcion: p.descripcion || '',
        foto: getFotoUrl(p.foto),
        cupo: Number(p.cupo) || 20,
        fecha_dia: db.convertirFechaDia ? db.convertirFechaDia(p.fecha_dia) : p.fecha_dia,
      }))
    );
  } catch (e) {
    next(e);
  }
});

app.get('/api/encuentro/:dni', async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) {
      return res.status(400).json({ error: 'DNI inválido.' });
    }
    const persona = await db.buscarEncuentroPorDni(dni);
    const inscripciones = await db.listarInscripcionesPorDni(dni);
    const respuesta = {
      encontrado: !!persona,
      urlEncuentro: persona ? '' : process.env.ENCUENTRO_FORM_URL || '',
      inscripto: inscripciones.length > 0,
      puedeInscribirse: inscripciones.length < 2,
      inscripciones: inscripciones.map((i) => ({
        tallerId: Number(i.taller_id),
        taller: i.taller,
        duracionHs: Number(i.duracion_hs),
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
      })),
    };
    if (persona) {
      respuesta.nombre = persona.nombre;
      respuesta.apellido = persona.apellido;
      respuesta.email = persona.email;
      respuesta.telefono = persona.telefono;
    }
    res.json(respuesta);
  } catch (e) {
    next(e);
  }
});

app.post('/api/inscripciones', async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const dni = String(body.dni || '').trim();
    const email = String(body.email || '').trim();
    const telefono = String(body.telefono || '').trim().replace(/\D/g, '');
    const alimentacion = String(body.alimentacion || 'sin_restriccion').trim();
    const tallerIdsRaw = body.tallerIds || null;

    if (nombre.length < 2 || nombre.length > 100) {
      throw new db.HttpError(400, 'Ingresá un nombre válido (entre 2 y 100 caracteres).');
    }
    if (apellido.length < 2 || apellido.length > 100) {
      throw new db.HttpError(400, 'Ingresá un apellido válido (entre 2 y 100 caracteres).');
    }
    if (!/^\d{7,8}$/.test(dni)) {
      throw new db.HttpError(400, 'Ingresá un DNI válido (7 u 8 dígitos).');
    }
    if (!validarEmail(email)) {
      throw new db.HttpError(400, 'Ingresá un correo electrónico válido.');
    }
    if (telefono && telefono.length < 8) {
      throw new db.HttpError(400, 'Ingresá un teléfono válido.');
    }
    if (!ALIMENTACIONES_VALIDAS.includes(alimentacion)) {
      throw new db.HttpError(400, 'Tipo de alimentación inválido.');
    }
    const seleccionIds = parseIds(tallerIdsRaw);
    if (!tallerIdsRaw || seleccionIds.length === 0) {
      throw new db.HttpError(400, 'Debés seleccionar al menos un taller.');
    }

    const enEncuentro = await db.esAsistenteEncuentro(dni);
    const encuentro = enEncuentro ? await db.buscarEncuentroPorDni(dni) : null;
    const estadoPago = encuentro && encuentro.pago ? encuentro.pago : 'no_pagado';

    await db.crearInscripcion({
      nombre,
      apellido,
      dni,
      email,
      telefono,
      alimentacion,
      tallerIds: seleccionIds,
      enEncuentro,
      estadoPago,
    });

    const inscripcionesPost = await db.listarInscripcionesPorDni(dni);

    const urlEncuentro = process.env.ENCUENTRO_FORM_URL || '';
    const respuesta = { ok: true, mensaje: 'Inscripción registrada con éxito. ¡Nos vemos en el taller!' };
    if (!enEncuentro) {
      respuesta.aviso = {
        texto: 'Tu DNI no figura en el listado del encuentro.',
        url: urlEncuentro,
        accion: urlEncuentro ? 'Completá tu inscripción al encuentro' : '',
      };
    }
    respuesta.inscripcion = {
      nombre,
      apellido,
      dni,
      email,
      telefono,
      alimentacion,
      talleres: inscripcionesPost.map((i) => ({
        id: Number(i.taller_id),
        nombre: i.taller,
        descripcion: i.descripcion || '',
        duracion_hs: Number(i.duracion_hs),
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
      })),
    };
    res.json(respuesta);
  } catch (e) {
    next(e);
  }
});

app.post('/api/inscripciones/finalizar', async (req, res, next) => {
  try {
    const body = req.body || {};
    const dni = String(body.dni || '').trim();
    if (!/^\d{7,8}$/.test(dni)) {
      throw new db.HttpError(400, 'DNI inválido.');
    }

    const inscripciones = await db.listarInscripcionesPorDni(dni);
    if (inscripciones.length === 0) {
      throw new db.HttpError(404, 'No se encontraron inscripciones para este DNI.');
    }

    const primera = inscripciones[0];
    const nombre = primera.nombre;
    const apellido = primera.apellido;
    const email = primera.email;
    const telefono = primera.telefono || '';
    const alimentacion = primera.alimentacion || 'sin_restriccion';

    const qrCode = acreditacion.generarCodigo();
    const qrPayload = acreditacion.construirPayload({
      id: qrCode,
      dni,
      nombre,
      apellido,
      email,
      sesiones: inscripciones.map((i) => ({
        taller: i.taller,
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
      })),
    });
    await db.guardarQrInscripcion(dni, qrCode, qrPayload);

    notificaciones.notificarInscripcion({
      nombre,
      apellido,
      email,
      telefono,
      alimentacion,
      talleres: inscripciones.map((i) => ({
        nombre: i.taller,
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
        duracion_hs: i.duracion_hs,
      })),
      qrCode,
      qrPayload,
    }).catch((e) => console.error('Error al notificar la inscripción:', e.message));

    db.registrarEvento(
      'inscripcion_finalizada',
      `Inscripción finalizada de ${nombre} ${apellido} (DNI ${dni}) a: ${inscripciones.map((i) => i.taller).join(', ')}`,
      'web'
    ).catch((e) => console.error('Error al registrar evento:', e.message));

    const qrDataUrl = await acreditacion
      .generarPng(qrPayload, { size: 256 })
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => null);

    res.json({ ok: true, qrCode, qrDataUrl });
  } catch (e) {
    next(e);
  }
});

app.post('/api/inscripciones/anular', async (req, res, next) => {
  try {
    const body = req.body || {};
    const dni = String(body.dni || '').trim();
    if (!/^\d{7,8}$/.test(dni)) {
      throw new db.HttpError(400, 'DNI inválido.');
    }

    const eliminadas = await db.eliminarInscripcionesPorDni(dni);
    if (eliminadas === 0) {
      throw new db.HttpError(404, 'No se encontraron inscripciones para este DNI.');
    }

    db.registrarEvento(
      'inscripcion_anulada',
      `Inscripción anulada para DNI ${dni} (${eliminadas} talleres eliminados)`,
      'web'
    ).catch((e) => console.error('Error al registrar evento:', e.message));

    res.json({ ok: true, mensaje: 'Inscripción anulada correctamente.' });
  } catch (e) {
    next(e);
  }
});

app.post('/api/inscripciones/reenviar-constancia', async (req, res, next) => {
  try {
    const body = req.body || {};
    const dni = String(body.dni || '').trim();
    if (!/^\d{7,8}$/.test(dni)) {
      throw new db.HttpError(400, 'DNI inválido.');
    }

    const inscripciones = await db.listarInscripcionesPorDni(dni);
    if (inscripciones.length === 0) {
      throw new db.HttpError(404, 'No se encontraron inscripciones para este DNI.');
    }

    const primera = inscripciones[0];
    const acreditacion = await db.buscarAcreditacionPorDni(dni);
    if (!acreditacion || !acreditacion.qr_code) {
      throw new db.HttpError(404, 'No se encontró la acreditación. Finalizá la inscripción primero.');
    }

    await notificaciones.notificarInscripcion({
      nombre: primera.nombre,
      apellido: primera.apellido,
      email: primera.email,
      telefono: primera.telefono || '',
      alimentacion: primera.alimentacion || 'sin_restriccion',
      talleres: inscripciones.map((i) => ({
        nombre: i.taller,
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
        duracion_hs: i.duracion_hs,
      })),
      qrCode: acreditacion.qr_code,
      qrPayload: acreditacion.qr_data,
    });

    db.registrarEvento(
      'constancia_reenviada',
      `Constancia reenviada a ${primera.nombre} ${primera.apellido} (DNI ${dni})`,
      'web'
    ).catch((e) => console.error('Error al registrar evento:', e.message));

    res.json({ ok: true, mensaje: 'Constancia reenviada por correo electrónico.' });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/login', async (req, res, next) => {
  try {
    const username = String((req.body || {}).username || '').trim().toLowerCase();
    const password = String((req.body || {}).password || '');
    const usuario = await db.buscarUsuario(username);
    if (!usuario || !usuario.activo || !verificarPassword(password, usuario.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    const token = crearSesion(usuario);
    res.cookie('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true',
      maxAge: DURACION_SESION_MS,
    });
    res.json({
      ok: true,
      usuario: usuario.username,
      nombre: usuario.nombre,
      rol: usuario.rol,
      perm_acreditacion: Boolean(usuario.perm_acreditacion),
    });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/admin/perfil', requireAuth, async (req, res) => {
  const usuario = await db.buscarUsuario(req.sesion.usuario);
  const esAdmin = req.sesion.rol === 'admin';
  res.json({
    usuario: req.sesion.usuario,
    nombre: req.sesion.nombre,
    rol: req.sesion.rol,
    perm_acreditacion: esAdmin || Boolean(usuario && usuario.perm_acreditacion),
  });
});

app.get('/api/admin/usuarios', requireAdmin, async (req, res, next) => {
  try {
    res.json(await db.listarUsuarios());
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/usuarios', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nombre = String(body.nombre || '').trim();
    const rol = String(body.rol || 'operador').trim();

    if (!/^[a-z0-9._-]{3,50}$/.test(username)) {
      throw new db.HttpError(400, 'Nombre de usuario inválido (3 a 50 caracteres: letras, números, punto o guión).');
    }
    if (password.length < 4) {
      throw new db.HttpError(400, 'La contraseña debe tener al menos 4 caracteres.');
    }
    if (!ROLES_VALIDOS.includes(rol)) {
      throw new db.HttpError(400, 'Rol inválido.');
    }
    if (await db.buscarUsuario(username)) {
      throw new db.HttpError(409, 'Ese nombre de usuario ya existe.');
    }

    const id = await db.crearUsuario({ username, passwordHash: hashPassword(password), nombre, rol });
    await db.registrarEvento('usuario_creado', `Usuario creado: ${username} (rol ${rol})`, req.sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/usuarios/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de usuario inválido.');
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    const rol = String(body.rol || 'operador').trim();
    const activoRaw = body.activo;
    const activo =
      activoRaw === undefined || activoRaw === null
        ? true
        : activoRaw === true || activoRaw === 1 || activoRaw === '1' || String(activoRaw).toLowerCase() === 'true';
    const password = String(body.password || '');

    if (!ROLES_VALIDOS.includes(rol)) throw new db.HttpError(400, 'Rol inválido.');
    if (password && password.length < 4) {
      throw new db.HttpError(400, 'La contraseña debe tener al menos 4 caracteres.');
    }
    const usuarios = await db.listarUsuarios();
    const objetivo = usuarios.find((u) => Number(u.id) === Number(id));
    if (!objetivo) throw new db.HttpError(404, 'Usuario no encontrado.');
    if (req.sesion.usuario === objetivo.username && rol !== 'admin') {
      throw new db.HttpError(400, 'No podés quitarte el rol de administrador a vos mismo.');
    }
    if (req.sesion.usuario === objetivo.username && !activo) {
      throw new db.HttpError(400, 'No podés desactivar tu propio usuario.');
    }

    await db.actualizarUsuario(id, {
      nombre,
      rol,
      activo,
      passwordHash: password ? hashPassword(password) : null,
      permInscripciones: body.perm_inscripciones !== false && body.perm_inscripciones !== 0,
      permTalleres: body.perm_talleres !== false && body.perm_talleres !== 0,
      permEncuentro: body.perm_encuentro !== false && body.perm_encuentro !== 0,
      permAcreditacion: body.perm_acreditacion !== false && body.perm_acreditacion !== 0,
    });
    await db.registrarEvento('usuario_modificado', `Usuario actualizado: ${objetivo.username} (rol ${rol})`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/usuarios/:id', requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de usuario inválido.');
    const usuarios = await db.listarUsuarios();
    const objetivo = usuarios.find((u) => Number(u.id) === Number(id));
    if (!objetivo) throw new db.HttpError(404, 'Usuario no encontrado.');
    if (req.sesion.usuario === objetivo.username) {
      throw new db.HttpError(400, 'No podés eliminar tu propio usuario.');
    }
    await db.eliminarUsuario(id);
    await db.registrarEvento('usuario_eliminado', `Usuario eliminado: ${objetivo.username}`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/talleres', requireAuth, requirePermiso('perm_talleres'), async (req, res, next) => {
  try {
    const talleres = await db.listarTalleres();
    res.json(talleres.map((t) => ({ ...t, inscriptos: Number(t.inscriptos), duracion_hs: Number(t.duracion_hs) })));
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/inscripciones', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const listado = await db.listarInscripciones();
    res.json(listado.map((i) => ({ ...i, en_encuentro: Boolean(i.en_encuentro) })));
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/inscripciones-talleres', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const dni = String((req.body || {}).dni || '').trim();
    const talleres = (req.body || {}).talleres;
    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido.');
    const resultado = await db.reemplazarTalleresInscripcion(dni, talleres);
    await regenerarAcreditacion(dni);
    await db.registrarEvento(
      'inscripcion_modificada',
      `Talleres de ${resultado.nombre} ${resultado.apellido} (DNI ${dni}) actualizados desde el panel`,
      req.sesion.usuario
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/inscripciones/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de inscripción inválido.');
    const body = req.body || {};
    const nuevoTallerId = body.taller_id;
    const estadoPago = body.estado_pago;
    const detalleCambios = [];
    let resultado = null;

    if (nuevoTallerId) {
      if (!esIdValido(nuevoTallerId)) throw new db.HttpError(400, 'Taller inválido.');
      resultado = await db.cambiarTallerInscripcion(id, nuevoTallerId);
      detalleCambios.push(`taller: ${resultado.anterior} → ${resultado.nuevo}`);
      await regenerarAcreditacion(resultado.dni);
    }

    if (estadoPago) {
      if (!ESTADOS_PAGO.includes(estadoPago)) {
        throw new db.HttpError(400, 'Estado de pago inválido.');
      }
      const fila = await db.cambiarEstadoPagoInscripcion(id, estadoPago);
      if (!resultado) resultado = fila;
      detalleCambios.push(`pago: ${estadoPago}`);
    }

    if (detalleCambios.length === 0) {
      throw new db.HttpError(400, 'No se indicó ningún cambio.');
    }
    if (resultado) {
      await db.registrarEvento(
        'inscripcion_modificada',
        `Inscripción de ${resultado.nombre} ${resultado.apellido} (DNI ${resultado.dni}) modificada: ${detalleCambios.join(', ')}`,
        req.sesion.usuario
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/inscripciones/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de inscripción inválido.');
    const fila = await db.queryOne(
      'SELECT i.dni, i.nombre, i.apellido, t.nombre AS taller FROM inscripciones i JOIN talleres t ON t.id = i.taller_id WHERE i.id = ?',
      [id]
    );
    const eliminada = await db.eliminarInscripcion(id);
    if (!eliminada) throw new db.HttpError(404, 'Inscripción no encontrada.');
    if (fila) {
      await db.registrarEvento(
        'inscripcion_eliminada',
        `Inscripción eliminada de ${fila.nombre} ${fila.apellido} (DNI ${fila.dni}) - ${fila.taller}`,
        req.sesion.usuario
      );
    }
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/eventos', requireAdmin, async (req, res, next) => {
  try {
    const eventos = await db.listarEventos();
    res.json(eventos.map((ev) => ({ ...ev, id: Number(ev.id) })));
  } catch (e) {
    next(e);
  }
});

function dniParamValidado(req, res) {
  const dni = String(req.params.dni || '').replace(/\D/g, '');
  if (!/^\d{7,8}$/.test(dni)) {
    res.status(400).json({ error: 'DNI inválido.' });
    return null;
  }
  return dni;
}

app.get('/api/admin/acreditacion/:dni', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const dni = dniParamValidado(req, res);
    if (!dni) return;
    const acreditacionBd = await db.buscarAcreditacionPorDni(dni);
    if (!acreditacionBd) {
      return res.json({ encontrado: false, dni });
    }
    const datos = acreditacion.parsearPayload(acreditacionBd.qr_data);
    res.json({
      encontrado: true,
      dni,
      codigo: acreditacionBd.qr_code,
      datos,
      nombre: acreditacionBd.nombre,
      apellido: acreditacionBd.apellido,
      email: acreditacionBd.email,
      telefono: acreditacionBd.telefono,
    });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/acreditacion/:dni/png', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const dni = dniParamValidado(req, res);
    if (!dni) return;
    const acreditacionBd = await db.buscarAcreditacionPorDni(dni);
    if (!acreditacionBd) throw new db.HttpError(404, 'No se encontró una acreditación para ese DNI.');
    const png = await acreditacion.generarPng(acreditacionBd.qr_data, { size: 512 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(png);
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/acreditacion/:dni/pdf', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const dni = dniParamValidado(req, res);
    if (!dni) return;
    const acreditacionBd = await db.buscarAcreditacionPorDni(dni);
    if (!acreditacionBd) throw new db.HttpError(404, 'No se encontró una acreditación para ese DNI.');
    const pdf = await acreditacion.generarPdf(acreditacionBd.qr_data);
    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${acreditacionBd.qr_code || dni}.pdf"`);
    res.send(pdf);
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/acreditacion/:dni/reenviar', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const dni = dniParamValidado(req, res);
    if (!dni) return;
    const acreditacionBd = await db.buscarAcreditacionPorDni(dni);
    if (!acreditacionBd) throw new db.HttpError(404, 'No se encontró una acreditación para ese DNI.');
    await notificaciones.notificarInscripcion({
      nombre: acreditacionBd.nombre,
      apellido: acreditacionBd.apellido,
      email: acreditacionBd.email,
      telefono: acreditacionBd.telefono,
      alimentacion: acreditacionBd.alimentacion,
      talleres: (acreditacion.parsearPayload(acreditacionBd.qr_data) || {}).sesiones || [],
      qrCode: acreditacionBd.qr_code,
      qrPayload: acreditacionBd.qr_data,
    });
    await db.registrarEvento(
      'acreditacion_reenviada',
      `Acreditación reenviada por email a ${acreditacionBd.nombre} ${acreditacionBd.apellido} (DNI ${dni})`,
      req.sesion.usuario
    );
    res.json({ ok: true, mensaje: 'Acreditación reenviada por email.' });
  } catch (e) {
    next(e);
  }
});

// ── API móvil de acreditación (app escáner QR) ────────────────────────

function tokenMovilDesdeRequest(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function sesionMovilValida(req) {
  const token = tokenMovilDesdeRequest(req);
  const s = verificarToken(token);
  if (!s || !s.usuario) return null;
  return { token, usuario: s.usuario };
}

function extraerDatosQr(texto) {
  const crudo = String(texto || '').trim();
  let datos = null;
  try {
    datos = JSON.parse(crudo);
  } catch (_) { /* el QR no es JSON */ }
  const soloDigitos = crudo.replace(/\D/g, '');
  const mCodigo = crudo.match(/ENC-[0-9A-Fa-f]{10}/);
  return {
    codigo: String((datos && datos.id) || '').trim() || (mCodigo ? mCodigo[0].toUpperCase() : ''),
    dni: String((datos && datos.dni) || '').replace(/\D/g, '') || (/^\d{7,8}$/.test(soloDigitos) ? soloDigitos : ''),
  };
}

app.post('/api/mobile/login', async (req, res, next) => {
  try {
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const usuario = await db.buscarUsuario(username);
    if (!usuario || !usuario.activo || !verificarPassword(password, usuario.password_hash)) {
      return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
    }
    if (!usuario.perm_acreditacion) {
      return res.status(403).json({ error: 'El usuario no tiene permiso de acreditación.' });
    }
    const token = firmarToken(
      { usuario: usuario.username, nombre: usuario.nombre, rol: usuario.rol },
      DURACION_SESION_MS
    );
    res.json({ ok: true, token, nombre: usuario.nombre, rol: usuario.rol });
  } catch (e) {
    next(e);
  }
});

app.post('/api/mobile/logout', (req, res) => {
  res.json({ ok: true });
});

app.post('/api/mobile/acreditar', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }

    const { codigo, dni } = extraerDatosQr((req.body || {}).codigo);
    let persona = null;
    let coincideCodigo = false;

    if (codigo) {
      persona = await db.queryOne(
        'SELECT dni, nombre, apellido, email, qr_code, alimentacion FROM inscripciones WHERE qr_code = ? ORDER BY id DESC LIMIT 1',
        [codigo]
      );
      if (persona && (!dni || persona.dni === dni)) coincideCodigo = true;
    }

    if (!persona && /^\d{7,8}$/.test(dni)) {
      persona = await db.buscarAcreditacionPorDni(dni);
      coincideCodigo = persona ? Boolean(codigo) && codigo === persona.qr_code : false;
    }

    if (!persona) {
      return res.json({
        encontrado: false,
        dni: /^\d{7,8}$/.test(dni) ? dni : '',
        codigo: codigo || '',
      });
    }

    const inscripciones = await db.listarInscripcionesPorDni(persona.dni);

    let servicioComida = null;
    try {
      const servicioActivo = await db.obtenerServicioComidaActivo();
      if (servicioActivo) {
        const yaRetirado = await db.tieneAsistenciaComida(persona.dni, servicioActivo.id);
        if (!yaRetirado) {
          await db.registrarAsistenciaComida(persona.dni, servicioActivo.id);
        }
        servicioComida = {
          id: Number(servicioActivo.id),
          titulo: servicioActivo.titulo,
          categoria: clasificarServicioComida(servicioActivo.titulo),
          yaRetirado,
        };
      }
    } catch (e) {
      console.error('[Acreditación móvil] Error al registrar comida:', e.message);
    }

    try {
      await db.registrarAcreditacion({
        dni: persona.dni,
        nombre: persona.nombre,
        apellido: persona.apellido,
        qrCode: persona.qr_code || codigo || '',
        usuario: sesion.usuario,
      });
    } catch (e) {
      console.error('[Acreditación móvil] No se pudo registrar la asistencia:', e.message);
    }

    db.registrarEvento(
      'acreditacion_verificada',
      `Acreditación verificada de ${persona.nombre} ${persona.apellido} (DNI ${persona.dni}) desde la app móvil (${sesion.usuario})`,
      sesion.usuario
    ).catch(() => {});

    const pagoCompleto =
      inscripciones.length > 0 && inscripciones.every((i) => i.estado_pago === 'pago_completo');

    res.json({
      encontrado: true,
      coincideCodigo,
      dni: persona.dni,
      nombre: persona.nombre,
      apellido: persona.apellido,
      alimentacion: persona.alimentacion || (inscripciones[0] || {}).alimentacion || 'sin_restriccion',
      horaServidor: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }),
      servicio: servicioComida,
      pagoCompleto,
      talleres: inscripciones.map((i) => ({
        taller: i.taller,
        fecha: i.fecha || '',
        hora: i.hora || '',
        lugar: i.lugar || '',
        pago: i.estado_pago || 'no_pagado',
      })),
    });
  } catch (e) {
    next(e);
  }
});

function clasificarServicioComida(titulo) {
  const t = String(titulo || '').toLowerCase();
  if (t.includes('merienda')) return 'merienda';
  if (t.includes('desayuno')) return 'desayuno';
  return 'otro';
}

const DIETAS_VALIDAS = ['sin_restriccion', 'vegano', 'sin_tacc', 'sin_lactosa', 'otro'];

function formatearFechaHora(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

app.get('/api/admin/acreditaciones/resumen', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const [total, inscriptosUnicos, porTaller] = await Promise.all([
      db.contarAcreditados(),
      db.contarAsistentesUnicos(),
      db.listarAcreditacionesPorTaller(),
    ]);
    res.json({ total, inscriptosUnicos, porTaller });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/comidas/resumen', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const { servicios, dietas, porAsistente } = await db.resumenComidas();

    const dietasPorBloque = {};
    for (const f of dietas) {
      const clave = DIETAS_VALIDAS.includes(f.alimentacion) ? f.alimentacion : 'otro';
      const bloque = dietasPorBloque[f.bloque_id] || {};
      bloque[clave] = Number(bloque[clave] || 0) + Number(f.cantidad);
      dietasPorBloque[f.bloque_id] = bloque;
    }

    res.json({
      total: await db.contarAcreditados(),
      horaServidor: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
      servicios: servicios.map((s) => ({
        id: Number(s.bloque_id),
        dia: s.dia,
        titulo: s.titulo,
        hora_inicio: s.hora_inicio,
        hora_fin: s.hora_fin,
        categoria: clasificarServicioComida(s.titulo),
        asistentes: Number(s.asistentes),
        dietas: DIETAS_VALIDAS.reduce((acc, d) => {
          acc[d] = Number((dietasPorBloque[s.bloque_id] || {})[d] || 0);
          return acc;
        }, {}),
      })),
      porAsistente: porAsistente.map((p) => ({
        dni: p.dni,
        fechaAcreditacion: p.primera_acreditacion ? formatearFechaHora(p.primera_acreditacion) : '',
        apellido: p.apellido || '',
        nombre: p.nombre || '',
        alimentacion: p.alimentacion || 'sin_restriccion',
        desayunos: Number(p.desayunos),
        meriendas: Number(p.meriendas),
        total: Number(p.total_servicios),
      })),
    });
  } catch (e) {
    next(e);
  }
});

// ── Pagos y cuotas ────────────────────────────────────────────────────
app.get('/api/admin/pagos/planes', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    res.json(await db.listarPlanesPago());
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/pagos/planes', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    if (!nombre) throw new db.HttpError(400, 'Indicá un nombre para el plan.');
    await db.crearPlanPago({
      nombre,
      descripcion: String(body.descripcion || ''),
      montoTotal: Number(body.monto_total) || 0,
      cantidadCuotas: Math.max(1, Number(body.cantidad_cuotas) || 1),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/pagos/planes/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const body = req.body || {};
    await db.actualizarPlanPago(id, {
      nombre: String(body.nombre || '').trim(),
      descripcion: String(body.descripcion || ''),
      montoTotal: Number(body.monto_total) || 0,
      cantidadCuotas: Math.max(1, Number(body.cantidad_cuotas) || 1),
      activo: body.activo !== false,
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/pagos/planes/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    await db.eliminarPlanPago(id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/pagos', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    res.json(await db.listarPagos());
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/pagos/asignar', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    await db.asignarPlanAsistente(String(body.dni || '').trim(), Number(body.plan_id));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/pagos/cuota', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    await db.registrarPagoCuota(
      Number(body.asistente_plan_id),
      Number(body.numero_cuota),
      Number(body.monto) || 0,
      String(body.fecha_pago || '')
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/pagos/cuota', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    await db.eliminarPagoCuota(Number(body.asistente_plan_id), Number(body.numero_cuota));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/encuentro', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    res.json({ total: await db.contarEncuentro() });
  } catch (e) {
    next(e);
  }
});app.post('/api/admin/encuentro/import', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || '');
    const contenido = String(body.csv || '');
    const base64 = String(body.base64 || '');
    if (!contenido && !base64) {
      throw new db.HttpError(400, 'El archivo está vacío o no se pudo leer.');
    }
    const { personas, invalidos } = parsearArchivo(nombre, contenido, base64);
    if (personas.length === 0) {
      throw new db.HttpError(400, `No se encontraron DNIs válidos en el archivo${invalidos ? ` (${invalidos} inválidos)` : ''}.`);
    }
    const { importados, existentes } = await db.importarEncuentro(personas);
    res.json({ ok: true, importados, existentes, invalidos, total: await db.contarEncuentro() });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/encuentro', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const eliminados = await db.vaciarEncuentro();
    res.json({ ok: true, eliminados });
  } catch (e) {
    next(e);
  }
});

// ── Programa (público) ────────────────────────────────────────────────

app.get('/api/programa', async (req, res, next) => {
  try {
    const bloques = await db.listarPrograma();
    res.json(bloques);
  } catch (e) {
    next(e);
  }
});

app.get('/api/programa/dias', async (req, res, next) => {
  try {
    const dias = await db.listarDiasPrograma();
    res.json(dias.map((d) => d.dia));
  } catch (e) {
    next(e);
  }
});

// ── Ponentes (catálogo admin) ────────────────────────────────────────

const uploadPonente = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'));
  },
});

function supabaseFotoPath(filename) {
  return `ponentes/${filename}`;
}

async function uploadFotoToStorage(file) {
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const storagePath = supabaseFotoPath(name);
  const { error } = await supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) throw new Error(`Error subiendo foto: ${error.message}`);
  return name;
}

async function deleteFotoPonente(foto) {
  if (!foto) return;
  const storagePath = supabaseFotoPath(foto);
  try {
    await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
  } catch (_) { /* noop */ }
}

function getFotoUrl(foto) {
  if (!foto) return null;
  const { data } = supabaseAdmin.storage
    .from(STORAGE_BUCKET)
    .getPublicUrl(supabaseFotoPath(foto));
  return data?.publicUrl || null;
}

const parseDiaValido = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

app.get('/api/admin/ponentes', requireAuth, async (req, res, next) => {
  try {
    const ponentes = await db.listarPonentes();
    res.json(ponentes.map((p) => ({ ...p, foto: getFotoUrl(p.foto) })));
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/ponentes', requireAuth, uploadPonente.single('foto'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    if (!nombre) {
      return res.status(400).json({ error: 'El nombre es obligatorio.' });
    }
    const dia = parseDiaValido(body.dia, 1);
    const dia2Raw = body.dia2 !== undefined && String(body.dia2).trim() === ''
      ? null
      : parseDiaValido(body.dia2, null);
    const cupo = Math.max(0, Number.parseInt(body.cupo, 10) || 20);
    let foto = null;
    if (req.file) {
      foto = await uploadFotoToStorage(req.file);
    }
    const id = await db.crearPonente({
      nombre,
      tipo: String(body.tipo || 'ponencia').trim(),
      dia,
      horario: String(body.horario || '').trim(),
      dia2: dia2Raw,
      horario2: String(body.horario2 || '').trim(),
      titulo: String(body.titulo || '').trim(),
      descripcion: String(body.descripcion || '').trim(),
      foto,
      fotoPos: String(body.foto_pos || '').trim(),
      cupo,
    });
    await db.sincronizarTalleresDesdePonentes();
    await db.registrarEvento('ponente_creado', `Ponente creado: "${nombre}"`, req.sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/ponentes/:id', requireAuth, uploadPonente.single('foto'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de ponente inválido.');
    const body = req.body || {};
    const existente = await db.obtenerPonente(id);
    if (!existente) {
      return res.status(404).json({ error: 'Ponente no encontrado.' });
    }
    const nombre = String(body.nombre ?? existente.nombre).trim();
    const dia2Cleared = body.dia2 !== undefined && String(body.dia2).trim() === '';
    const dia2 = dia2Cleared ? null : parseDiaValido(body.dia2, existente.dia2);
    let nuevaFoto = existente.foto;
    if (req.file) {
      nuevaFoto = await uploadFotoToStorage(req.file);
      if (existente.foto && existente.foto !== nuevaFoto) {
        await deleteFotoPonente(existente.foto);
      }
    }
    await db.actualizarPonente(id, {
      nombre,
      tipo: String(body.tipo ?? existente.tipo).trim(),
      dia: parseDiaValido(body.dia, existente.dia),
      horario: String(body.horario ?? existente.horario).trim(),
      dia2,
      horario2: dia2Cleared ? '' : String(body.horario2 ?? existente.horario2).trim(),
      titulo: String(body.titulo ?? existente.titulo).trim(),
      descripcion: String(body.descripcion ?? existente.descripcion).trim(),
      foto: nuevaFoto,
      fotoPos: String(body.foto_pos ?? existente.foto_pos).trim(),
      cupo: Math.max(0, Number.parseInt(body.cupo, 10) || existente.cupo || 20),
    });
    await db.sincronizarTalleresDesdePonentes();
    await db.registrarEvento('ponente_modificado', `Ponente actualizado: "${nombre}"`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/ponentes/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de ponente inválido.');
    const existente = await db.obtenerPonente(id);
    if (!existente) throw new db.HttpError(404, 'Ponente no encontrado.');
    await db.eliminarPonente(id);
    await db.sincronizarTalleresDesdePonentes();
    await deleteFotoPonente(existente.foto);
    await db.registrarEvento('ponente_eliminado', `Ponente eliminado: "${existente.nombre}"`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/ponentes/dias', requireAuth, async (req, res, next) => {
  try {
    res.json(await db.listarDiasPonentes());
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/ponentes/dias', requireAuth, async (req, res, next) => {
  try {
    const fechas = Array.isArray(req.body) ? req.body : [];
    await db.guardarDiasPonentes(fechas);
    res.json(await db.listarDiasPonentes());
  } catch (e) {
    next(e);
  }
});

// ── Configuración (admin) ─────────────────────────────────────────────

app.get('/api/admin/config', requireAdmin, async (req, res, next) => {
  try {
    const config = await db.obtenerTodaConfig();
    res.json(config);
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/config', requireAdmin, async (req, res, next) => {
  try {
    const body = req.body || {};
    await db.guardarTodaConfig(body);
    await db.registrarEvento('config_modificada', 'Configuración del evento actualizada', req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Notificaciones a la app móvil ───────────────────────────────────

const TIPOS_NOTIFICACION = ['info', 'alerta', 'urgente', 'recordatorio'];

function validarNotificacion(body) {
  const titulo = String(body.titulo || '').trim();
  const mensaje = String(body.mensaje || '').trim();
  const tipo = String(body.tipo || 'info').trim();
  if (titulo.length < 2 || titulo.length > 200) {
    throw new db.HttpError(400, 'El título debe tener entre 2 y 200 caracteres.');
  }
  if (!mensaje || mensaje.length > 2000) {
    throw new db.HttpError(400, 'El mensaje es obligatorio (máximo 2000 caracteres).');
  }
  if (!TIPOS_NOTIFICACION.includes(tipo)) {
    throw new db.HttpError(400, 'Tipo de notificación inválido.');
  }
  return { titulo, mensaje, tipo };
}

app.get('/api/admin/notificaciones', requireAuth, async (req, res, next) => {
  try {
    res.json(await db.listarNotificaciones());
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/notificaciones', requireAuth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const { titulo, mensaje, tipo } = validarNotificacion(body);
    const id = await db.crearNotificacion({
      titulo,
      mensaje,
      tipo,
      activa: body.activa !== false,
      creadoPor: req.sesion.usuario,
    });
    await db.registrarEvento('notificacion_creada', `Notificación creada: "${titulo}" (${tipo})`, req.sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/notificaciones/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de notificación inválido.');
    const body = req.body || {};
    const { titulo, mensaje, tipo } = validarNotificacion(body);
    await db.actualizarNotificacion(id, { titulo, mensaje, tipo, activa: body.activa !== false });
    await db.registrarEvento('notificacion_modificada', `Notificación actualizada: "${titulo}" (${tipo})`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/notificaciones/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de notificación inválido.');
    const anterior = await db.queryOne('SELECT titulo FROM notificaciones WHERE id = ?', [id]);
    await db.eliminarNotificacion(id);
    await db.registrarEvento(
      'notificacion_eliminada',
      `Notificación eliminada: "${anterior ? anterior.titulo : id}"`,
      req.sesion.usuario
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get('/api/mobile/notificaciones', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    const lista = await db.listarNotificacionesActivas(sesion.usuario);
    const sinLeer = lista.filter((n) => !n.leida).length;
    res.json({ ok: true, notificaciones: lista, sin_leer: sinLeer });
  } catch (e) {
    next(e);
  }
});

app.get('/api/mobile/notificaciones/sin_leer', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    const sinLeer = await db.contarNotificacionesSinLeer(sesion.usuario);
    res.json({ ok: true, sin_leer: sinLeer });
  } catch (e) {
    next(e);
  }
});

app.post('/api/mobile/notificaciones/leer-todas', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    await db.marcarTodasNotificacionesLeidas(sesion.usuario);
    const sinLeer = await db.contarNotificacionesSinLeer(sesion.usuario);
    res.json({ ok: true, sin_leer: sinLeer });
  } catch (e) {
    next(e);
  }
});

app.post('/api/mobile/notificaciones/:id/leer', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    const id = Number((req.params || {}).id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID de notificación inválido.' });
    }
    await db.marcarNotificacionLeida(sesion.usuario, id);
    const sinLeer = await db.contarNotificacionesSinLeer(sesion.usuario);
    res.json({ ok: true, sin_leer: sinLeer });
  } catch (e) {
    next(e);
  }
});

app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  const message = err.message || 'Error interno del servidor.';
  if (status === 500) console.error('[Error]', err);
  res.status(status).json({ error: message });
});

const PORT = Number(process.env.PORT || 3000);

if (!EN_VERCEL) {
  db.initPool()
    .then(async () => {
      if (!(await db.hayUsuarios())) {
        const username = (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD || 'admin';
        await db.crearUsuario({ username, passwordHash: hashPassword(password), nombre: 'Administrador', rol: 'admin' });
        console.log(`Usuario administrador creado: ${username}`);
      }
      await db.sincronizarTalleresDesdePonentes?.();
      whatsapp.iniciar().catch((e) => console.error('[WhatsApp] Error al iniciar:', e.message));
      app.listen(PORT, () => {
        console.log(`Sistema de inscripciones disponible en http://localhost:${PORT}`);
      });
    })
    .catch((e) => {
      console.error('No se pudo inicializar la base de datos:', e.message);
      process.exit(1);
    });
}

module.exports = app;
