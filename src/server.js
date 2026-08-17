require('dotenv').config();

const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cookieParser = require('cookie-parser');
const db = require('./db');
const notificaciones = require('./notificaciones');
const acreditacion = require('./acreditacion');
const whatsapp = require('./whatsapp');

const app = express();

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, '..', 'public')));

const DURACION_SESION_MS = 12 * 60 * 60 * 1000;
const sesiones = new Map();
const ROLES_VALIDOS = ['admin', 'operador'];

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
  const token = crypto.randomBytes(32).toString('hex');
  sesiones.set(token, {
    usuario: usuario.username,
    nombre: usuario.nombre,
    rol: usuario.rol,
    expira: Date.now() + DURACION_SESION_MS,
  });
  return token;
}

function sesionValida(token) {
  if (!token) return null;
  const s = sesiones.get(token);
  if (!s) return null;
  if (Date.now() > s.expira) {
    sesiones.delete(token);
    return null;
  }
  return s;
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

function validarEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

const esIdValido = (valor) => /^\d+$/.test(String(valor || ''));
const TURNOS_VALIDOS = ['manana', 'tarde'];
const DURACIONES_VALIDAS = [3, 6];
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
  const turno = String(body.turno || '').trim();
  const cupo = Number(body.cupo);
  const duracionHs = Number(body.duracion_hs);
  const fecha = String(body.fecha || '').trim();
  const hora = String(body.hora || '').trim();
  const lugar = String(body.lugar || '').trim();

  if (nombre.length < 2 || nombre.length > 100) {
    throw new db.HttpError(400, 'El nombre del taller debe tener entre 2 y 100 caracteres.');
  }
  if (!TURNOS_VALIDOS.includes(turno)) {
    throw new db.HttpError(400, 'Turno inválido (debe ser "manana" o "tarde").');
  }
  if (!Number.isInteger(cupo) || cupo < 0) {
    throw new db.HttpError(400, 'El cupo debe ser un número entero mayor o igual a 0.');
  }
  if (!DURACIONES_VALIDAS.includes(duracionHs)) {
    throw new db.HttpError(400, 'La duración del taller debe ser 3 (un día) o 6 (dos días consecutivos).');
  }
  if (fecha && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    throw new db.HttpError(400, 'La fecha debe tener formato AAAA-MM-DD.');
  }

  return { nombre, descripcion, turno, cupo, duracionHs, fecha, hora, lugar };
}

async function regenerarAcreditacion(dni) {
  const inscripciones = await db.listarInscripcionesPorDni(dni);
  if (inscripciones.length === 0) return;
  const sesiones = inscripciones.map((i) => ({
    turno: i.turno,
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

app.get('/api/encuentro/:dni', async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) {
      return res.status(400).json({ error: 'DNI inválido.' });
    }
    const persona = await db.buscarEncuentroPorDni(dni);
    const inscripciones = await db.listarInscripcionesPorDni(dni);
    const turnosTomados = inscripciones.map((i) => i.turno);
    const respuesta = {
      encontrado: !!persona,
      urlEncuentro: persona ? '' : process.env.ENCUENTRO_FORM_URL || '',
      inscripto: inscripciones.length > 0,
      turnosTomados,
      puedeInscribirse: turnosTomados.length < 2,
      inscripciones: inscripciones.map((i) => ({
        tallerId: Number(i.taller_id),
        turno: i.turno,
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
    const tallerManana = body.tallerManana || null;
    const tallerTarde = body.tallerTarde || null;

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
    if (!tallerManana && !tallerTarde) {
      throw new db.HttpError(400, 'Debés seleccionar al menos un taller.');
    }
    if (tallerManana && !esIdValido(tallerManana)) {
      throw new db.HttpError(400, 'Taller de mañana inválido.');
    }
    if (tallerTarde && !esIdValido(tallerTarde)) {
      throw new db.HttpError(400, 'Taller de tarde inválido.');
    }
    const inscripcionesPrevias = await db.listarInscripcionesPorDni(dni);
    const turnosPrevios = new Set(inscripcionesPrevias.map((i) => i.turno));
    if (turnosPrevios.size >= 2) {
      throw new db.HttpError(409, 'El DNI ingresado ya está inscripto a los talleres en ambos turnos.');
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
      tallerManana,
      tallerTarde,
      enEncuentro,
      estadoPago,
    });

    const talleres = await db.listarTalleres();
    const talleresInscritos = talleres.filter(
      (t) => t.id === Number(tallerManana) || t.id === Number(tallerTarde)
    );

    const qrCode = acreditacion.generarCodigo();
    const qrPayload = acreditacion.construirPayload({
      id: qrCode,
      dni,
      nombre,
      apellido,
      email,
      sesiones: talleresInscritos.map((t) => ({
        turno: t.turno,
        taller: t.nombre,
        fecha: t.fecha || '',
        hora: t.hora || '',
        lugar: t.lugar || '',
      })),
    });
    await db.guardarQrInscripcion(dni, qrCode, qrPayload);

    notificaciones.notificarInscripcion({
      nombre,
      apellido,
      email,
      telefono,
      alimentacion,
      talleres: talleresInscritos,
      qrCode,
      qrPayload,
    }).catch((e) => console.error('Error al notificar la inscripción:', e.message));

    db.registrarEvento(
      'inscripcion_creada',
      `Inscripción de ${nombre} ${apellido} (DNI ${dni})${talleresInscritos.length ? ` a: ${talleresInscritos.map((t) => t.nombre).join(', ')}` : ''}`,
      'web'
    ).catch((e) => console.error('Error al registrar evento:', e.message));

    const urlEncuentro = process.env.ENCUENTRO_FORM_URL || '';
    const respuesta = { ok: true, mensaje: 'Inscripción registrada con éxito. ¡Nos vemos en el taller!' };
    if (!enEncuentro) {
      respuesta.aviso = {
        texto: 'Tu DNI no figura en el listado del encuentro.',
        url: urlEncuentro,
        accion: urlEncuentro ? 'Completá tu inscripción al encuentro' : '',
      };
    }
    const qrDataUrl = await acreditacion
      .generarPng(qrPayload, { size: 256 })
      .then((b) => `data:image/png;base64,${b.toString('base64')}`)
      .catch(() => null);
    respuesta.inscripcion = {
      nombre,
      apellido,
      dni,
      email,
      telefono,
      alimentacion,
      codigo: qrCode,
      qrDataUrl,
      talleres: talleresInscritos.map((t) => ({
        id: Number(t.id),
        nombre: t.nombre,
        descripcion: t.descripcion || '',
        turno: t.turno,
        duracion_hs: Number(t.duracion_hs),
        fecha: t.fecha || '',
        hora: t.hora || '',
        lugar: t.lugar || '',
      })),
    };
    res.json(respuesta);
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
    res.json({ ok: true, usuario: usuario.username, nombre: usuario.nombre, rol: usuario.rol });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/logout', (req, res) => {
  if (req.cookies.admin_token) sesiones.delete(req.cookies.admin_token);
  res.clearCookie('admin_token');
  res.json({ ok: true });
});

app.get('/api/admin/perfil', requireAuth, (req, res) => {
  res.json({ usuario: req.sesion.usuario, nombre: req.sesion.nombre, rol: req.sesion.rol });
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

app.get('/api/admin/talleres', requireAuth, async (req, res, next) => {
  try {
    const talleres = await db.listarTalleres();
    res.json(talleres.map((t) => ({ ...t, inscriptos: Number(t.inscriptos), duracion_hs: Number(t.duracion_hs) })));
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/talleres', requireAuth, async (req, res, next) => {
  try {
    const datos = validarTaller(req.body || {});
    const id = await db.crearTaller(datos);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/talleres/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de taller inválido.');
    const datos = validarTaller(req.body || {});
    await db.actualizarTaller(id, datos);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/talleres/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de taller inválido.');
    const resultado = await db.eliminarTaller(id);
    res.json({ ok: true, ...resultado });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/inscripciones', requireAuth, async (req, res, next) => {
  try {
    const listado = await db.listarInscripciones();
    res.json(listado.map((i) => ({ ...i, en_encuentro: Boolean(i.en_encuentro) })));
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/inscripciones/:id', requireAuth, async (req, res, next) => {
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

app.delete('/api/admin/inscripciones/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de inscripción inválido.');
    const fila = await db.queryOne(
      'SELECT i.dni, i.nombre, i.apellido, i.turno, t.nombre AS taller FROM inscripciones i JOIN talleres t ON t.id = i.taller_id WHERE i.id = ?',
      [id]
    );
    const eliminada = await db.eliminarInscripcion(id);
    if (!eliminada) throw new db.HttpError(404, 'Inscripción no encontrada.');
    if (fila) {
      await db.registrarEvento(
        'inscripcion_eliminada',
        `Inscripción eliminada de ${fila.nombre} ${fila.apellido} (DNI ${fila.dni}) - ${fila.turno}: ${fila.taller}`,
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

app.get('/api/admin/acreditacion/:dni', requireAuth, async (req, res, next) => {
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

app.get('/api/admin/acreditacion/:dni/png', requireAuth, async (req, res, next) => {
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

app.get('/api/admin/acreditacion/:dni/pdf', requireAuth, async (req, res, next) => {
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

app.post('/api/admin/acreditacion/:dni/reenviar', requireAuth, async (req, res, next) => {
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

app.get('/api/admin/encuentro', requireAuth, async (req, res, next) => {
  try {
    res.json({ total: await db.contarEncuentro() });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/encuentro/import', requireAuth, async (req, res, next) => {
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

app.delete('/api/admin/encuentro', requireAuth, async (req, res, next) => {
  try {
    const eliminados = await db.vaciarEncuentro();
    res.json({ ok: true, eliminados });
  } catch (e) {
    next(e);
  }
});


const PORT = Number(process.env.PORT || 3000);

db.init()
  .then(async () => {
    if (!(await db.hayUsuarios())) {
      const username = (process.env.ADMIN_USER || 'admin').trim().toLowerCase();
      const password = process.env.ADMIN_PASSWORD || 'admin';
      await db.crearUsuario({ username, passwordHash: hashPassword(password), nombre: 'Administrador', rol: 'admin' });
      console.log(`Usuario administrador creado: ${username}`);
    }
    whatsapp.iniciar().catch((e) => console.error('[WhatsApp] Error al iniciar:', e.message));
    app.listen(PORT, () => {
      console.log(`Sistema de inscripciones disponible en http://localhost:${PORT}`);
    });
  })
  .catch((e) => {
    console.error('No se pudo inicializar la base de datos:', e.message);
    process.exit(1);
  });
