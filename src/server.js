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
const certificados = require('./certificados');
const whatsapp = require('./whatsapp');
let supabaseAdmin = null;
try {
  ({ supabaseAdmin } = require('./supabase'));
} catch (_) { /* supabase opcional */ }

const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'ponentes-fotos';
// Fotos locales: public/uploads (servido por express.static)
// El bucket de Supabase usa prefijo "ponentes/", pero local es /uploads/<file>
// En Vercel el FS es efímero: la persistencia real es Supabase Storage.
// UPLOADS_DIR es configurable solo para dev local / VPS con volumen persistente.
const UPLOADS_DIR = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '..', 'public', 'uploads');
const UPLOADS_DIR_LEGACY = process.env.UPLOADS_DIR_LEGACY
  ? path.resolve(process.env.UPLOADS_DIR_LEGACY)
  : path.join(UPLOADS_DIR, 'ponentes');
function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
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
const ROLES_VALIDOS = ['admin', 'superior', 'menu', 'operador'];
const HERENCIA_ROL = {
  admin: ['admin','superior','menu','operador'],
  superior: ['superior','menu','operador'],
  menu: ['menu'],
  operador: ['operador'],
};
function rolIncluye(rol, requerido) { const h = HERENCIA_ROL[rol] || [rol]; return h.includes(requerido); }

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

function requireApiKey(req, res, next) {
  const claveEsperada = process.env.GOOGLE_SHEETS_API_KEY || '';
  if (!claveEsperada) {
    return res.status(503).json({ error: 'El servidor no tiene configurada la API key de Google Sheets.' });
  }
  const recibida = String(req.get('x-api-key') || '').trim();
  const a = Buffer.from(recibida);
  const b = Buffer.from(claveEsperada);
  const coincide = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!coincide) {
    return res.status(401).json({ error: 'API key inválida.' });
  }
  next();
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
  return String(valor || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
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

  const indexar = (claves, porDefecto, excluir = []) => {
    for (let i = 0; i < normalizadas.length; i++) {
      const c = normalizadas[i];
      if (excluir.some((k) => c.includes(k))) continue;
      if (claves.some((k) => c.includes(k))) return i;
    }
    return porDefecto;
  };

  const columnas = esCabecera
    ? {
        dni: indexar(['dni', 'documento'], 0),
        email: indexar(['correo', 'email', 'mail'], -1),
        telefono: indexar(['telefono', 'celular', 'cel', 'movil'], -1),
        apellido: indexar(['apellido'], -1),
        nombre: indexar(['nombre'], -1),
        marcaTemporal: indexar(['marcatemporal'], -1),
        nacimiento: indexar(['fechadenacimiento', 'nacimiento'], -1),
        provincia: indexar(['provincia'], -1),
        ciudad: indexar(['ciudadlocalidad', 'ciudad', 'localidad'], -1),
        ocupacion: indexar(['ocupacion'], -1),
        pago: indexar(['pago', 'pagado', 'abono', 'abonado'], -1, ['cuota']),
        opcionPago: indexar(['opcionenpagocuotas', 'opcionpago', 'cuota'], -1),
      }
    : { dni: 0, apellido: 1, nombre: 2, email: 3, telefono: -1, pago: -1, marcaTemporal: -1, nacimiento: -1, provincia: -1, ciudad: -1, ocupacion: -1, opcionPago: -1 };

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
    personas.push({
      dni,
      apellido,
      nombre,
      email,
      telefono,
      pago,
      marcaTemporal: columnas.marcaTemporal !== -1 ? campos[columnas.marcaTemporal] || '' : '',
      fechaNacimiento: columnas.nacimiento !== -1 ? campos[columnas.nacimiento] || '' : '',
      provincia: columnas.provincia !== -1 ? campos[columnas.provincia] || '' : '',
      ciudad: columnas.ciudad !== -1 ? campos[columnas.ciudad] || '' : '',
      ocupacion: columnas.ocupacion !== -1 ? campos[columnas.ocupacion] || '' : '',
      opcionPago: columnas.opcionPago !== -1 ? campos[columnas.opcionPago] || '' : '',
    });
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

const ORDEN_COLUMNAS_SHEETS = {
  dni: 0, nombre: 1, apellido: 2, email: 3, telefono: 4,
  pago: 5, marcaTemporal: 6, fechaNacimiento: 7,
  provincia: 8, ciudad: 9, ocupacion: 10, opcionPago: 11,
};

function filasSheetsAObjetos(datos) {
  const filas = Array.isArray(datos)
    ? datos.filter((f) => Array.isArray(f) && f.some((c) => String(c || '').trim() !== ''))
    : [];
  if (filas.length === 0) return { personas: [], invalidos: 0, conCabecera: false };

  const normalizadas = filas[0].map(normalizarEtiqueta);
  const esCabecera = normalizadas.some((c) => c.includes('dni') || c.includes('documento'));
  const inicio = esCabecera ? 1 : 0;

  let columnas = ORDEN_COLUMNAS_SHEETS;
  if (esCabecera) {
    const indexar = (claves, excluir = []) => {
      for (let i = 0; i < normalizadas.length; i++) {
        const c = normalizadas[i];
        if (excluir.some((k) => c.includes(k))) continue;
        if (claves.some((k) => c.includes(k))) return i;
      }
      return -1;
    };
    columnas = {
      dni: indexar(['dni', 'documento']),
      nombre: indexar(['nombre']),
      apellido: indexar(['apellido']),
      email: indexar(['correo', 'email', 'mail']),
      telefono: indexar(['telefono', 'celular', 'cel', 'movil']),
      pago: indexar(['pago', 'pagado', 'abono', 'abonado'], ['cuota']),
      marcaTemporal: indexar(['marcatemporal', 'fechadeinscripcion']),
      fechaNacimiento: indexar(['fechadenacimiento', 'nacimiento']),
      provincia: indexar(['provincia']),
      ciudad: indexar(['ciudadlocalidad', 'ciudad', 'localidad']),
      ocupacion: indexar(['ocupacion']),
      opcionPago: indexar(['opcionenpagocuotas', 'opcionpago', 'cuota']),
    };
  }

  const celda = (fila, clave) => {
    const idx = columnas[clave];
    if (idx === undefined || idx === -1 || idx >= fila.length) return '';
    return String(fila[idx] || '');
  };

  const apellidoNombreCombinados = esCabecera && columnas.apellido !== -1 && columnas.apellido === columnas.nombre;

  const personas = [];
  let invalidos = 0;
  for (let i = inicio; i < filas.length; i++) {
    const fila = filas[i];
    const dni = celda(fila, 'dni').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) {
      invalidos++;
      continue;
    }
    let apellido = celda(fila, 'apellido').trim();
    let nombre = celda(fila, 'nombre').trim();
    if (apellidoNombreCombinados) {
      const partes = apellido.split(',');
      if (partes.length >= 2) {
        apellido = partes[0].trim();
        nombre = partes.slice(1).join(',').trim();
      } else {
        const idx = apellido.indexOf(' ');
        if (idx > 0) {
          nombre = apellido.slice(idx + 1).trim();
          apellido = apellido.slice(0, idx).trim();
        }
      }
    }
    personas.push({
      dni,
      nombre,
      apellido,
      email: celda(fila, 'email').trim(),
      telefono: celda(fila, 'telefono').replace(/\D/g, ''),
      pago: normalizarEstadoPago(celda(fila, 'pago')),
      marcaTemporal: celda(fila, 'marcaTemporal').trim(),
      fechaNacimiento: celda(fila, 'fechaNacimiento').trim(),
      provincia: celda(fila, 'provincia').trim(),
      ciudad: celda(fila, 'ciudad').trim(),
      ocupacion: celda(fila, 'ocupacion').trim(),
      opcionPago: celda(fila, 'opcionPago').trim(),
    });
  }
  return { personas, invalidos, conCabecera: esCabecera };
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
    alimentacion: inscripciones[0].alimentacion || '',
    sesiones,
  });
  await db.guardarQrInscripcion(dni, qrCode, qrPayload);
}


app.get('/api/talleres', async (req, res, next) => {
  try {
    const talleres = await db.listarTalleres();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(talleres.map((t) => ({ ...t, inscriptos: Number(t.inscriptos), cupo: Number(t.cupo), duracion_hs: Number(t.duracion_hs), pareja_id: t.pareja_id ? Number(t.pareja_id) : null, ponentes: t.ponentes || [], ponentes_ids: (t.ponentes||[]).map(p=>p.id) })));
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

// ── Config pública para el form de encuentro (alias + opciones de pago) ──
// IMPORTANTE: debe ir ANTES de /:dni para que "config" no sea interpretado como DNI
app.get('/api/encuentro/config', async (req, res) => {
  const alias = String(process.env.ENCUENTRO_ALIAS || '').trim();
  const leyenda = String(process.env.ENCUENTRO_ALIAS_LEYENDA || '').trim();
  const titulo = String(process.env.ENCUENTRO_TRANSFERENCIA_TITULO || 'Datos para la transferencia').trim();
  const descripcion = String(process.env.ENCUENTRO_TRANSFERENCIA_DESCRIPCION || 'Realizá la transferencia al alias indicado y subí el comprobante (imagen o PDF, máx 8 MB).').trim();
  let opcionesPago = [];
  const raw = String(process.env.ENCUENTRO_OPCIONES_PAGO || '').trim();
  if (raw) {
    opcionesPago = raw.split('|').map(s => s.trim()).filter(Boolean);
  } else {
    // Solo Septiembre-Octubre + Otro (requerimiento actual)
    opcionesPago = [
      '2 cuotas de $65.000 - Total $130.000 (Septiembre-Octubre)',
      'Otro',
    ];
  }
  res.json({ alias, leyenda, titulo, descripcion, opcionesPago });
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
      // urlEncuentro se mantiene por compatibilidad pero ya no se usa (form nativo)
      urlEncuentro: '',
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

// ── Upload comprobante (encuentro) ──────────────────────────────────
const COMPROBANTES_DIR = path.join(UPLOADS_DIR, 'comprobantes');
function ensureComprobantesDir() { if (!fs.existsSync(COMPROBANTES_DIR)) fs.mkdirSync(COMPROBANTES_DIR, { recursive: true }); }
const uploadComprobante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^(image\/|application\/pdf)/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes o PDF para el comprobante'));
  },
});
function supabaseComprobantePath(filename) { return `comprobantes/${filename}`; }
async function uploadComprobanteToStorage(file) {
  const ext = (path.extname(file.originalname) || (file.mimetype === 'application/pdf' ? '.pdf' : '.jpg')).toLowerCase();
  const name = `${Date.now()}-${Math.round(Math.random()*1e9)}${ext}`;
  const useSupabase = process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage;
  if (useSupabase) {
    try {
      const storagePath = supabaseComprobantePath(name);
      const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) return name;
      console.warn('[Storage comprobante] Supabase falló, usando filesystem local:', error.message);
    } catch (e) { console.warn('[Storage comprobante] Supabase error:', e.message); }
  }
  ensureComprobantesDir();
  const dest = path.join(COMPROBANTES_DIR, name);
  await fs.promises.writeFile(dest, file.buffer);
  return name;
}
function getComprobanteUrl(filename) {
  if (!filename) return '';
  if (process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage) {
    try {
      const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(supabaseComprobantePath(filename));
      if (data?.publicUrl && !data.publicUrl.includes('supabase.co/undefined')) return data.publicUrl;
    } catch (_) {}
  }
  return `/uploads/comprobantes/${filename}`;
}

// Inscripción nativa al encuentro (reemplaza Google Forms/Sheets) — soporta JSON y multipart con comprobante
app.post('/api/encuentro', uploadComprobante.single('comprobante'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const dni = String(body.dni || '').replace(/\D/g, '');
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const email = String(body.email || '').trim();
    const telefono = String(body.telefono || '').trim();
    const fechaNacimiento = String(body.fecha_nacimiento || body.fechaNacimiento || '').trim();
    const provincia = String(body.provincia || '').trim();
    const ciudad = String(body.ciudad || '').trim();
    const ocupacion = String(body.ocupacion || '').trim();
    const opcionPago = String(body.opcion_pago || body.opcionPago || body.opcionPagoSelect || '').trim();

    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido (7 u 8 dígitos).');
    if (nombre.length < 2 || nombre.length > 100) throw new db.HttpError(400, 'Ingresá un nombre válido (entre 2 y 100 caracteres).');
    if (apellido.length < 2 || apellido.length > 100) throw new db.HttpError(400, 'Ingresá un apellido válido (entre 2 y 100 caracteres).');
    if (!validarEmail(email)) throw new db.HttpError(400, 'Ingresá un correo electrónico válido.');
    const telLimpio = String(telefono || '').replace(/\D/g, '');
    if (!telLimpio || telLimpio.length < 8) throw new db.HttpError(400, 'Ingresá un teléfono/celular válido (obligatorio).');
    const ocupacionesValidas = ['Docente', 'Estudiante'];
    if (!ocupacionesValidas.includes(ocupacion)) throw new db.HttpError(400, 'Seleccioná una ocupación válida (Docente o Estudiante).');
    const opcionesValidas = [
      '2 cuotas de $65.000 - Total $130.000 (Septiembre-Octubre)',
      'Otro',
    ];
    // permitir también si viene de ENCUENTRO_OPCIONES_PAGO custom
    const rawOpt = String(process.env.ENCUENTRO_OPCIONES_PAGO || '').trim();
    const opcionesPermitidas = rawOpt ? rawOpt.split('|').map(s=>s.trim()).filter(Boolean) : opcionesValidas;
    if (!opcionesPermitidas.includes(opcionPago)) throw new db.HttpError(400, 'Seleccioná una opción de pago válida (Septiembre-Octubre u Otro).');

    let comprobante = '';
    let comprobanteNombre = '';
    let comprobanteTipo = '';
    if (req.file) {
      comprobante = await uploadComprobanteToStorage(req.file);
      comprobanteNombre = req.file.originalname || comprobante;
      comprobanteTipo = req.file.mimetype || '';
    }

    await db.crearEncuentroInscripcion({
      dni, nombre, apellido, email, telefono, fechaNacimiento, provincia, ciudad, ocupacion, opcionPago,
      comprobante, comprobanteNombre, comprobanteTipo,
    });
    await db.registrarEvento('encuentro_inscripto_web', `Inscripción al encuentro: ${nombre} ${apellido} (DNI ${dni})${comprobante ? ' con comprobante' : ''}`, 'web');
    const persona = await db.buscarEncuentroPorDni(dni);
    res.status(201).json({ ok: true, dni, persona, comprobante: comprobante ? getComprobanteUrl(comprobante) : '' });
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

    const respuesta = { ok: true, mensaje: 'Inscripción registrada con éxito. ¡Nos vemos en el taller!' };
    if (!enEncuentro) {
      respuesta.aviso = {
        texto: 'Tu inscripción al encuentro fue registrada. Ya podés continuar.',
        url: '',
        accion: '',
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
      throw new db.HttpError(404, 'No se encontraron inscripciones para este DNI. ');
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
      alimentacion,
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
      perm_certificados: Boolean(usuario.perm_certificados ?? true),
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
    perm_certificados: esAdmin || Boolean(usuario && (usuario.perm_certificados ?? true)),
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
      permCertificados: body.perm_certificados !== false && body.perm_certificados !== 0,
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

// ── Mobile Usuarios (admin) ────────────────────────────────────────
app.get('/api/mobile/usuarios', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin') return res.status(403).json({ error: 'Solo admin.' });
    res.json(await db.listarUsuarios());
  } catch (e) { next(e); }
});
app.post('/api/mobile/usuarios', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin') return res.status(403).json({ error: 'Solo admin.' });
    const body = req.body || {};
    const username = String(body.username || '').trim().toLowerCase();
    const password = String(body.password || '');
    const nombre = String(body.nombre || '').trim();
    const rol = String(body.rol || 'operador').trim();
    if (!/^[a-z0-9._-]{3,50}$/.test(username)) throw new db.HttpError(400, 'Nombre de usuario inválido (3 a 50 caracteres: letras, números, punto o guión).');
    if (password.length < 4) throw new db.HttpError(400, 'La contraseña debe tener al menos 4 caracteres.');
    if (!ROLES_VALIDOS.includes(rol)) throw new db.HttpError(400, 'Rol inválido.');
    if (await db.buscarUsuario(username)) throw new db.HttpError(409, 'Ese nombre de usuario ya existe.');
    const id = await db.crearUsuario({ username, passwordHash: hashPassword(password), nombre, rol });
    await db.registrarEvento('usuario_creado', `Usuario creado (móvil): ${username} (rol ${rol})`, sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});
app.put('/api/mobile/usuarios/:id', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin') return res.status(403).json({ error: 'Solo admin.' });
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de usuario inválido.');
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    const rol = String(body.rol || 'operador').trim();
    const activoRaw = body.activo;
    const activo = activoRaw === undefined || activoRaw === null ? true : activoRaw === true || activoRaw === 1 || activoRaw === '1' || String(activoRaw).toLowerCase() === 'true';
    const password = String(body.password || '');
    if (!ROLES_VALIDOS.includes(rol)) throw new db.HttpError(400, 'Rol inválido.');
    if (password && password.length < 4) throw new db.HttpError(400, 'La contraseña debe tener al menos 4 caracteres.');
    const usuarios = await db.listarUsuarios();
    const objetivo = usuarios.find((u) => Number(u.id) === Number(id));
    if (!objetivo) throw new db.HttpError(404, 'Usuario no encontrado.');
    if (sesion.usuario === objetivo.username && rol !== 'admin') throw new db.HttpError(400, 'No podés quitarte el rol de administrador a vos mismo.');
    if (sesion.usuario === objetivo.username && !activo) throw new db.HttpError(400, 'No podés desactivar tu propio usuario.');
    await db.actualizarUsuario(id, { nombre, rol, activo, passwordHash: password ? hashPassword(password) : null, permInscripciones: body.perm_inscripciones !== false && body.perm_inscripciones !== 0, permTalleres: body.perm_talleres !== false && body.perm_talleres !== 0, permEncuentro: body.perm_encuentro !== false && body.perm_encuentro !== 0, permAcreditacion: body.perm_acreditacion !== false && body.perm_acreditacion !== 0 });
    await db.registrarEvento('usuario_modificado', `Usuario actualizado (móvil): ${objetivo.username} (rol ${rol})`, sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
app.delete('/api/mobile/usuarios/:id', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin') return res.status(403).json({ error: 'Solo admin.' });
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de usuario inválido.');
    const usuarios = await db.listarUsuarios();
    const objetivo = usuarios.find((u) => Number(u.id) === Number(id));
    if (!objetivo) throw new db.HttpError(404, 'Usuario no encontrado.');
    if (sesion.usuario === objetivo.username) throw new db.HttpError(400, 'No podés eliminar tu propio usuario.');
    await db.eliminarUsuario(id);
    await db.registrarEvento('usuario_eliminado', `Usuario eliminado (móvil): ${objetivo.username}`, sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/admin/talleres', requireAuth, requirePermiso('perm_talleres'), async (req, res, next) => {
  try {
    const talleres = await db.listarTalleres();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(talleres.map((t) => ({ ...t, inscriptos: Number(t.inscriptos), cupo: Number(t.cupo), duracion_hs: Number(t.duracion_hs), pareja_id: t.pareja_id ? Number(t.pareja_id) : null, ponentes: t.ponentes || [], ponentes_ids: (t.ponentes||[]).map(p=>p.id) })));
  } catch (e) {
    next(e);
  }
});

// ── Taller ↔ Ponentes (múltiples ponentes por taller) ────────────────────
app.get('/api/admin/talleres/:id/ponentes', requireAuth, requirePermiso('perm_talleres'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de taller inválido.');
    const t = await db.obtenerTaller(id);
    if (!t) throw new db.HttpError(404, 'Taller no encontrado.');
    res.json({ taller_id: Number(id), ponentes: t.ponentes || [], ponentes_ids: (t.ponentes||[]).map(p=>p.id) });
  } catch (e) { next(e); }
});

app.put('/api/admin/talleres/:id/ponentes', requireAuth, requirePermiso('perm_talleres'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de taller inválido.');
    const t = await db.obtenerTaller(id);
    if (!t) throw new db.HttpError(404, 'Taller no encontrado.');
    const body = req.body || {};
    let ponenteIds = [];
    if (Array.isArray(body.ponenteIds)) ponenteIds = body.ponenteIds;
    else if (Array.isArray(body.ponentes)) ponenteIds = body.ponentes;
    else if (Array.isArray(body.ponentes_ids)) ponenteIds = body.ponentes_ids;
    else if (body.ponente_ids) ponenteIds = String(body.ponente_ids).split(',').map(s=> s.trim()).filter(Boolean);
    ponenteIds = ponenteIds.map(n=> Number(n)).filter(n=> Number.isInteger(n) && n>0);
    // validar que todos existen
    for (const pid of ponenteIds) {
      const p = await db.obtenerPonente(pid);
      if (!p) throw new db.HttpError(400, `Ponente ${pid} no existe.`);
    }
    await db.setTallerPonentes(Number(id), ponenteIds);
    // también actualizar pareja si existe
    const pareja = await db.query('SELECT id FROM talleres WHERE pareja_id = ?', [id]);
    for (const r of pareja) {
      await db.setTallerPonentes(Number(r.id), ponenteIds);
    }
    await db.registrarEvento('taller_ponentes_actualizado', `Taller #${id} ponentes: ${ponenteIds.join(',')||'ninguno'}`, req.sesion.usuario);
    const actualizado = await db.obtenerTaller(id);
    res.json({ ok: true, ponentes: actualizado.ponentes || [] });
  } catch (e) { next(e); }
});

app.get('/api/admin/inscripciones', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const listado = await db.listarInscripciones();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
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

// ── CRUD Asistentes (agregado sobre inscripciones) ───────────────────
app.get('/api/admin/asistentes', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const lista = await db.listarAsistentes();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(lista.map((a) => ({
      dni: a.dni,
      nombre: a.nombre,
      apellido: a.apellido,
      email: a.email,
      telefono: a.telefono || '',
      alimentacion: a.alimentacion || 'sin_restriccion',
      en_encuentro: Boolean(a.en_encuentro),
      estado_pago: a.estado_pago || 'no_pagado',
      creado_en: a.creado_en,
      cantidad_talleres: Number(a.cantidad_talleres),
      talleres_nombres: a.talleres_nombres || '',
      talleres_ids: a.talleres_ids || '',
    })));
  } catch (e) { next(e); }
});

// Export XLSX: listado de asistentes ordenado por apellido y nombre
// Columnas: DNI, Apellido y nombre, Correo, Teléfono, Alimentación,
// Insc. talleres (SÍ/NO), Pago, Fecha (DD-MM-AAAA). Respeta filtros q y taller.
function fechaGuion(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}`;
}

app.get('/api/admin/asistentes/export/xlsx', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const tallerFiltro = String(req.query.taller || '').trim();
    const [lista, talleres] = await Promise.all([db.listarAsistentes(), db.listarTalleres()]);
    const grupoDe = (id) => {
      const t = (talleres || []).find((x) => String(x.id) === String(id));
      if (!t) return String(id);
      return t.pareja_id ? String(t.pareja_id) : String(t.id);
    };
    const visibles = (lista || []).filter((a) => {
      if (q) {
        const coincide = String(a.dni || '').includes(q)
          || String(a.apellido || '').toLowerCase().includes(q)
          || String(a.nombre || '').toLowerCase().includes(q)
          || String(a.email || '').toLowerCase().includes(q);
        if (!coincide) return false;
      }
      if (!tallerFiltro) return true;
      const cant = Number(a.cantidad_talleres || 0);
      if (tallerFiltro === '__sin_taller__') return cant === 0;
      if (tallerFiltro === '__con_taller__') return cant > 0;
      const ids = String(a.talleres_ids || '').split(',').map((s) => s.trim()).filter(Boolean);
      return ids.some((id) => String(id) === tallerFiltro || grupoDe(id) === tallerFiltro);
    });
    const cabecera = ['DNI', 'Apellido y nombre', 'Correo', 'Teléfono', 'Alimentación', 'Insc. talleres', 'Pago', 'Fecha'];
    const filas = visibles.map((a) => ([
      String(a.dni || ''),
      [a.apellido, a.nombre].filter(Boolean).join(', '),
      String(a.email || ''),
      String(a.telefono || ''),
      ETIQUETAS_DIETA[a.alimentacion] || a.alimentacion || '',
      Number(a.cantidad_talleres || 0) > 0 ? 'SÍ' : 'NO',
      ETIQUETAS_ESTADO_PAGO[a.estado_pago] || a.estado_pago || '',
      fechaGuion(a.creado_en),
    ]));
    const XLSX = require('xlsx');
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([cabecera, ...filas]);
    hoja['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 30 }, { wch: 14 }, { wch: 16 }, { wch: 13 }, { wch: 14 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(libro, hoja, 'Asistentes');
    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    const ahora = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const marca = `${ahora.getFullYear()}-${p2(ahora.getMonth() + 1)}-${p2(ahora.getDate())}_${p2(ahora.getHours())}${p2(ahora.getMinutes())}`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Content-Disposition', `attachment; filename="asistentes-${marca}.xlsx"`);
    await db.registrarEvento('asistentes_exportados', `Export XLSX de asistentes: ${filas.length} fila(s)${q ? ` (búsqueda "${q}")` : ''}${tallerFiltro ? ` (filtro taller ${tallerFiltro})` : ''}`, req.sesion.usuario).catch(() => {});
    res.send(buf);
  } catch (e) { next(e); }
});

app.post('/api/admin/asistentes', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const nombre = String(body.nombre || '').trim();
    const apellido = String(body.apellido || '').trim();
    const dni = String(body.dni || '').trim().replace(/\D/g, '');
    const email = String(body.email || '').trim();
    const telefono = String(body.telefono || '').trim().replace(/\D/g, '');
    const alimentacion = String(body.alimentacion || 'sin_restriccion').trim();
    const tallerIds = Array.isArray(body.talleres) ? body.talleres : parseIds(body.talleres || body.tallerIds || '');
    if (nombre.length < 2 || apellido.length < 2) throw new db.HttpError(400, 'Nombre y apellido requeridos.');
    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido (7 u 8 dígitos).');
    if (!validarEmail(email)) throw new db.HttpError(400, 'Email inválido.');
    if (!ALIMENTACIONES_VALIDAS.includes(alimentacion)) throw new db.HttpError(400, 'Alimentación inválida.');
    if (!tallerIds.length) throw new db.HttpError(400, 'Seleccioná al menos un taller.');
    const enEncuentro = await db.esAsistenteEncuentro(dni);
    const encuentro = enEncuentro ? await db.buscarEncuentroPorDni(dni) : null;
    const estadoPago = encuentro && encuentro.pago ? encuentro.pago : 'no_pagado';
    await db.crearInscripcion({ nombre, apellido, dni, email, telefono, alimentacion, tallerIds, enEncuentro, estadoPago });
    await regenerarAcreditacion(dni);
    await db.registrarEvento('inscripcion_creada', `Asistente creado: ${nombre} ${apellido} (DNI ${dni}) - ${tallerIds.length} taller(es)`, req.sesion.usuario);
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/admin/asistentes/:dni', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido.');
    const body = req.body || {};
    const campos = {
      nombre: String(body.nombre || '').trim(),
      apellido: String(body.apellido || '').trim(),
      email: String(body.email || '').trim(),
      telefono: String(body.telefono || '').trim(),
      alimentacion: String(body.alimentacion || 'sin_restriccion').trim(),
    };
    if (campos.nombre.length < 2 || campos.apellido.length < 2) throw new db.HttpError(400, 'Nombre y apellido requeridos.');
    if (!validarEmail(campos.email)) throw new db.HttpError(400, 'Email inválido.');
    if (!ALIMENTACIONES_VALIDAS.includes(campos.alimentacion)) throw new db.HttpError(400, 'Alimentación inválida.');
    await db.actualizarAsistente(dni, campos);
    if (body.talleres !== undefined) {
      const talleres = Array.isArray(body.talleres) ? body.talleres : parseIds(String(body.talleres || ''));
      if (talleres.length === 0) {
        // Permitir quitar todos los talleres: queda como solo-encuentro si figura en encuentro
        const enEncuentro = await db.esAsistenteEncuentro(dni);
        if (!enEncuentro) throw new db.HttpError(400, 'Seleccioná al menos un taller.');
        await db.eliminarInscripcionesPorDni(dni);
      } else {
        await db.reemplazarTalleresInscripcion(dni, talleres);
      }
    }
    await regenerarAcreditacion(dni);
    await db.registrarEvento('inscripcion_modificada', `Asistente actualizado: ${campos.nombre} ${campos.apellido} (DNI ${dni})`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/admin/asistentes/:dni/ficha', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    const ficha = await db.obtenerFichaAsistente(dni);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(ficha);
  } catch (e) { next(e); }
});

app.get('/api/admin/asistentes/:dni', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    const ficha = await db.obtenerFichaAsistente(dni);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(ficha);
  } catch (e) { next(e); }
});

app.delete('/api/admin/asistentes/:dni', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const dni = String(req.params.dni || '').replace(/\D/g, '');
    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido.');
    const fila = await db.queryOne('SELECT nombre, apellido FROM inscripciones WHERE dni = ? LIMIT 1', [dni]);
    if (!fila) {
      const enc = await db.queryOne('SELECT nombre, apellido FROM encuentro_inscripciones WHERE dni = ? AND oculto = FALSE LIMIT 1', [dni]);
      if (enc) throw new db.HttpError(409, 'La persona solo figura en el encuentro (sin talleres). Gestioná su baja desde la pestaña Encuentro.');
      throw new db.HttpError(404, 'Asistente no encontrado.');
    }
    const eliminadas = await db.eliminarInscripcionesPorDni(dni);
    await db.registrarEvento('inscripcion_eliminada', `Asistente eliminado: ${fila.nombre} ${fila.apellido} (DNI ${dni}) - ${eliminadas} inscripción(es)`, req.sesion.usuario);
    res.json({ ok: true, eliminadas });
  } catch (e) { next(e); }
});

app.get('/api/admin/eventos', requireAdmin, async (req, res, next) => {
  try {
    const pageRaw = req.query.page;
    const limitRaw = req.query.limit;
    const hasPagination = pageRaw !== undefined || limitRaw !== undefined;
    if (hasPagination) {
      const limit = Math.min(100, Math.max(1, Number(limitRaw) || 5));
      const page = Math.max(1, Number(pageRaw) || 1);
      const offset = (page - 1) * limit;
      const [eventos, total] = await Promise.all([
        db.listarEventos({ limit, offset }),
        db.contarEventos(),
      ]);
      const totalPaginas = Math.max(1, Math.ceil(total / limit));
      res.json({
        eventos: eventos.map((ev) => ({ ...ev, id: Number(ev.id) })),
        total,
        page,
        limit,
        totalPaginas,
      });
      return;
    }
    const eventos = await db.listarEventos();
    res.json(eventos.map((ev) => ({ ...ev, id: Number(ev.id) })));
  } catch (e) {
    next(e);
  }
});

// ── Backup de la base de datos (descarga .sql / .json) ─────────────────
function tipoDdl(col) {
  if (col.data_type === 'character varying' || col.data_type === 'character') {
    return col.character_maximum_length ? `${col.data_type}(${col.character_maximum_length})` : col.data_type;
  }
  if (col.data_type === 'numeric' && col.numeric_precision != null) {
    return `numeric(${col.numeric_precision}${col.numeric_scale != null ? `,${col.numeric_scale}` : ''})`;
  }
  return col.data_type;
}

function tipoCast(col) {
  if (col.data_type === 'character varying') return 'varchar';
  if (col.data_type === 'timestamp with time zone') return 'timestamptz';
  if (col.data_type === 'timestamp without time zone') return 'timestamp';
  if (col.data_type === 'USER-DEFINED') return col.udt_name;
  if (col.data_type === 'ARRAY') return `${String(col.udt_name || '').replace(/^_/, '')}[]`;
  return col.data_type;
}

function literalSql(valor, col) {
  if (valor === null || valor === undefined) return 'NULL';
  if (typeof valor === 'boolean') return valor ? 'TRUE' : 'FALSE';
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : 'NULL';
  const texto = typeof valor === 'object' ? JSON.stringify(valor) : String(valor);
  return `'${texto.replace(/'/g, "''")}'::${tipoCast(col)}`;
}

// Orden de inserción: padres primero (para bases que ya tienen las FK),
// manejando además autorreferencias (ej. talleres.pareja_id -> talleres.id).
function ordenarTablasPorDependencia(nombres, fks) {
  const dependencias = new Map(nombres.map((n) => [n, new Set()]));
  for (const fk of fks) {
    if (fk.tabla === fk.refTabla) continue;
    if (dependencias.has(fk.tabla) && dependencias.has(fk.refTabla)) dependencias.get(fk.tabla).add(fk.refTabla);
  }
  const orden = [];
  const listos = new Set();
  const restantes = new Set(nombres);
  let avanzando = true;
  while (restantes.size && avanzando) {
    avanzando = false;
    for (const tabla of [...restantes]) {
      const deps = dependencias.get(tabla);
      if ([...deps].every((d) => listos.has(d))) {
        orden.push(tabla);
        listos.add(tabla);
        restantes.delete(tabla);
        avanzando = true;
      }
    }
  }
  for (const tabla of restantes) orden.push(tabla);
  return orden;
}

function ordenarFilasConAutoFk(filas, autoFks) {
  if (!autoFks.length || filas.length < 2) return filas;
  const pendientes = [...filas];
  const orden = [];
  const insertados = new Set();
  let avanzando = true;
  while (pendientes.length && avanzando) {
    avanzando = false;
    for (let i = 0; i < pendientes.length; i++) {
      const fila = pendientes[i];
      const ok = autoFks.every((fk) => {
        const valor = fila[fk.col];
        if (valor === null || valor === undefined) return true;
        return insertados.has(`${fk.refCol}=${String(valor)}`);
      });
      if (!ok) continue;
      autoFks.forEach((fk) => { if (fila[fk.refCol] !== null && fila[fk.refCol] !== undefined) insertados.add(`${fk.refCol}=${String(fila[fk.refCol])}`); });
      orden.push(fila);
      pendientes.splice(i, 1);
      i--;
      avanzando = true;
    }
  }
  return [...orden, ...pendientes];
}

async function armarBackup() {
  const nombres = (await db.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`
  )).map((r) => r.table_name);

  const fks = (await db.query(
    `SELECT con.conname AS constraint_name,
            rel.relname AS tabla,
            child.attname AS columna,
            refrel.relname AS ref_tabla,
            parent.attname AS ref_columna
       FROM pg_constraint con
       JOIN pg_class rel ON rel.oid = con.conrelid
       JOIN pg_class refrel ON refrel.oid = con.confrelid
       JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
       JOIN unnest(con.conkey) WITH ORDINALITY AS ck(attnum, ord) ON TRUE
       JOIN unnest(con.confkey) WITH ORDINALITY AS pk(attnum, ord) ON pk.ord = ck.ord
       JOIN pg_attribute child ON child.attrelid = con.conrelid AND child.attnum = ck.attnum
       JOIN pg_attribute parent ON parent.attrelid = con.confrelid AND parent.attnum = pk.attnum
      WHERE con.contype = 'f' AND nsp.nspname = 'public'
      ORDER BY con.conname, ck.ord`
  )).map((r) => ({
    constraintName: r.constraint_name,
    tabla: r.tabla,
    columna: r.columna,
    refTabla: r.ref_tabla,
    refColumna: r.ref_columna,
  }));

  const secuencias = await db.query(
    `SELECT sequencename, data_type, start_value, increment_by, min_value, max_value, cache_size, cycle
       FROM pg_sequences WHERE schemaname = 'public' ORDER BY sequencename`
  );

  const restriccionesUnicas = [];
  {
    const filas = await db.query(
      `SELECT tc.constraint_name, tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.constraint_type = 'UNIQUE'
        ORDER BY tc.table_name, tc.constraint_name, kcu.ordinal_position`
    );
    for (const f of filas) {
      let ultima = restriccionesUnicas[restriccionesUnicas.length - 1];
      if (!ultima || ultima.nombre !== f.constraint_name) {
        ultima = { nombre: f.constraint_name, tabla: f.table_name, columnas: [] };
        restriccionesUnicas.push(ultima);
      }
      ultima.columnas.push(f.column_name);
    }
  }

  const restriccionesChequeo = await db.query(
    `SELECT tab.relname AS tabla, con.conname AS nombre, pg_get_constraintdef(con.oid) AS definicion
       FROM pg_constraint con
       JOIN pg_class tab ON tab.oid = con.conrelid
       JOIN pg_namespace nsp ON nsp.oid = con.connamespace
      WHERE nsp.nspname = 'public' AND con.contype = 'c'
      ORDER BY tab.relname, con.conname`
  );

  const indicesUnicos = await db.query(
    `SELECT idx.relname AS nombre, tab.relname AS tabla, pg_get_indexdef(ix.indexrelid) AS definicion
       FROM pg_index ix
       JOIN pg_class idx ON idx.oid = ix.indexrelid
       JOIN pg_class tab ON tab.oid = ix.indrelid
       JOIN pg_namespace nsp ON nsp.oid = tab.relnamespace
      WHERE nsp.nspname = 'public' AND ix.indisunique AND ix.indisvalid
        AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = ix.indexrelid)
      ORDER BY tab.relname, idx.relname`
  );

  const esquema = [];
  let totalFilas = 0;

  for (const nombre of nombres) {
    const columnas = await db.query(
      `SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision,
              numeric_scale, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ?
        ORDER BY ordinal_position`, [nombre]);
    const pk = (await db.query(
      `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        WHERE tc.table_schema = 'public' AND tc.table_name = ? AND tc.constraint_type = 'PRIMARY KEY'
        ORDER BY kcu.ordinal_position`, [nombre]
    )).map((r) => r.column_name);
    const filas = (await db.query(`SELECT to_jsonb(t) AS fila FROM "public"."${nombre}" t`)).map((r) => r.fila);
    totalFilas += filas.length;
    esquema.push({ nombre, columnas, pk, filas });
  }

  // ── .sql ──
  const lineas = [];
  const ahora = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  const marca = `${ahora.getFullYear()}-${p2(ahora.getMonth() + 1)}-${p2(ahora.getDate())} ${p2(ahora.getHours())}:${p2(ahora.getMinutes())}:${p2(ahora.getSeconds())}`;
  lineas.push(`-- Backup de la base de datos (dramatiza-1)`);
  lineas.push(`-- Generado: ${marca}`);
  lineas.push(`-- Incluye esquema (CREATE TABLE + secuencias + restricciones + FK) y datos (TRUNCATE + INSERT).`);
  lineas.push(`-- Restaurable en una base vacía o en esta misma base.`);
  lineas.push(`-- Tablas: ${nombres.length} · Filas: ${totalFilas}`);
  lineas.push('');
  lineas.push('BEGIN;');
  lineas.push('');

  for (const s of secuencias) {
    const ciclo = s.cycle ? 'CYCLE' : 'NO CYCLE';
    lineas.push(`CREATE SEQUENCE IF NOT EXISTS "public"."${s.sequencename}"`);
    lineas.push(`  AS ${s.data_type} START WITH ${s.start_value} MINVALUE ${s.min_value} MAXVALUE ${s.max_value}`);
    lineas.push(`  INCREMENT BY ${s.increment_by} CACHE ${s.cache_size} ${ciclo};`);
  }
  lineas.push('');

  for (const t of esquema) {
    lineas.push(`-- ── ${t.nombre} ──`);
    const defs = t.columnas.map((c) => {
      const partes = [`"${c.column_name}" ${tipoDdl(c)}`];
      if (c.is_nullable === 'NO') partes.push('NOT NULL');
      const porDefecto = c.column_default && !String(c.column_default).startsWith('nextval(');
      if (porDefecto) partes.push(`DEFAULT ${c.column_default}`);
      return partes.join(' ');
    });
    if (t.pk.length) defs.push(`PRIMARY KEY (${t.pk.map((c) => `"${c}"`).join(', ')})`);
    lineas.push(`CREATE TABLE IF NOT EXISTS "public"."${t.nombre}" (`);
    lineas.push(defs.map((d) => `  ${d}`).join(',\n'));
    lineas.push(');');
    const seqCols = t.columnas.filter((c) => c.column_default && String(c.column_default).startsWith('nextval('));
    for (const c of seqCols) {
      const m = String(c.column_default).match(/nextval\('([^']+)'/);
      if (!m) continue;
      const seq = m[1].split('.').pop().replace(/"/g, '');
      lineas.push(`ALTER SEQUENCE IF EXISTS "public"."${seq}" OWNED BY "public"."${t.nombre}"."${c.column_name}";`);
      lineas.push(`ALTER TABLE "public"."${t.nombre}" ALTER COLUMN "${c.column_name}" SET DEFAULT nextval('public."${seq}"'::regclass);`);
    }
    lineas.push('');
  }

  const ordenTablas = ordenarTablasPorDependencia(nombres, fks);

  // Un solo TRUNCATE de todas las tablas: si cada tabla se trunca en su turno,
  // el CASCADE borre filas recién cargadas en tablas dependientes.
  lineas.push('-- Vaciado único de todas las tablas (evita que el CASCADE borre datos ya cargados)');
  lineas.push('TRUNCATE TABLE');
  lineas.push(nombres.map((n) => `  "public"."${n}"`).join(',\n'));
  lineas.push('  CASCADE;');
  lineas.push('');

  for (const t of esquema) {
    for (const c of t.columnas) {
      lineas.push(`ALTER TABLE "public"."${t.nombre}" ADD COLUMN IF NOT EXISTS "${c.column_name}" ${tipoDdl(c)}${c.is_nullable === 'NO' ? ' NOT NULL' : ''};`);
    }
  }
  lineas.push('');

  for (const nombre of ordenTablas) {
    const t = esquema.find((x) => x.nombre === nombre);
    const autoFks = fks.filter((f) => f.tabla === nombre && f.refTabla === nombre).map((f) => ({ col: f.columna, refCol: f.refColumna }));
    const colList = t.columnas.map((c) => `"${c.column_name}"`).join(', ');
    const filas = ordenarFilasConAutoFk(t.filas, autoFks);
    if (filas.length) lineas.push(`-- ── datos de ${nombre} ──`);
    for (const fila of filas) {
      const vals = t.columnas.map((c) => literalSql(fila[c.column_name], c)).join(', ');
      lineas.push(`INSERT INTO "public"."${nombre}" (${colList}) VALUES (${vals});`);
    }
    if (filas.length) lineas.push('');
  }

  lineas.push('-- Restricciones UNIQUE (requeridas por las claves foráneas)');
  for (const u of restriccionesUnicas) {
    lineas.push(`DO $bkp$ BEGIN`);
    lineas.push(`  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${u.nombre.replace(/'/g, "''")}' AND conrelid = '"public"."${u.tabla}"'::regclass) THEN`);
    lineas.push(`    ALTER TABLE "public"."${u.tabla}" ADD CONSTRAINT "${u.nombre}" UNIQUE (${u.columnas.map((c) => `"${c}"`).join(', ')});`);
    lineas.push(`  END IF;`);
    lineas.push(`END $bkp$;`);
  }
  lineas.push('');

  lineas.push('-- Restricciones CHECK');
  for (const c of restriccionesChequeo) {
    lineas.push(`DO $bkp$ BEGIN`);
    lineas.push(`  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${c.nombre.replace(/'/g, "''")}' AND conrelid = '"public"."${c.tabla}"'::regclass) THEN`);
    lineas.push(`    ALTER TABLE "public"."${c.tabla}" ADD CONSTRAINT "${c.nombre}" ${c.definicion};`);
    lineas.push(`  END IF;`);
    lineas.push(`END $bkp$;`);
  }
  lineas.push('');

  lineas.push('-- Índices únicos sin restricción asociada');
  for (const i of indicesUnicos) {
    const ddl = String(i.definicion).replace(
      /^CREATE UNIQUE INDEX (\S+) ON ([A-Za-z_][A-Za-z0-9_$]*)\./,
      (m, nom, esquema) => `CREATE UNIQUE INDEX IF NOT EXISTS "${nom.replace(/"/g, '""')}" ON "public".`
    );
    lineas.push(`${ddl};`);
  }
  lineas.push('');

  lineas.push('-- Claves foráneas (se agregan solo si faltan)');
  for (const fk of fks) {
    lineas.push(`DO $bkp$ BEGIN`);
    lineas.push(`  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${fk.constraintName.replace(/'/g, "''")}' AND conrelid = '"public"."${fk.tabla}"'::regclass) THEN`);
    lineas.push(`    ALTER TABLE "public"."${fk.tabla}" ADD CONSTRAINT "${fk.constraintName}" FOREIGN KEY ("${fk.columna}") REFERENCES "public"."${fk.refTabla}" ("${fk.refColumna}");`);
    lineas.push(`  END IF;`);
    lineas.push(`END $bkp$;`);
  }
  lineas.push('');

  for (const t of esquema) {
    for (const c of t.columnas) {
      if (!c.column_default || !String(c.column_default).startsWith('nextval(')) continue;
      lineas.push(`SELECT setval(pg_get_serial_sequence('"public"."${t.nombre}"', '${c.column_name}'), COALESCE((SELECT MAX("${c.column_name}") FROM "public"."${t.nombre}"), 1), (SELECT COUNT(*) > 0 FROM "public"."${t.nombre}"));`);
    }
  }
  lineas.push('');
  lineas.push('COMMIT;');

  // ── .json ──
  const json = {
    meta: {
      proyecto: 'dramatiza-1',
      generado_en: ahora.toISOString(),
      tablas: nombres.length,
      filas: totalFilas,
    },
    tablas: esquema.map((t) => ({
      nombre: t.nombre,
      columnas: t.columnas.map((c) => ({ nombre: c.column_name, tipo: tipoDdl(c), nullable: c.is_nullable !== 'NO', pk: t.pk.includes(c.column_name) })),
      filas: t.filas.map((fila) => {
        const ordenada = {};
        for (const c of t.columnas) ordenada[c.column_name] = fila[c.column_name] === undefined ? null : fila[c.column_name];
        return ordenada;
      }),
    })),
  };

  return { sql: lineas.join('\n'), json, tablas: nombres.length, filas: totalFilas };
}

function marcaArchivo(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

function responderBackup(formato) {
  return async (req, res, next) => {
    try {
      const backup = await armarBackup();
      const marca = marcaArchivo(new Date());
      const esJson = formato === 'json';
      res.set('Content-Type', esJson ? 'application/json; charset=utf-8' : 'application/sql; charset=utf-8');
      res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.set('Content-Disposition', `attachment; filename="backup-dramatiza-${marca}.${esJson ? 'json' : 'sql'}"`);
      const detalle = `Backup ${esJson ? '.json' : '.sql'}: ${backup.tablas} tablas · ${backup.filas} filas${esJson ? '' : ` · ${Math.round(backup.sql.length / 1024)} KB`}`;
      await db.registrarEvento('backup_descargado', detalle, req.sesion.usuario).catch(() => {});
      res.send(esJson ? JSON.stringify(backup.json, null, 1) : backup.sql);
    } catch (e) {
      next(e);
    }
  };
}

app.get('/api/admin/backup.sql', requireAdmin, responderBackup('sql'));
app.get('/api/admin/backup.json', requireAdmin, responderBackup('json'));

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
  return { token, usuario: s.usuario, nombre: s.nombre, rol: s.rol };
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
    if (!usuario.perm_acreditacion && usuario.rol !== 'admin' && usuario.rol !== 'superior') {
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
      horaServidor: new Date().toLocaleTimeString('es-AR', { timeZone: 'America/Argentina/Salta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
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
  if (t.includes('almuerzo')) return 'almuerzo';
  if (t.includes('cena')) return 'cena';
  return 'otro';
}

const DIETAS_VALIDAS = ['sin_restriccion', 'vegano', 'sin_tacc', 'sin_lactosa', 'otro'];

const TZ_SALTA = 'America/Argentina/Salta';
function formatearFechaHora(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: TZ_SALTA,
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(d).replace(',', '');
}

app.get('/api/admin/acreditaciones/resumen', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    const [total, inscriptosUnicos, porTaller] = await Promise.all([
      db.contarAcreditados(),
      db.contarAsistentesUnicos(),
      db.listarAcreditacionesPorTaller(),
    ]);
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json({ total, inscriptosUnicos, porTaller });
  } catch (e) {
    next(e);
  }
});

app.get('/api/admin/comidas/resumen', requireAuth, requirePermiso('perm_acreditacion'), async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    const { servicios, dietas, porAsistente, inscriptosPorDieta = [], totalInscriptos = 0, inscriptosConDieta = [], totalInscripcionesTalleres = 0 } = await db.resumenComidas();

    const dietasPorBloque = {};
    for (const f of dietas) {
      const clave = DIETAS_VALIDAS.includes(f.alimentacion) ? f.alimentacion : 'otro';
      const bloque = dietasPorBloque[f.bloque_id] || {};
      bloque[clave] = Number(bloque[clave] || 0) + Number(f.cantidad);
      dietasPorBloque[f.bloque_id] = bloque;
    }

    // Mapa global de inscriptos a talleres por restricción alimentaria (DNI únicos)
    const inscriptosMap = DIETAS_VALIDAS.reduce((acc, d) => { acc[d] = 0; return acc; }, {});
    for (const r of inscriptosPorDieta) {
      const clave = DIETAS_VALIDAS.includes(r.alimentacion) ? r.alimentacion : 'otro';
      inscriptosMap[clave] = (inscriptosMap[clave] || 0) + Number(r.cantidad || 0);
    }

    res.json({
      total: await db.contarAcreditados(),
      totalInscriptos: Number(totalInscriptos) || 0,
      totalInscripcionesTalleres: Number(totalInscripcionesTalleres) || 0,
      inscriptosPorDieta: inscriptosMap,
      inscriptosConDieta: inscriptosConDieta.map(p => ({
        dni: p.dni,
        apellido: p.apellido || '',
        nombre: p.nombre || '',
        email: p.email || '',
        telefono: p.telefono || '',
        alimentacion: p.alimentacion || 'sin_restriccion',
        cantidadTalleres: Number(p.cantidad_talleres || 0),
        talleres: p.talleres_nombres || '',
      })),
      horaServidor: new Date().toLocaleString('es-AR', { timeZone: TZ_SALTA, dateStyle: 'short', timeStyle: 'medium' }),
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
      esTallerista: body.es_tallerista === true || body.es_tallerista === 1 || String(body.es_tallerista).toLowerCase() === 'true',
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
    if (body.cuotas === undefined || body.cuotas === null) {
      const existente = await db.queryOne('SELECT cuotas FROM planes_pago WHERE id = ?', [id]);
      body.cuotas = (existente && existente.cuotas) || null;
    }
    await db.actualizarPlanPago(id, {
      nombre: String(body.nombre || '').trim(),
      descripcion: String(body.descripcion || ''),
      montoTotal: Number(body.monto_total) || 0,
      cantidadCuotas: Math.max(1, Number(body.cantidad_cuotas) || 1),
      activo: body.activo !== false,
      cuotas: body.cuotas,
      esTallerista: body.es_tallerista === true || body.es_tallerista === 1 || String(body.es_tallerista).toLowerCase() === 'true',
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

// ── Export XLSX: listado de asistentes y sus pagos ──────────────────────
const ETIQUETAS_DIETA = {
  sin_restriccion: 'Sin restricción',
  vegano: 'Vegano',
  sin_tacc: 'Sin TACC',
  sin_lactosa: 'Sin lactosa',
  otro: 'Otro',
};
const ETIQUETAS_ESTADO_PAGO = {
  no_pagado: 'No pagado',
  pago_parcial: 'Pago parcial',
  pago_completo: 'Pago completo',
};

function fechaCorta(valor) {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return String(valor).slice(0, 10);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function marcarFormatoMoneda(hoja, columnas) {
  const ref = hoja['!ref'];
  if (!ref) return;
  const partes = String(ref).split(':');
  const ultimaFila = Number(String(partes[partes.length - 1]).replace(/\D/g, '')) || 0;
  if (!ultimaFila) return;
  for (const col of columnas) {
    for (let fila = 2; fila <= ultimaFila; fila++) {
      const celda = hoja[`${col}${fila}`];
      if (celda && typeof celda.v === 'number') celda.z = '#,##0';
    }
  }
}

app.get('/api/admin/pagos/export/xlsx', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const filtro = String(req.query.q || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const [asistentes, planes] = await Promise.all([db.listarAsistentes(), db.listarPagos()]);

    const planesPorDni = new Map();
    for (const p of planes) {
      const dni = String(p.dni || '');
      if (!planesPorDni.has(dni)) planesPorDni.set(dni, []);
      planesPorDni.get(dni).push(p);
    }

    // Unión: todos los inscriptos + eventuales planes sin inscripción registrada
    const personas = [];
    const vistos = new Set();
    for (const a of asistentes) {
      const dni = String(a.dni);
      vistos.add(dni);
      personas.push({
        dni,
        apellido: a.apellido || '',
        nombre: a.nombre || '',
        email: a.email || '',
        telefono: a.telefono || '',
        alimentacion: a.alimentacion || 'sin_restriccion',
        en_encuentro: Boolean(a.en_encuentro),
        estado_pago: a.estado_pago || 'no_pagado',
        talleres: a.talleres_nombres || '',
        planes: planesPorDni.get(dni) || [],
      });
    }
    for (const [dni, lista] of planesPorDni) {
      if (vistos.has(dni)) continue;
      const p = lista[0];
      personas.push({
        dni,
        apellido: p.apellido || '',
        nombre: p.nombre || '',
        email: p.email || '',
        telefono: p.telefono || '',
        alimentacion: 'sin_restriccion',
        en_encuentro: Boolean(p.encuentroId),
        estado_pago: 'no_pagado',
        talleres: '',
        planes: lista,
      });
    }
    const sinTildes = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const visibles = filtro ? personas.filter((p) => String(p.dni).includes(filtro) || sinTildes(`${p.apellido || ''} ${p.nombre || ''}`).includes(filtro)) : personas;

    const cabecera = ['DNI', 'Apellido y nombre', 'Mail', 'Teléfono', 'Estado', 'Plan', 'Total / cuotas', 'Cuotas pago', 'Saldo', 'Fechas de pago'];
    const filas = [];
    const fmtMoneda = (n) => Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

    for (const p of visibles) {
      const nombre = [p.apellido, p.nombre].filter(Boolean).join(', ');
      const estado = ETIQUETAS_ESTADO_PAGO[p.estado_pago] || p.estado_pago || '';
      if (!p.planes.length) {
        filas.push([p.dni, nombre, p.email, p.telefono, estado, '', '', '', 0, '']);
        continue;
      }
      for (const pl of p.planes) {
        const detalle = Array.isArray(pl.cuotasDetalle) ? pl.cuotasDetalle : [];
        const pagadas = Array.isArray(pl.cuotas) ? pl.cuotas : [];
        const pagado = pagadas.reduce((s, c) => s + (Number(c.monto) || 0), 0);
        const total = Number(pl.montoTotal) || 0;
        const n = Number(pl.cantidadCuotas) || detalle.length || 0;
        const fechas = pagadas
          .slice()
          .sort((a, b) => Number(a.numero) - Number(b.numero))
          .map((c) => `${c.numero}: ${fechaCorta(c.fecha)}`)
          .join(' · ');
        filas.push([
          p.dni,
          nombre,
          p.email,
          p.telefono,
          estado,
          pl.planNombre || `Plan #${pl.planId}`,
          n ? `$ ${fmtMoneda(total)} / ${n} cuota(s)` : `$ ${fmtMoneda(total)}`,
          n ? `${pagadas.length}/${n}` : '',
          total - pagado,
          fechas,
        ]);
      }
    }

    const XLSX = require('xlsx');
    const libro = XLSX.utils.book_new();
    const hoja = XLSX.utils.aoa_to_sheet([cabecera, ...filas]);
    marcarFormatoMoneda(hoja, ['I']);
    hoja['!cols'] = [{ wch: 10 }, { wch: 32 }, { wch: 28 }, { wch: 14 }, { wch: 14 },
      { wch: 30 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(libro, hoja, 'Pagos y cuotas');

    const buf = XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
    const ahora = new Date();
    const p2 = (n) => String(n).padStart(2, '0');
    const marca = `${ahora.getFullYear()}-${p2(ahora.getMonth() + 1)}-${ahora.getDate()}_${p2(ahora.getHours())}${p2(ahora.getMinutes())}`;
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.set('Content-Disposition', `attachment; filename="pagos-asistentes-${marca}.xlsx"`);
    await db.registrarEvento('pagos_exportados', `Export XLSX de pagos: ${filas.length} fila(s)${filtro ? ` (filtro DNI ${filtro})` : ''}`, req.sesion.usuario).catch(() => {});
    res.send(buf);
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/pagos/asignar', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const esTallerista = body.es_tallerista === true || body.es_tallerista === 1 || String(body.es_tallerista).toLowerCase() === 'true';
    await db.asignarPlanAsistente(String(body.dni || '').trim(), Number(body.plan_id), esTallerista);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/pagos/:asistentePlanId/tallerista', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { asistentePlanId } = req.params;
    if (!esIdValido(asistentePlanId)) throw new db.HttpError(400, 'ID inválido.');
    const body = req.body || {};
    const esTallerista = body.es_tallerista === true || body.es_tallerista === 1 || String(body.es_tallerista).toLowerCase() === 'true';
    await db.actualizarEsTalleristaAsistente(Number(asistentePlanId), esTallerista);
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

// Recordatorio de pago de cuota por email (usa el email del encuentro)
app.post('/api/admin/pagos/:id/recordatorio', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const planes = await db.listarPagos();
    const a = planes.find((x) => Number(x.asistentePlanId) === Number(id));
    if (!a) throw new db.HttpError(404, 'Registro de pago no encontrado.');
    const email = String(a.email || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new db.HttpError(400, 'El asistente no tiene un email válido registrado.');
    }
    const n = Number(a.cantidadCuotas) || 1;
    const detalle = Array.isArray(a.cuotasDetalle) ? a.cuotasDetalle : [];
    const pagadas = new Set((Array.isArray(a.cuotas) ? a.cuotas : []).map((c) => Number(c.numero)));
    const montoDe = (num) => {
      const info = detalle.find((c) => Number(c.numero) === Number(num));
      if (info && info.monto != null) return Number(info.monto) || 0;
      return (Number(a.montoTotal) || 0) / n;
    };
    let num = req.body && req.body.cuota !== undefined ? Number(req.body.cuota) : NaN;
    if (!Number.isInteger(num) || num < 1 || num > n) {
      num = NaN;
      for (let i = 1; i <= n; i++) {
        if (!pagadas.has(i)) { num = i; break; }
      }
      if (!Number.isInteger(num)) throw new db.HttpError(400, 'El asistente ya tiene todas las cuotas pagadas.');
    } else if (pagadas.has(num)) {
      throw new db.HttpError(400, `La cuota ${num} ya figura como pagada.`);
    }
    const infoCuota = detalle.find((c) => Number(c.numero) === num);
    const totalEsperado = detalle.length
      ? detalle.reduce((s, c) => s + (Number(c.monto) || 0), 0)
      : Number(a.montoTotal) || 0;
    const totalPagado = (Array.isArray(a.cuotas) ? a.cuotas : []).reduce((s, c) => s + (Number(c.monto) || 0), 0);
    const esTallerista = Boolean(a.esTallerista || a.es_tallerista);
    const resultado = await notificaciones.notificarRecordatorioCuota({
      email,
      nombre: a.nombre || '',
      apellido: a.apellido || '',
      dni: String(a.dni || ''),
      planNombre: a.planNombre || `Plan #${a.planId}`,
      modo: esTallerista ? 'Tallerista 50%' : 'Estándar',
      numeroCuota: num,
      cantidadCuotas: n,
      montoCuota: montoDe(num),
      fechaTope: (infoCuota && infoCuota.fecha_tope) || '',
      totalEsperado,
      totalPagado,
      saldo: totalEsperado - totalPagado,
      detalleCuotas: detalle.map((c) => ({
        numero: Number(c.numero),
        monto: Number(c.monto) || 0,
        fechaTope: c.fecha_tope || '',
        pagada: pagadas.has(Number(c.numero)),
      })),
    });
    await db.registrarEvento(
      'recordatorio_cuota',
      `Recordatorio cuota ${num}/${n} enviado a ${a.apellido || ''} ${a.nombre || ''} (DNI ${a.dni}, ${email}) - plan ${a.planNombre || a.planId}${resultado && resultado.simulado ? ' (simulado, sin SMTP)' : ''}`,
      req.sesion.usuario
    );
    res.json({ ok: true, email, cuota: num, simulado: Boolean(resultado && resultado.simulado) });
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

// Edición y eliminación de registro en Pagos y Cuotas (corrige DNIs 7x etc)
app.put('/api/admin/pagos/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const body = req.body || {};
    const dni = String(body.dni || '').replace(/\D/g,'');
    const planId = body.plan_id !== undefined ? Number(body.plan_id) : undefined;
    const esTallerista = body.es_tallerista === true || body.es_tallerista === 1 || String(body.es_tallerista).toLowerCase() === 'true';
    // permitir actualizar solo tallerista si no se manda dni/plan
    const payload = {};
    if (dni) payload.dni = dni;
    if (planId !== undefined) payload.planId = planId;
    payload.esTallerista = esTallerista;
    // Si no se manda dni ni plan, igual actualizar tallerista
    if (!dni && planId === undefined) {
      await db.actualizarEsTalleristaAsistente(Number(id), esTallerista);
      return res.json({ ok: true });
    }
    // Si falta alguno, tomar existente
    const existente = await db.queryOne('SELECT dni, plan_id FROM asistente_planes WHERE id = ?', [id]);
    if (!existente) throw new db.HttpError(404, 'Registro no encontrado.');
    await db.actualizarAsistentePlan(Number(id), { dni: dni || existente.dni, planId: planId !== undefined ? planId : existente.plan_id, esTallerista });
    await db.registrarEvento('pago_editado', `Registro de pago #${id} editado: DNI ${dni || existente.dni} plan ${planId || existente.plan_id}`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/admin/pagos/:id', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    await db.eliminarAsistentePlan(Number(id));
    await db.registrarEvento('pago_eliminado', `Registro de pago #${id} eliminado`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// Comprobantes por cuota (hasta cantidadCuotas archivos: 2 o 3 según plan)
app.get('/api/admin/pagos/:asistentePlanId/cuota/:numero/comprobante', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { asistentePlanId, numero } = req.params;
    if (!esIdValido(asistentePlanId)) throw new db.HttpError(400, 'ID inválido.');
    const num = Number(numero);
    if (!Number.isInteger(num) || num < 1) throw new db.HttpError(400, 'Número de cuota inválido.');
    const fila = await db.queryOne('SELECT comprobante, comprobante_nombre, comprobante_tipo FROM pagos_cuotas WHERE asistente_plan_id = ? AND numero_cuota = ?', [asistentePlanId, num]);
    if (!fila || !fila.comprobante) throw new db.HttpError(404, 'Sin comprobante para esa cuota.');
    const url = getComprobanteUrl(fila.comprobante);
    if (/^https?:\/\//.test(url)) return res.redirect(url);
    const localPath = path.join(COMPROBANTES_DIR, path.basename(fila.comprobante));
    if (!fs.existsSync(localPath)) throw new db.HttpError(404, 'Archivo no encontrado.');
    res.set('Content-Disposition', `inline; filename="${(fila.comprobante_nombre || fila.comprobante).replace(/"/g,'')}"`);
    if (fila.comprobante_tipo) res.set('Content-Type', fila.comprobante_tipo);
    res.sendFile(localPath);
  } catch (e) { next(e); }
});

app.post('/api/admin/pagos/:asistentePlanId/cuota/:numero/comprobante', requireAuth, requirePermiso('perm_inscripciones'), uploadComprobante.single('comprobante'), async (req, res, next) => {
  try {
    const { asistentePlanId, numero } = req.params;
    if (!esIdValido(asistentePlanId)) throw new db.HttpError(400, 'ID inválido.');
    const num = Number(numero);
    if (!Number.isInteger(num) || num < 1) throw new db.HttpError(400, 'Número de cuota inválido.');
    if (!req.file) throw new db.HttpError(400, 'Seleccioná un archivo (imagen o PDF, máx 8 MB).');
    const nombreArchivo = await uploadComprobanteToStorage(req.file);
    await db.actualizarComprobanteCuota(Number(asistentePlanId), num, nombreArchivo, req.file.originalname || nombreArchivo, req.file.mimetype || '');
    await db.registrarEvento('comprobante_cuota_subido', `Comprobante cuota ${num} subido para asistente_plan #${asistentePlanId} - ${req.file.originalname}`, req.sesion.usuario);
    res.json({ ok: true, comprobante: getComprobanteUrl(nombreArchivo) });
  } catch (e) { next(e); }
});

app.delete('/api/admin/pagos/:asistentePlanId/cuota/:numero/comprobante', requireAuth, requirePermiso('perm_inscripciones'), async (req, res, next) => {
  try {
    const { asistentePlanId, numero } = req.params;
    if (!esIdValido(asistentePlanId)) throw new db.HttpError(400, 'ID inválido.');
    const num = Number(numero);
    await db.eliminarComprobanteCuota(Number(asistentePlanId), num);
    await db.registrarEvento('comprobante_cuota_eliminado', `Comprobante cuota ${num} eliminado para asistente_plan #${asistentePlanId}`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.get('/api/admin/encuentro', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const personas = await db.listarEncuentro();
    res.json({ total: personas.length, personas });
  } catch (e) {
    next(e);
  }
});

app.post('/api/admin/encuentro/import', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
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

// Ruta legacy que recibe los datos desde Google Sheets (compatibilidad, ya no necesaria con form nativo POST /api/encuentro)
app.post('/api/admin/insertar-datos', requireApiKey, async (req, res, next) => {
  try {
    const { datos } = req.body || {};
    if (!Array.isArray(datos) || datos.length === 0) {
      return res.status(400).json({ error: 'No se recibieron datos.' });
    }
    const { personas, invalidos, conCabecera } = filasSheetsAObjetos(datos);
    if (personas.length === 0) {
      return res.status(400).json({
        error: `No se encontraron DNIs válidos en los datos recibidos${invalidos ? ` (${invalidos} inválidos)` : ''}.`,
      });
    }
    const { importados, existentes } = await db.importarEncuentro(personas);
    db.registrarEvento(
      'encuentro_importado_sheet',
      `Importación desde Google Sheets: ${importados} nuevos, ${existentes} actualizados, ${invalidos} inválidos`,
      'google_sheets'
    ).catch((e) => console.error('Error al registrar evento:', e.message));
    res.json({
      ok: true,
      importados,
      existentes,
      invalidos,
      conCabecera,
      total: await db.contarEncuentro(),
    });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/encuentro/:id', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const body = req.body || {};
    const fila = await db.queryOne('SELECT dni, nombre, apellido, marca_temporal FROM encuentro_inscripciones WHERE id = ?', [id]);
    await db.actualizarEncuentroPersona(id, {
      nombre: body.nombre,
      apellido: body.apellido,
      email: body.email,
      telefono: body.telefono,
      fechaNacimiento: body.fecha_nacimiento,
      provincia: body.provincia,
      ciudad: body.ciudad,
      ocupacion: body.ocupacion,
      opcionPago: body.opcion_pago,
      marcaTemporal: body.marca_temporal,
    });
    await db.asignarPlanAutomaticoAsistente(fila ? fila.dni : '', body.marca_temporal);
    await db.registrarEvento(
      'encuentro_modificado',
      `Registro del encuentro actualizado: ${fila ? `${fila.nombre} ${fila.apellido} (DNI ${fila.dni})` : `id ${id}`}`,
      req.sesion.usuario
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.delete('/api/admin/encuentro/:id', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const fila = await db.queryOne('SELECT dni, nombre, apellido FROM encuentro_inscripciones WHERE id = ?', [id]);
    await db.ocultarEncuentroPersona(id);
    if (fila) {
      await db.registrarEvento(
        'encuentro_ocultado',
        `Registro del encuentro ocultado: ${fila.nombre} ${fila.apellido} (DNI ${fila.dni})`,
        req.sesion.usuario
      );
    }
    res.json({ ok: true });
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

// Servir comprobante con auth (local o Supabase public url)
app.get('/api/admin/encuentro/:id/comprobante', requireAuth, requirePermiso('perm_encuentro'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    const fila = await db.queryOne('SELECT comprobante, comprobante_nombre, comprobante_tipo FROM encuentro_inscripciones WHERE id = ?', [id]);
    if (!fila || !fila.comprobante) throw new db.HttpError(404, 'Sin comprobante.');
    const url = getComprobanteUrl(fila.comprobante);
    // Si es Supabase, redirigir
    if (/^https?:\/\//.test(url)) return res.redirect(url);
    // Local: servir archivo
    const localPath = path.join(COMPROBANTES_DIR, path.basename(fila.comprobante));
    if (!fs.existsSync(localPath)) throw new db.HttpError(404, 'Archivo no encontrado.');
    res.set('Content-Disposition', `inline; filename="${(fila.comprobante_nombre || fila.comprobante).replace(/"/g,'')}"`);
    if (fila.comprobante_tipo) res.set('Content-Type', fila.comprobante_tipo);
    res.sendFile(localPath);
  } catch (e) { next(e); }
});

// Subir / reemplazar comprobante por ID de encuentro (admin agrega cuando falta)
app.post('/api/admin/encuentro/:id/comprobante', requireAuth, requirePermiso('perm_encuentro'), uploadComprobante.single('comprobante'), async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    if (!req.file) throw new db.HttpError(400, 'Seleccioná un archivo de comprobante (imagen o PDF, máx 8 MB).');
    const fila = await db.queryOne('SELECT id, dni, nombre, apellido FROM encuentro_inscripciones WHERE id = ?', [id]);
    if (!fila) throw new db.HttpError(404, 'Registro del encuentro no encontrado.');
    const nombreArchivo = await uploadComprobanteToStorage(req.file);
    await db.actualizarComprobantePorId(id, nombreArchivo, req.file.originalname || nombreArchivo, req.file.mimetype || '');
    await db.registrarEvento('comprobante_subido', `Comprobante subido para ${fila.nombre} ${fila.apellido} (DNI ${fila.dni}) - ${req.file.originalname}`, req.sesion.usuario);
    res.json({ ok: true, comprobante: getComprobanteUrl(nombreArchivo) });
  } catch (e) { next(e); }
});

// Subir comprobante por DNI (usado desde Gestión de pagos y cuotas)
// Permite a admin agregar comprobante a asistentes que no lo subieron al inscribirse
app.post('/api/admin/pagos/comprobante', requireAuth, requirePermiso('perm_inscripciones'), uploadComprobante.single('comprobante'), async (req, res, next) => {
  try {
    const dni = String(req.body.dni || req.body.DNI || '').replace(/\D/g,'');
    if (!/^\d{7,8}$/.test(dni)) throw new db.HttpError(400, 'DNI inválido (7 u 8 dígitos).');
    if (!req.file) throw new db.HttpError(400, 'Seleccioná un archivo de comprobante (imagen o PDF, máx 8 MB).');
    const nombreArchivo = await uploadComprobanteToStorage(req.file);
    const resultado = await db.actualizarComprobantePorDni(dni, nombreArchivo, req.file.originalname || nombreArchivo, req.file.mimetype || '');
    const fila = await db.queryOne('SELECT nombre, apellido FROM encuentro_inscripciones WHERE dni = ?', [dni]);
    await db.registrarEvento('comprobante_subido', `Comprobante subido por DNI ${dni}${fila ? ` (${fila.nombre} ${fila.apellido})` : ''} - ${req.file.originalname}`, req.sesion.usuario);
    res.json({ ok: true, dni, encuentroId: resultado.id, comprobante: getComprobanteUrl(nombreArchivo) });
  } catch (e) { next(e); }
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
  // Si hay Supabase configurado, intentar usarlo; si no, guardar local
  const useSupabase = process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage;
  if (useSupabase) {
    try {
      const storagePath = supabaseFotoPath(name);
      const { error } = await supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) return name;
      console.warn('[Storage] Supabase falló, usando filesystem local:', error.message);
    } catch (e) {
      console.warn('[Storage] Supabase error, usando filesystem local:', e.message);
    }
  }
  ensureUploadsDir();
  const dest = path.join(UPLOADS_DIR, name);
  await fs.promises.writeFile(dest, file.buffer);
  return name;
}

async function deleteFotoPonente(foto) {
  if (!foto) return;
  // Intentar borrar de Supabase si está configurado
  if (process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage) {
    try {
      const storagePath = supabaseFotoPath(foto);
      await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([storagePath]);
    } catch (_) { /* noop */ }
  }
  // Siempre intentar borrar local (tanto en uploads/ como en uploads/ponentes legacy)
  try {
    for (const dir of [UPLOADS_DIR, UPLOADS_DIR_LEGACY]) {
      const localPath = path.join(dir, path.basename(foto));
      if (fs.existsSync(localPath)) await fs.promises.unlink(localPath);
    }
  } catch (_) { /* noop */ }
}

function getFotoUrl(foto) {
  if (!foto) return null;
  // Si hay Supabase configurado, devolver URL pública; si no, ruta local
  if (process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage) {
    try {
      const { data } = supabaseAdmin.storage
        .from(STORAGE_BUCKET)
        .getPublicUrl(supabaseFotoPath(foto));
      if (data?.publicUrl && !data.publicUrl.includes('supabase.co/undefined')) return data.publicUrl;
    } catch (_) { /* fallback local */ }
  }
  // Archivo local servido por express.static -> /uploads/<file>
  // Compatibilidad: si existe en legacy /uploads/ponentes, usar esa ruta
  const base = path.basename(foto);
  try {
    if (fs.existsSync(path.join(UPLOADS_DIR_LEGACY, base))) return `/uploads/ponentes/${base}`;
  } catch (_) {}
  return `/uploads/${base}`;
}

const parseDiaValido = (v, def) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const parseDiaFecha = (v, def) => {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : def;
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
    const skipSync = String(body.skipSync || body.esSegundo || body.segundo || '').trim().toLowerCase();
    const debeSincronizar = !(skipSync === '1' || skipSync === 'true' || skipSync === 'si');
    if (debeSincronizar) await db.sincronizarTalleresDesdePonentes();
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
      orden: existente.orden ?? 0,
    });
    const skipSyncPut = String(body.skipSync || body.esSegundo || body.segundo || '').trim().toLowerCase();
    const debeSincronizarPut = !(skipSyncPut === '1' || skipSyncPut === 'true' || skipSyncPut === 'si');
    if (debeSincronizarPut) await db.sincronizarTalleresDesdePonentes();
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

// ── Auspiciantes ("Nos Acompañan") ──────────────────────────────────────

const AUSPICIANTES_DIR = path.join(UPLOADS_DIR, 'auspiciantes');
function ensureAuspiciantesDir() { if (!fs.existsSync(AUSPICIANTES_DIR)) fs.mkdirSync(AUSPICIANTES_DIR, { recursive: true }); }
const uploadAuspiciante = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten archivos de imagen'));
  },
});
function supabaseAuspiciantePath(filename) { return `auspiciantes/${filename}`; }
async function uploadImagenAuspiciante(file) {
  const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
  const name = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const useSupabase = process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage;
  if (useSupabase) {
    try {
      const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).upload(supabaseAuspiciantePath(name), file.buffer, { contentType: file.mimetype, upsert: false });
      if (!error) return name;
      console.warn('[Storage auspiciante] Supabase falló, usando filesystem local:', error.message);
    } catch (e) { console.warn('[Storage auspiciante] Supabase error:', e.message); }
  }
  ensureAuspiciantesDir();
  await fs.promises.writeFile(path.join(AUSPICIANTES_DIR, name), file.buffer);
  return name;
}
async function deleteImagenAuspiciante(imagen) {
  if (!imagen) return;
  if (process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage) {
    try { await supabaseAdmin.storage.from(STORAGE_BUCKET).remove([supabaseAuspiciantePath(imagen)]); } catch (_) {}
  }
  try {
    for (const dir of [AUSPICIANTES_DIR, UPLOADS_DIR]) {
      const localPath = path.join(dir, path.basename(imagen));
      if (fs.existsSync(localPath)) await fs.promises.unlink(localPath);
    }
  } catch (_) {}
}
function getAuspicianteUrl(imagen) {
  if (!imagen) return '';
  if (/^https?:\/\//.test(imagen)) return imagen;
  if (process.env.SUPABASE_URL && supabaseAdmin && supabaseAdmin.storage) {
    try {
      const { data } = supabaseAdmin.storage.from(STORAGE_BUCKET).getPublicUrl(supabaseAuspiciantePath(imagen));
      if (data?.publicUrl && !data.publicUrl.includes('supabase.co/undefined')) return data.publicUrl;
    } catch (_) {}
  }
  const base = path.basename(imagen);
  try {
    if (fs.existsSync(path.join(AUSPICIANTES_DIR, base))) return `/uploads/auspiciantes/${base}`;
  } catch (_) {}
  return `/uploads/auspiciantes/${base}`;
}

// Pública: lista de auspiciantes para la página de inscripción a talleres
app.get('/api/auspiciantes', async (req, res, next) => {
  try {
    const filas = await db.listarAuspiciantes();
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.json(filas.map((a) => ({ id: Number(a.id), nombre: a.nombre || '', imagen: getAuspicianteUrl(a.imagen) })));
  } catch (e) { next(e); }
});

app.get('/api/admin/auspiciantes', requireAuth, async (req, res, next) => {
  try {
    const filas = await db.listarAuspiciantes();
    res.json(filas.map((a) => ({ id: Number(a.id), nombre: a.nombre || '', imagen: getAuspicianteUrl(a.imagen), archivo: a.imagen || '' })));
  } catch (e) { next(e); }
});

app.post('/api/admin/auspiciantes', requireAuth, uploadAuspiciante.single('imagen'), async (req, res, next) => {
  try {
    if (!req.file) throw new db.HttpError(400, 'Seleccioná una imagen (PNG/JPG).');
    const nombre = String((req.body || {}).nombre || '').trim();
    const imagen = await uploadImagenAuspiciante(req.file);
    const id = await db.crearAuspiciante({ nombre, imagen });
    await db.registrarEvento('auspiciante_creado', `Auspiciante creado: "${nombre || imagen}"`, req.sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) { next(e); }
});

app.delete('/api/admin/auspiciantes/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de auspiciante inválido.');
    const existente = await db.obtenerAuspiciante(id);
    if (!existente) throw new db.HttpError(404, 'Auspiciante no encontrado.');
    await db.eliminarAuspiciante(id);
    await deleteImagenAuspiciante(existente.imagen);
    await db.registrarEvento('auspiciante_eliminado', `Auspiciante eliminado: "${existente.nombre || existente.imagen}"`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Programa (admin CRUD bloques) ──────────────────────────────────────

app.get('/api/admin/programa', requireAuth, async (req, res, next) => {
  try {
    const [bloques, asistentes, capacidadRaw] = await Promise.all([
      db.listarPrograma(),
      db.contarAsistentesUnicos(),
      db.obtenerConfig('capacidad_locacion'),
    ]);
    const capacidad = Math.max(0, Number.parseInt(capacidadRaw, 10) || 0);
    res.json({ bloques, capacidad, asistentes });
  } catch (e) {
    next(e);
  }
});

const parseBloquePayload = (body, existente = {}) => {
  const base = {
    dia: parseDiaFecha(body.dia, existente.dia || ''),
    hora_inicio: String(body.hora_inicio ?? existente.hora_inicio ?? '').trim(),
    hora_fin: String(body.hora_fin ?? existente.hora_fin ?? '').trim(),
    tipo: String(body.tipo ?? existente.tipo ?? 'general').trim(),
    titulo: String(body.titulo ?? existente.titulo ?? '').trim(),
    descripcion: String(body.descripcion ?? existente.descripcion ?? '').trim(),
    icono: String(body.icono ?? existente.icono ?? '').trim(),
    orden: Number(body.orden) || existente.orden || 0,
  };
  // ponentes múltiples (para ponencia/conversatorio/talleres)
  let ponentes = undefined;
  if (body.ponentes !== undefined || body.ponenteIds !== undefined || body.ponentes_ids !== undefined) {
    const raw = body.ponentes ?? body.ponenteIds ?? body.ponentes_ids ?? [];
    if (Array.isArray(raw)) ponentes = raw.map(n=> Number(n)).filter(n=> Number.isInteger(n) && n>0);
    else if (typeof raw === 'string') ponentes = raw.split(',').map(s=> Number(s.trim())).filter(n=> Number.isInteger(n) && n>0);
    else ponentes = [];
  }
  if (ponentes !== undefined) base.ponentes = ponentes;
  return base;
};

app.post('/api/admin/programa/bloques', requireAuth, async (req, res, next) => {
  try {
    const body = parseBloquePayload(req.body || {});
    if (!body.titulo) throw new db.HttpError(400, 'El título es obligatorio.');
    // validar ponentes si se enviaron
    if (body.ponentes) {
      for (const pid of body.ponentes) {
        const p = await db.obtenerPonente(pid);
        if (!p) throw new db.HttpError(400, `Ponente ${pid} no existe.`);
      }
    }
    const id = await db.crearBloque(body);
    await db.registrarEvento('config_modificada', `Bloque de programa creado: "${body.titulo}"`, req.sesion.usuario);
    res.status(201).json({ ok: true, id });
  } catch (e) {
    next(e);
  }
});

app.put('/api/admin/programa/bloques/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de bloque inválido.');
    const existente = await db.obtenerBloque(id);
    if (!existente) throw new db.HttpError(404, 'Bloque no encontrado.');
    const body = parseBloquePayload(req.body || {}, existente);
    if (!body.titulo) throw new db.HttpError(400, 'El título es obligatorio.');
    if (body.ponentes) {
      for (const pid of body.ponentes) {
        const p = await db.obtenerPonente(pid);
        if (!p) throw new db.HttpError(400, `Ponente ${pid} no existe.`);
      }
    }
    await db.actualizarBloque(id, { ...body, datos: existente.datos, ponentes: body.ponentes, ponenteIds: body.ponentes });
    await db.registrarEvento('config_modificada', `Bloque de programa actualizado: "${body.titulo}"`, req.sesion.usuario);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ── Bloque ↔ Ponentes (múltiples ponentes por ponencia/conversatorio/taller) ───────────
app.get('/api/admin/programa/bloques/:id/ponentes', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de bloque inválido.');
    const bloque = await db.obtenerBloque(id);
    if (!bloque) throw new db.HttpError(404, 'Bloque no encontrado.');
    res.json({ bloque_id: Number(id), ponentes: bloque.ponentes || [], ponentes_ids: bloque.ponentes_ids || [] });
  } catch (e) { next(e); }
});

app.put('/api/admin/programa/bloques/:id/ponentes', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de bloque inválido.');
    const bloque = await db.obtenerBloque(id);
    if (!bloque) throw new db.HttpError(404, 'Bloque no encontrado.');
    const body = req.body || {};
    let ponenteIds = [];
    if (Array.isArray(body.ponenteIds)) ponenteIds = body.ponenteIds;
    else if (Array.isArray(body.ponentes)) ponenteIds = body.ponentes;
    else if (Array.isArray(body.ponentes_ids)) ponenteIds = body.ponentes_ids;
    else if (body.ponente_ids) ponenteIds = String(body.ponente_ids).split(',').map(s=> s.trim()).filter(Boolean);
    ponenteIds = ponenteIds.map(n=> Number(n)).filter(n=> Number.isInteger(n) && n>0);
    for (const pid of ponenteIds) {
      const p = await db.obtenerPonente(pid);
      if (!p) throw new db.HttpError(400, `Ponente ${pid} no existe.`);
    }
    await db.setBloquePonentes(Number(id), ponenteIds);
    await db.registrarEvento('bloque_ponentes_actualizado', `Bloque #${id} ponentes: ${ponenteIds.join(',')||'ninguno'}`, req.sesion.usuario);
    const actualizado = await db.obtenerBloque(id);
    res.json({ ok: true, ponentes: actualizado.ponentes || [] });
  } catch (e) { next(e); }
});

app.delete('/api/admin/programa/bloques/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID de bloque inválido.');
    await db.eliminarBloque(id);
    await db.registrarEvento('config_modificada', `Bloque de programa eliminado (#${id})`, req.sesion.usuario);
    res.json({ ok: true });
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

app.get('/api/admin/notificaciones/:id/leidos', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!esIdValido(id)) throw new db.HttpError(400, 'ID inválido.');
    res.json(await db.listarNotificacionLectores(id));
  } catch (e) { next(e); }
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

app.post('/api/mobile/notificaciones', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) {
      return res.status(401).json({ error: 'No autorizado.' });
    }
    if (sesion.rol !== 'admin') {
      return res.status(403).json({ error: 'Solo el administrador puede enviar notificaciones.' });
    }
    const { titulo, mensaje, tipo } = validarNotificacion(req.body || {});
    const id = await db.crearNotificacion({
      titulo,
      mensaje,
      tipo,
      activa: true,
      creadoPor: sesion.usuario,
    });
    await db.registrarEvento('notificacion_creada', `Notificación creada desde app móvil: "${titulo}" (${tipo})`, sesion.usuario);
    res.status(201).json({ ok: true, id });
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


// ── Móvil Fase 1-4: Menú, Talleres, Resumen Día, Asignaciones ─────────

app.post('/api/mobile/menu/entregar', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    // Menu y superior requieren perm acreditacion, admin/superior bypass parcial
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') {
      const u = await db.buscarUsuario(sesion.usuario);
      if (!u || !u.perm_acreditacion) return res.status(403).json({ error: 'Sin permiso de acreditación.' });
    }
    const { codigo, dni } = extraerDatosQr((req.body || {}).codigo || (req.body || {}).dni);
    let persona = null;
    if (codigo) persona = await db.queryOne('SELECT dni, nombre, apellido, alimentacion, qr_code FROM inscripciones WHERE qr_code = ? LIMIT 1', [codigo]);
    if (!persona && dni && /^\d{7,8}$/.test(dni)) persona = await db.buscarAcreditacionPorDni(dni) || await db.queryOne('SELECT dni, nombre, apellido, alimentacion, qr_code FROM inscripciones WHERE dni=? LIMIT 1', [dni]);
    if (!persona) return res.status(404).json({ error: 'Asistente no encontrado.' });
    const servicioActivo = await db.obtenerServicioComidaActivo(30*60*1000);
    if (!servicioActivo) return res.status(400).json({ error: 'Fuera del horario de servicio (30min margen).' });
    const yaRetirado = await db.tieneAsistenciaComida(persona.dni, servicioActivo.id);
    if (yaRetirado) return res.json({ ok: false, yaRetirado: true, mensaje: 'Ya retiró su porción de ' + servicioActivo.titulo });
    await db.registrarAsistenciaComida(persona.dni, servicioActivo.id);
    await db.registrarEvento('menu_entregado', `Menú entregado a ${persona.nombre} ${persona.apellido} (DNI ${persona.dni}) servicio ${servicioActivo.titulo}`, sesion.usuario).catch(()=>{});
    res.json({ ok: true, dni: persona.dni, servicio: { id: servicioActivo.id, titulo: servicioActivo.titulo, categoria: clasificarServicioComida(servicioActivo.titulo) } });
  } catch (e) { next(e); }
});

app.get('/api/mobile/menu/resumen', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    const data = await db.resumenComidas().catch(()=>null);
    if (!data) return res.json({ servicios: [] });
    // filtrar servicios del día actual
    const hoy = new Date().toISOString().slice(0,10);
    const serviciosHoy = (data.servicios || []).filter(s => s.dia === hoy);
    res.json({ ok: true, servicios: data.servicios, serviciosHoy, totalInscriptos: data.totalInscriptos, inscriptosPorDieta: data.inscriptosPorDieta });
  } catch (e) { next(e); }
});

app.get('/api/mobile/operadores', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') return res.status(403).json({ error: 'Solo admin/superior.' });
    const filas = await db.query("SELECT username, nombre, rol, activo FROM usuarios WHERE rol='operador' AND activo=TRUE ORDER BY username");
    res.json({ ok: true, operadores: filas.map(u=>({ username: u.username, nombre: u.nombre, rol: u.rol })) });
  } catch (e) { next(e); }
});

app.get('/api/mobile/talleres', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    const talleres = await db.listarTalleres();
    res.json({ ok: true, talleres });
  } catch (e) { next(e); }
});

// Dashboard web espejo para móvil: mismos 5 sources que admin.js cargarDashboard
app.get('/api/mobile/dashboard/talleres', async (req, res, next) => {
  try {
    const s=sesionMovilValida(req); if(!s) return res.status(401).json({error:'No autorizado.'});
    const t=await db.listarTalleres(); res.json(t.map(x=>({...x, inscriptos:Number(x.inscriptos), cupo:Number(x.cupo), duracion_hs:Number(x.duracion_hs), pareja_id:x.pareja_id?Number(x.pareja_id):null})));
  } catch(e){next(e);}
});
app.get('/api/mobile/dashboard/inscripciones', async (req, res, next) => {
  try {
    const s=sesionMovilValida(req); if(!s) return res.status(401).json({error:'No autorizado.'});
    const l=await db.listarInscripciones(); res.json(l.map(i=>({...i,en_encuentro:Boolean(i.en_encuentro)})));
  } catch(e){next(e);}
});
app.get('/api/mobile/dashboard/asistentes', async (req, res, next) => {
  try {
    const s=sesionMovilValida(req); if(!s) return res.status(401).json({error:'No autorizado.'});
    const l=await db.listarAsistentes(); res.json(l.map(a=>({dni:a.dni,nombre:a.nombre,apellido:a.apellido,email:a.email,telefono:a.telefono||'',alimentacion:a.alimentacion||'sin_restriccion',en_encuentro:Boolean(a.en_encuentro),estado_pago:a.estado_pago||'no_pagado',creado_en:a.creado_en,cantidad_talleres:Number(a.cantidad_talleres),talleres_nombres:a.talleres_nombres||'',talleres_ids:a.talleres_ids||''})));
  } catch(e){next(e);}
});
app.get('/api/mobile/dashboard/encuentro', async (req, res, next) => {
  try {
    const s=sesionMovilValida(req); if(!s) return res.status(401).json({error:'No autorizado.'});
    const personas=await db.listarEncuentro(); res.json({total:personas.length, personas});
  } catch(e){next(e);}
});
app.get('/api/mobile/dashboard/pagos', async (req, res, next) => {
  try {
    const s=sesionMovilValida(req); if(!s) return res.status(401).json({error:'No autorizado.'});
    res.json(await db.listarPagos());
  } catch(e){next(e);}
});

app.get('/api/mobile/talleres/asignados', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol === 'admin' || sesion.rol === 'superior') {
      const talleres = await db.listarTalleres();
      return res.json({ talleres });
    }
    // operador: buscar asignaciones propias; fallback: todos
    try {
      const asign = await db.query('SELECT taller_id FROM operador_taller_asignaciones WHERE operador_username=?', [sesion.usuario]);
      if (asign.length > 0) {
        const ids = asign.map(a=>Number(a.taller_id));
        const talleres = await db.query(`SELECT * FROM talleres WHERE id IN (${ids.map(()=> '?').join(',')})`, ids);
        return res.json({ talleres });
      }
    } catch (_) {}
    const talleres = await db.listarTalleres();
    res.json({ talleres: talleres.slice(0, 5) });
  } catch (e) { next(e); }
});

app.post('/api/mobile/taller/asistencia', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    const { codigo, dni: dniBody, tallerId, tipo } = req.body || {};
    const taller_id = Number(tallerId || taller_id);
    const tipoNorm = String(tipo||'ingreso').toLowerCase() === 'egreso' ? 'egreso' : 'ingreso';
    if (!taller_id) return res.status(400).json({ error: 'tallerId requerido.' });
    let dni = String(dniBody||'').replace(/\D/g,'');
    if (!dni) {
      const ext = extraerDatosQr(codigo);
      dni = ext.dni || ext.codigo.replace(/\D/g,'');
    }
    if (!/^\d{7,8}$/.test(dni)) return res.status(400).json({ error: 'DNI inválido (7-8 dígitos) o QR no reconocido.' });
    // verificar inscripción al taller (permitir si admin/superior)
    const insc = await db.queryOne('SELECT id FROM inscripciones WHERE dni=? AND taller_id=? LIMIT 1', [dni, taller_id]);
    if (!insc && sesion.rol === 'operador') {
      // operador solo puede marcar a inscriptos
      return res.status(404).json({ error: 'El DNI no está inscripto en ese taller.' });
    }
    // intentar insertar en taller_asistencias si existe tabla
    try {
      await db.query('INSERT INTO taller_asistencias (dni, taller_id, tipo, usuario) VALUES (?,?,?,?)', [dni, taller_id, tipoNorm, sesion.usuario]);
    } catch (e) {
      if (String(e.message).includes('no existe') || String(e.message).includes('does not exist') || e.code==='42P01') {
        // fallback: registrar como evento y acreditacion
        await db.registrarEvento('asistencia_taller', `${tipoNorm} DNI ${dni} taller ${taller_id} por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
        return res.json({ ok: true, fallback: true, mensaje: 'Registrado (fallback sin tabla taller_asistencias)' });
      }
      if (e.code==='23505') return res.status(409).json({ error: `Ya se registró ${tipoNorm} para ese DNI/taller/bloque.` });
      throw e;
    }
    await db.registrarEvento('asistencia_taller', `${tipoNorm} DNI ${dni} taller ${taller_id} por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
    res.json({ ok: true, dni, taller_id, tipo: tipoNorm });
  } catch (e) { next(e); }
});

app.get('/api/mobile/talleres/:id/estado', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const taller = await db.queryOne('SELECT id, nombre, cupo FROM talleres WHERE id=?', [id]);
    if (!taller) return res.status(404).json({ error: 'Taller no encontrado.' });
    const inscriptosRow = await db.queryOne('SELECT COUNT(*) as n FROM inscripciones WHERE taller_id=?', [id]);
    const inscriptos = Number(inscriptosRow?.n || 0);
    let presentes = 0;
    try {
      const p = await db.queryOne("SELECT COUNT(DISTINCT dni) as n FROM taller_asistencias WHERE taller_id=? AND tipo='ingreso'", [id]);
      presentes = Number(p?.n || 0);
    } catch (_) { presentes = Math.min(inscriptos, 0); }
    const cupo = Number(taller.cupo||0);
    res.json({ taller_id: id, taller: taller.nombre, cupo, inscriptos, presentes, faltantes: Math.max(0, cupo - presentes), porcentaje: cupo? Math.round(presentes/cupo*100):0 });
  } catch (e) { next(e); }
});

app.get('/api/mobile/resumen/dia', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    const fecha = String(req.query.fecha || new Date().toISOString().slice(0,10));
    const [totalAcreditados, porTaller, comidas, capacidadLoc, inscriptosEvento, inscriptosTalleres, encuentroPersonas, ultimosRaw, pagosRaw] = await Promise.all([
      db.contarAcreditados().catch(()=>0),
      db.listarAcreditacionesPorTaller().catch(()=>[]),
      db.resumenComidas().catch(()=>({ servicios: [] })),
      db.obtenerConfig('capacidad_locacion').catch(()=>null),
      db.contarEncuentro().catch(()=>0),
      db.contarAsistentesUnicos().catch(()=>0),
      db.listarEncuentro().catch(()=>[]),
      db.listarInscripciones().catch(()=>[]),
      db.listarPagos().catch(()=>[]),
    ]);
    const totalMenus = comidas.servicios?.reduce((s, b)=> s + Number(b.asistentes||0), 0) || 0;
    // Recaudado idéntico a web: suma cuotas pagadas (admin.js cargarDashboard)
    let recaudado = 0; let cuotasPagadas = 0;
    try {
      for (const ap of (Array.isArray(pagosRaw)? pagosRaw: [])) {
        const cuotas = Array.isArray(ap.cuotas) ? ap.cuotas : [];
        for (const c of cuotas) { recaudado += Number(c.monto)||0; cuotasPagadas++; }
      }
    } catch(_) {}
    // Encuentro con/sin taller — alineado con web (admin.js cargarDashboard)
    let encuentroConTaller = 0;
    let encuentroSin = 0;
    if (Array.isArray(encuentroPersonas) && encuentroPersonas.length) {
      encuentroConTaller = encuentroPersonas.filter(p => p.tiene_talleres).length;
      encuentroSin = Math.max(0, Number(inscriptosEvento||0) - encuentroConTaller);
    } else {
      encuentroConTaller = Number(inscriptosTalleres||0);
      encuentroSin = Math.max(0, Number(inscriptosEvento||0) - encuentroConTaller);
    }
    // Últimos 5 inscriptos (DNI único, más recientes) — igual lógica que renderUltimos5 en admin.js
    let ultimos5 = [];
    try {
      const ordenadas = [...(Array.isArray(ultimosRaw)?ultimosRaw:[])].sort((a,b)=> new Date(b.creado_en||0)-new Date(a.creado_en||0));
      const porDni = new Map();
      for (const row of ordenadas) {
        const dni = String(row.dni||'').trim();
        if (!dni || porDni.has(dni)) continue;
        porDni.set(dni, row);
        if (porDni.size>=5) break;
      }
      ultimos5 = [...porDni.values()].map(r=>{
        const filasDni = ultimosRaw.filter(x=> String(x.dni)===String(r.dni));
        const talleres = [...new Set(filasDni.map(x=> x.taller).filter(Boolean))].join(', ');
        return { dni: String(r.dni), nombre: r.nombre||'', apellido: r.apellido||'', email: r.email||'', taller: talleres|| r.taller||'', estado_pago: r.estado_pago||'no_pagado', creado_en: r.creado_en||'' };
      });
    } catch (_) { ultimos5=[]; }
    res.json({ ok: true, fecha, totalAcreditados, inscriptosEvento, inscriptosTalleres, encuentroConTaller, encuentroSin, totalMenus, recaudado, cuotasPagadas, porTaller: porTaller.map(t=>({ ...t, porcentaje: t.cupo? Math.round(((t.acreditados||0)/t.cupo)*100):0 })), servicios: comidas.servicios, capacidadLocacion: capacidadLoc, ultimos5 });
  } catch (e) { next(e); }
});

app.get('/api/mobile/asignaciones', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') return res.status(403).json({ error: 'Solo admin/superior.' });
    try {
      const filas = await db.query(`
        SELECT a.*, t.nombre as taller_nombre, b.titulo as bloque_titulo
        FROM operador_taller_asignaciones a
        LEFT JOIN talleres t ON t.id=a.taller_id
        LEFT JOIN programa_bloques b ON b.id=a.bloque_id
        ORDER BY a.dia DESC, a.id DESC LIMIT 100`);
      return res.json({ ok: true, asignaciones: filas });
    } catch (_) {
      const filas2 = await db.query('SELECT * FROM operador_taller_asignaciones ORDER BY dia DESC, id DESC LIMIT 100').catch(()=>[]);
      return res.json({ ok: true, asignaciones: filas2 });
    }
  } catch (e) { next(e); }
});

app.post('/api/mobile/asignaciones', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') return res.status(403).json({ error: 'Solo admin/superior.' });
    const { operador, tallerId, dia, bloqueId } = req.body || {};
    const op = String(operador||'').trim().toLowerCase();
    const tid = Number(tallerId);
    const d = String(dia||'').trim();
    if (!op || !tid || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'operador, tallerId y dia YYYY-MM-DD requeridos.' });
    try {
      await db.query('INSERT INTO operador_taller_asignaciones (operador_username, taller_id, dia, bloque_id, creado_por) VALUES (?,?,?,?,?)', [op, tid, d, bloqueId||null, sesion.usuario]);
    } catch (e) {
      if (String(e.message).includes('no existe') || e.code==='42P01') return res.status(503).json({ error: 'Tabla operador_taller_asignaciones no existe. Ejecutá migración 007.' });
      throw e;
    }
    await db.registrarEvento('asignacion_creada', `Asignación ${op} → taller ${tid} día ${d} por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
    res.status(201).json({ ok: true });
  } catch (e) { next(e); }
});

app.put('/api/mobile/asignaciones/:id', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') return res.status(403).json({ error: 'Solo admin/superior.' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const { operador, tallerId, dia, bloqueId } = req.body || {};
    const op = String(operador||'').trim().toLowerCase();
    const tid = Number(tallerId);
    const d = String(dia||'').trim();
    if (!op || !tid || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({ error: 'operador, tallerId y dia YYYY-MM-DD requeridos.' });
    const existe = await db.queryOne('SELECT id FROM operador_taller_asignaciones WHERE id=?', [id]);
    if (!existe) return res.status(404).json({ error: 'Asignación no encontrada.' });
    await db.query('UPDATE operador_taller_asignaciones SET operador_username=?, taller_id=?, dia=?, bloque_id=? WHERE id=?', [op, tid, d, bloqueId||null, id]);
    await db.registrarEvento('asignacion_reasignada', `Reasignación #${id}: ${op} → taller ${tid} día ${d} por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

app.delete('/api/mobile/asignaciones/:id', async (req, res, next) => {
  try {
    const sesion = sesionMovilValida(req);
    if (!sesion) return res.status(401).json({ error: 'No autorizado.' });
    if (sesion.rol !== 'admin' && sesion.rol !== 'superior') return res.status(403).json({ error: 'Solo admin/superior.' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'ID inválido.' });
    const r = await db.query('DELETE FROM operador_taller_asignaciones WHERE id=?', [id]);
    // pg returns rows, check rowCount via mutation? usar query y verificar
    await db.registrarEvento('asignacion_eliminada', `Asignación #${id} eliminada por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ── Certificados ────────────────────────────────────────────────────────
function esAdminOSuperior(req) { const r=req.sesion?.rol; return r==='admin'|| r==='superior'; }

// Helper conf firmas + avales/resoluciones
async function obtenerFirmasConfig() {
  try {
    const cfg = await db.obtenerTodaConfig();
    return {
      firma1_nombre: cfg.certificado_firma1_nombre || 'Referente Nacional Nodo Salta',
      firma1_cargo: cfg.certificado_firma1_cargo || 'Red Dramatiza Salta',
      firma1_imagen: cfg.certificado_firma1_imagen || '',
      firma2_nombre: cfg.certificado_firma2_nombre || 'Referente Provincial Nodo Salta',
      firma2_cargo: cfg.certificado_firma2_cargo || 'Red Dramatiza Salta',
      firma2_imagen: cfg.certificado_firma2_imagen || '',
      aval1: cfg.certificado_aval1 || '',
      aval2: cfg.certificado_aval2 || '',
      aval3: cfg.certificado_aval3 || '',
      aval4: cfg.certificado_aval4 || '',
      titulo: cfg.certificado_titulo || 'Encuentro Dramatiza – Salta 2026',
      lugar: cfg.certificado_lugar || 'Salta, Argentina',
      horas: cfg.certificado_horas_por_taller || '3',
    };
  } catch (_) {
    return { firma1_nombre: 'Referente Nacional Nodo Salta', firma1_cargo: 'Red Dramatiza Salta', firma1_imagen:'', firma2_nombre:'Referente Provincial Nodo Salta', firma2_cargo:'Red Dramatiza Salta', firma2_imagen:'', aval1:'', aval2:'', aval3:'', aval4:'', titulo:'Encuentro Dramatiza – Salta 2026', lugar:'Salta', horas:'3' };
  }
}

app.get('/api/admin/certificados', requireAuth, async (req, res, next) => {
  try {
    const lista = await db.listarCertificados();
    res.set('Cache-Control','no-store');
    res.json(lista.map(c=> ({ ...c, id:Number(c.id), detalle: typeof c.detalle==='string'? JSON.parse(c.detalle||'{}') : c.detalle })));
  } catch(e){ next(e); }
});

app.get('/api/admin/certificados/elegibles', requireAuth, async (req, res, next) => {
  try {
    const asistentes = await db.listarAsistentes();
    const out = [];
    for (const a of asistentes) {
      try {
        const ver = await db.verificarElegibilidadAsistente(a.dni);
        out.push({
          dni: a.dni,
          nombre: a.nombre,
          apellido: a.apellido,
          email: a.email,
          talleres_nombres: a.talleres_nombres,
          talleres_ids: a.talleres_ids,
          cantidad_talleres: Number(a.cantidad_talleres),
          elegible: ver.elegible,
          asistencias: ver.asistencias,
          motivo: ver.motivo || '',
        });
      } catch(e){
        out.push({ dni:a.dni, nombre:a.nombre, apellido:a.apellido, email:a.email, elegible:false, motivo:e.message, asistencias:[] });
      }
    }
    res.json(out);
  } catch(e){ next(e); }
});

app.get('/api/admin/certificados/config', requireAuth, async (req, res, next) => {
  try {
    // solo admin/superior config
    if (!esAdminOSuperior(req) && req.sesion.rol!=='admin') return res.status(403).json({error:'Solo admin/superior'});
    res.json(await obtenerFirmasConfig());
  } catch(e){ next(e); }
});
app.put('/api/admin/certificados/config', requireAuth, async (req, res, next) => {
  try {
    if (!esAdminOSuperior(req) && req.sesion.rol!=='admin') return res.status(403).json({error:'Solo admin/superior'});
    const b = req.body||{};
    const claves = ['certificado_firma1_nombre','certificado_firma1_cargo','certificado_firma2_nombre','certificado_firma2_cargo','certificado_titulo','certificado_lugar','certificado_horas_por_taller','certificado_aval1','certificado_aval2','certificado_aval3','certificado_aval4'];
    for (const k of claves) if (b[k]!==undefined) await db.guardarConfig(k, String(b[k]));
    // compat: permitir avales enviados como certificado_avalN o avalN
    for (let i=1;i<=4;i++) if (b[`aval${i}`]!==undefined) await db.guardarConfig(`certificado_aval${i}`, String(b[`aval${i}`]));
    // imagenes base64 opcional -> guardar como archivos public/firmaX.png
    if (b.firma1_imagen_base64) {
      try {
        const buf = Buffer.from(String(b.firma1_imagen_base64).replace(/^data:image\/\w+;base64,/,''), 'base64');
        const p = path.join(__dirname,'..','public','firma1.png');
        fs.writeFileSync(p, buf);
        await db.guardarConfig('certificado_firma1_imagen','/firma1.png');
      } catch(_){}
    }
    if (b.firma2_imagen_base64) {
      try {
        const buf = Buffer.from(String(b.firma2_imagen_base64).replace(/^data:image\/\w+;base64,/,''), 'base64');
        const p = path.join(__dirname,'..','public','firma2.png');
        fs.writeFileSync(p, buf);
        await db.guardarConfig('certificado_firma2_imagen','/firma2.png');
      } catch(_){}
    }
    await db.registrarEvento('config_modificada','Configuración de certificados actualizada', req.sesion.usuario).catch(()=>{});
    res.json({ ok:true, config: await obtenerFirmasConfig() });
  } catch(e){ next(e); }
});

app.post('/api/admin/certificados/generar', requireAuth, async (req, res, next) => {
  try {
    const sesion = req.sesion;
    // permiso certificados
    if (sesion.rol!=='admin') {
      const u = await db.buscarUsuario(sesion.usuario);
      if (!u || !u.perm_certificados) return res.status(403).json({error:'Sin permiso de certificados'});
    }
    const { tipo, dni, ponenteId, ponente_id, forzar } = req.body||{};
    const tipoNorm = String(tipo||'').trim().toLowerCase();
    if (!['asistente','ponente','tallerista'].includes(tipoNorm)) return res.status(400).json({error:'tipo debe ser asistente, ponente o tallerista'});
    let nombre='', apellido='', email='', detalle={}, talleresIds='', dniNorm='', ponId=null;

    const firmasCfg = await obtenerFirmasConfig();

    // Diferenciar ponente/tallerista por ID (asociado a la persona) vs asistente por DNI
    const tienePonenteId = Number(ponenteId || ponente_id) > 0;
    if (tienePonenteId && (tipoNorm==='ponente' || tipoNorm==='tallerista')) {
      const pid = Number(ponenteId || ponente_id);
      if (!pid) return res.status(400).json({error:'ponenteId requerido'});
      const pon = await db.obtenerPonente(pid);
      if (!pon) return res.status(404).json({error:'Ponente no encontrado'});
      nombre = String(pon.nombre||'').split(' ')[0] || pon.nombre;
      const partes = String(pon.nombre||'').trim().split(/\s+/);
      if (partes.length>=2) { nombre = partes.slice(0,-1).join(' '); apellido = partes.slice(-1).join(' '); } else { nombre = pon.nombre; apellido=''; }
      email='';
      ponId = pid;
      // Diferenciación automática taller/ponencia según tipo asociado a la persona
      const tipoReal = String(pon.tipo||'').toLowerCase();
      const esTaller = tipoReal==='taller';
      // Si el tipo solicitado es tallerista pero la persona es ponencia, o viceversa, se corrige automáticamente
      const tipoEfectivo = esTaller ? 'tallerista' : 'ponente';
      // Guardar tipo efectivo en detalle para el PDF
      detalle = { titulo: pon.titulo||'', descripcion: pon.descripcion||'', tipoPonencia: pon.tipo, dia: pon.dia, horario: pon.horario, esTaller, horas: String(firmasCfg.horas), tipoEfectivo };
      // Sobrescribir tipoNorm al efectivo para que el PDF diga "presentando el taller/ponencia" correctamente
      // Mantener tipoNorm original para registro, pero detalle.tipoEfectivo manda
      if (tipoNorm !== tipoEfectivo) {
        // No error, solo info: se corrige
      }
      // Para la firma/hash y almacenamiento, usar el tipo efectivo
      // Actualizamos tipoNorm localmente para generación posterior (no muta const, usamos variable)
      // Usaremos tipoEfectivo en detalle y en nombre del evento
      // Guardaremos el tipoNorm original pero el PDF usará esTaller
      // Para no complicar, asignamos detalle.tipo = tipoEfectivo
      detalle.tipo = tipoEfectivo;
      // Si es tallerista, el PDF dirá "presentando el taller", si ponente "presentando la ponencia"
      // No necesitamos más
    } else if (tipoNorm==='asistente' || tipoNorm==='tallerista') {
      dniNorm = String(dni||'').replace(/\D/g,'');
      if (!/^\d{7,8}$/.test(dniNorm)) return res.status(400).json({error:'DNI inválido'});
      const ver = await db.verificarElegibilidadAsistente(dniNorm);
      const inscripciones = await db.listarInscripcionesPorDni(dniNorm);
      if (inscripciones.length===0) return res.status(404).json({error:'No se encontraron inscripciones para ese DNI'});
      nombre = inscripciones[0].nombre; apellido = inscripciones[0].apellido; email = inscripciones[0].email;
      if (tipoNorm==='asistente' && !ver.elegible && !forzar) {
        const falt = ver.asistencias.filter(a=>!a.completo).map(a=>a.taller).join(', ');
        return res.status(409).json({ error:`El asistente no cumple con el control de asistencia (ingreso+egreso). Faltantes: ${falt||ver.motivo}`, elegible:false, asistencias: ver.asistencias });
      }
      if (tipoNorm==='tallerista') {
        try {
          const ap = await db.queryOne('SELECT es_tallerista FROM asistente_planes WHERE dni=? AND es_tallerista=TRUE LIMIT 1', [dniNorm]);
          detalle.esTalleristaFlag = Boolean(ap);
        } catch(_){}
      }
      const talleresCompletos = ver.asistencias.filter(a=>a.completo);
      const talleresParaCert = (tipoNorm==='asistente' && !forzar) ? talleresCompletos : ver.asistencias.map(a=>({ taller: a.taller, fecha:a.fecha, hora:a.hora, taller_id:a.taller_id, completo:a.completo }));
      detalle = { talleres: talleresParaCert, tipo: tipoNorm, horas: String(firmasCfg.horas) };
      talleresIds = talleresParaCert.map(t=>String(t.taller_id||'')).filter(Boolean).join(',');
    } else {
      return res.status(400).json({error:'Tipo inválido o datos faltantes (requiere DNI para asistente/tallerista o ponenteId para ponente/taller)'});
    }

    // verificar si ya existe certificado mismo tipo+dni/ponente (evitar duplicado? permitir regenerar)
    // generar nuevo codigo siempre
    const codigo = certificados.generarCodigoCertificado();
    const datosFirma = { dni: dniNorm||'', nombre, apellido, tipo: tipoNorm };
    const hash = certificados.generarHashFirma(codigo, datosFirma);
    let qrPayload = certificados.construirQrPayload(codigo);
    // si no hay BASE_URL, construir URL absoluta con host de la petición
    // Si no hay BASE_URL/APP_URL explícitos, usar host de la request para que en local sea localhost y en prod sea dramatiza.vercel.app
    if (!process.env.BASE_URL && !process.env.APP_URL) {
      try {
        const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.get('host') || '';
        if (host) qrPayload = `${proto}://${host}/verificar.html?c=${codigo}`;
      } catch(_){}
    }

    const nuevoId = await db.crearCertificado({
      codigo,
      tipo: tipoNorm,
      dni: dniNorm||null,
      ponenteId: ponId,
      nombre, apellido, email,
      detalle, talleresIds, qrData: qrPayload, hashFirma: hash, emitidoPor: sesion.usuario
    });
    await db.registrarEvento('certificado_generado', `Certificado ${codigo} (${tipoNorm}) para ${nombre} ${apellido} ${dniNorm?`(DNI ${dniNorm})`:''} por ${sesion.usuario}`, sesion.usuario).catch(()=>{});
    res.status(201).json({ ok:true, id: nuevoId, codigo, tipo: tipoNorm, dni: dniNorm, ponente_id: ponId, hash, qrData: qrPayload });
  } catch(e){ next(e); }
});

app.get('/api/admin/certificados/:codigo/pdf', requireAuth, async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo||'').trim().toUpperCase();
    const cert = await db.buscarCertificadoPorCodigo(codigo);
    if (!cert) return res.status(404).json({error:'Certificado no encontrado'});
    const detalle = typeof cert.detalle==='string' ? JSON.parse(cert.detalle||'{}') : (cert.detalle||{});
    const firmasCfg = await obtenerFirmasConfig();
    // resolver imagen firmas si existe archivo
    const firma1Path = path.join(__dirname,'..','public','firma1.png');
    const firma2Path = path.join(__dirname,'..','public','firma2.png');
    const pdf = await certificados.generarPdfCertificado({
      codigo: cert.codigo,
      tipo: cert.tipo,
      nombre: cert.nombre,
      apellido: cert.apellido,
      dni: cert.dni||'',
      detalle,
      emitidoEn: cert.creado_en,
      hashFirma: cert.hash_firma,
      avales: [firmasCfg.aval1, firmasCfg.aval2, firmasCfg.aval3, firmasCfg.aval4],
      firma1: { nombre: firmasCfg.firma1_nombre, cargo: firmasCfg.firma1_cargo, imagenPath: fs.existsSync(firma1Path)?firma1Path:null },
      firma2: { nombre: firmasCfg.firma2_nombre, cargo: firmasCfg.firma2_cargo, imagenPath: fs.existsSync(firma2Path)?firma2Path:null },
    });
    res.set('Content-Type','application/pdf');
    res.set('Content-Disposition', `inline; filename="${codigo}.pdf"`);
    res.set('Cache-Control','no-store');
    res.send(pdf);
  } catch(e){ next(e); }
});

app.get('/api/admin/certificados/:codigo/qr.png', requireAuth, async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo||'').trim().toUpperCase();
    const cert = await db.buscarCertificadoPorCodigo(codigo);
    if (!cert) return res.status(404).json({error:'No encontrado'});
    const payload = cert.qr_data || certificados.construirQrPayload(codigo);
    const buf = await certificados.generarQrPng(payload, 300);
    res.set('Content-Type','image/png');
    res.set('Cache-Control','no-store');
    res.send(buf);
  } catch(e){ next(e); }
});

app.delete('/api/admin/certificados/:id', requireAuth, async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({error:'ID inválido'});
    await db.eliminarCertificado(id);
    await db.registrarEvento('certificado_eliminado', `Certificado #${id} eliminado por ${req.sesion.usuario}`, req.sesion.usuario).catch(()=>{});
    res.json({ ok:true });
  } catch(e){ next(e); }
});

// Verificación pública (sin auth)
app.get('/api/certificados/verificar/:codigo', async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo||'').trim().toUpperCase();
    const cert = await db.buscarCertificadoPorCodigo(codigo);
    if (!cert) return res.status(404).json({ valido:false, error:'Certificado no encontrado' });
    const detalle = typeof cert.detalle==='string'? JSON.parse(cert.detalle||'{}'): (cert.detalle||{});
    // recalcular hash para verificar firma electrónica
    const hashCalc = certificados.generarHashFirma(codigo, { dni: cert.dni||'', nombre: cert.nombre, apellido: cert.apellido, tipo: cert.tipo });
    const firmaValida = hashCalc === cert.hash_firma;
    res.json({
      valido: true,
      firmaValida,
      codigo: cert.codigo,
      tipo: cert.tipo,
      nombre: cert.nombre,
      apellido: cert.apellido,
      dni: cert.dni||'',
      ponente_id: cert.ponente_id,
      detalle,
      emitido_por: cert.emitido_por,
      creado_en: cert.creado_en,
      hash_firma: cert.hash_firma,
      qr_data: cert.qr_data,
    });
  } catch(e){ next(e); }
});
app.post('/api/certificados/verificar', async (req, res, next) => {
  try {
    const codigo = String((req.body||{}).codigo||'').trim().toUpperCase();
    if (!codigo) return res.status(400).json({error:'Código requerido'});
    const cert = await db.buscarCertificadoPorCodigo(codigo);
    if (!cert) return res.status(404).json({ valido:false, error:'No encontrado' });
    const detalle = typeof cert.detalle==='string'? JSON.parse(cert.detalle||'{}'): (cert.detalle||{});
    const hashCalc = certificados.generarHashFirma(codigo, { dni: cert.dni||'', nombre: cert.nombre, apellido: cert.apellido, tipo: cert.tipo });
    res.json({ valido:true, firmaValida: hashCalc===cert.hash_firma, codigo: cert.codigo, tipo: cert.tipo, nombre: cert.nombre, apellido: cert.apellido, dni: cert.dni, detalle, creado_en: cert.creado_en });
  } catch(e){ next(e); }
});
app.get('/api/certificados/verificar/:codigo/xml', async (req, res, next) => {
  try {
    const codigo = String(req.params.codigo||'').trim().toUpperCase();
    const cert = await db.buscarCertificadoPorCodigo(codigo);
    if (!cert) return res.status(404).type('application/xml').send('<error>Certificado no encontrado</error>');
    const detalle = typeof cert.detalle==='string'? JSON.parse(cert.detalle||'{}'): (cert.detalle||{});
    const cfg = await obtenerFirmasConfig().catch(()=>({}));
    const rolMap = { asistente:'Asistente', ponente:'Ponente', tallerista:'Tallerista' };
    const tipoAct = detalle.esTaller || String(detalle.tipoPonencia||'').toLowerCase()==='taller' ? 'Taller' : (cert.tipo==='ponente' ? 'Ponencia' : (detalle.titulo ? 'Taller' : 'Taller'));
    // Para asistente, el tipo actividad es Taller (lista), para ponente/tallerista según esTaller
    const tipoActividad = cert.tipo==='asistente' ? 'Taller' : tipoAct;
    const tituloActividad = detalle.titulo || (detalle.talleres && detalle.talleres[0] ? (detalle.talleres[0].taller||detalle.talleres[0].nombre) : '');
    const xml = certificados.generarXmlCertificado({
      codigo: cert.codigo,
      nombre: cert.nombre, apellido: cert.apellido, dni: cert.dni||'',
      rol: rolMap[cert.tipo]||cert.tipo,
      tipoActividad, tituloActividad,
      cargaHoraria: String(detalle.horas||cfg.horas||'3'),
      fechaEmision: cert.creado_en,
      firmantes: [{nombre: cfg.firma1_nombre, cargo: cfg.firma1_cargo},{nombre: cfg.firma2_nombre, cargo: cfg.firma2_cargo}],
      firmaElectronica: cert.hash_firma
    });
    res.type('application/xml').send(xml);
  } catch(e){ next(e); }
});

// ── Admin Asignaciones (web) ────────────────────────────────────────
app.get('/api/admin/asignaciones', requireAuth, async (req, res, next) => {
  try {
    if(!esAdminOSuperior(req)) return res.status(403).json({error:'Solo admin/superior'});
    try {
      const filas=await db.query(`SELECT a.*, t.nombre as taller_nombre, b.titulo as bloque_titulo FROM operador_taller_asignaciones a LEFT JOIN talleres t ON t.id=a.taller_id LEFT JOIN programa_bloques b ON b.id=a.bloque_id ORDER BY a.dia DESC, a.id DESC LIMIT 200`);
      return res.json(filas);
    } catch(e) {
      if (String(e.message).includes('no existe') || e.code==='42P01') return res.json([]);
      throw e;
    }
  } catch(e){ next(e); }
});
app.post('/api/admin/asignaciones', requireAuth, async (req, res, next) => {
  try { if(!esAdminOSuperior(req)) return res.status(403).json({error:'Solo admin/superior'}); const { operador, tallerId, dia, bloqueId }=req.body||{}; const op=String(operador||'').trim().toLowerCase(); const tid=Number(tallerId); const d=String(dia||'').trim(); if(!op||!tid||!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({error:'operador, tallerId y dia YYYY-MM-DD requeridos'}); try { await db.query('INSERT INTO operador_taller_asignaciones (operador_username, taller_id, dia, bloque_id, creado_por) VALUES (?,?,?,?,?)', [op,tid,d,bloqueId||null, req.sesion.usuario]); } catch(e) { if (String(e.message).includes('no existe') || e.code==='42P01') return res.status(503).json({ error: 'Tabla operador_taller_asignaciones no existe. Ejecutá migración 007.' }); throw e; } await db.registrarEvento('asignacion_creada', `Asignación ${op} → taller ${tid} día ${d} por ${req.sesion.usuario}`, req.sesion.usuario).catch(()=>{}); res.status(201).json({ok:true}); } catch(e){ next(e); }
});
app.put('/api/admin/asignaciones/:id', requireAuth, async (req, res, next) => {
  try { if(!esAdminOSuperior(req)) return res.status(403).json({error:'Solo admin/superior'}); const id=Number(req.params.id); if(!id) return res.status(400).json({error:'ID inválido'}); const { operador, tallerId, dia, bloqueId }=req.body||{}; const op=String(operador||'').trim().toLowerCase(); const tid=Number(tallerId); const d=String(dia||'').trim(); if(!op||!tid||!/^\d{4}-\d{2}-\d{2}$/.test(d)) return res.status(400).json({error:'operador, tallerId y dia requeridos'}); try { const existe=await db.queryOne('SELECT id FROM operador_taller_asignaciones WHERE id=?',[id]); if(!existe) return res.status(404).json({error:'No encontrada'}); await db.query('UPDATE operador_taller_asignaciones SET operador_username=?, taller_id=?, dia=?, bloque_id=? WHERE id=?',[op,tid,d,bloqueId||null,id]); } catch(e) { if (String(e.message).includes('no existe') || e.code==='42P01') return res.status(503).json({ error: 'Tabla operador_taller_asignaciones no existe. Ejecutá migración 007.' }); throw e; } await db.registrarEvento('asignacion_reasignada', `Reasignación #${id}: ${op} → taller ${tid} día ${d} por ${req.sesion.usuario}`, req.sesion.usuario).catch(()=>{}); res.json({ok:true}); } catch(e){ next(e); }
});
app.delete('/api/admin/asignaciones/:id', requireAuth, async (req, res, next) => {
  try { if(!esAdminOSuperior(req)) return res.status(403).json({error:'Solo admin/superior'}); const id=Number(req.params.id); if(!id) return res.status(400).json({error:'ID inválido'}); try { await db.query('DELETE FROM operador_taller_asignaciones WHERE id=?',[id]); } catch(e) { if (String(e.message).includes('no existe') || e.code==='42P01') return res.status(503).json({ error: 'Tabla operador_taller_asignaciones no existe. Ejecutá migración 007.' }); throw e; } await db.registrarEvento('asignacion_eliminada', `Asignación #${id} eliminada por ${req.sesion.usuario}`, req.sesion.usuario).catch(()=>{}); res.json({ok:true}); } catch(e){ next(e); }
});

// Job avisos 10/30min (poll cada 60s, usa notificaciones)
let __avisosInterval = null;
function iniciarJobAvisos() {
  if (__avisosInterval) return;
  __avisosInterval = setInterval(async () => {
    try {
      const bloques = await db.listarPrograma().catch(()=>[]);
      const ahora = Date.now();
      for (const b of bloques) {
        const d = String(b.dia||'').split('-').map(Number);
        if (d.length<3) continue;
        const hi = String(b.hora_inicio||'').split(':').map(Number);
        const hf = String(b.hora_fin||'').split(':').map(Number);
        const inicio = new Date(d[0], d[1]-1, d[2], hi[0]||0, hi[1]||0).getTime();
        const fin = new Date(d[0], d[1]-1, d[2], hf[0]||23, hf[1]||59).getTime();
        if (Number.isNaN(inicio) || Number.isNaN(fin)) continue;
        const ms10 = 10*60*1000, ms30 = 30*60*1000;
        // 10 min antes de finalizar → superior recordatorio (una vez)
        if (ahora >= fin - ms10 - 30000 && ahora <= fin - ms10 + 30000) {
          const titulo = `Finaliza en 10 min: ${b.titulo}`;
          const existe = await db.queryOne("SELECT id FROM notificaciones WHERE titulo=? AND creado_en > NOW() - INTERVAL '20 minutes' LIMIT 1", [titulo]).catch(()=>null);
          if (!existe) await db.crearNotificacion({ titulo, mensaje: `El bloque ${b.titulo} (${b.hora_inicio}-${b.hora_fin}) finaliza en 10 minutos.`, tipo: 'recordatorio', activa: true, creadoPor: 'sistema' }).catch(()=>{});
        }
        // 30 min antes de iniciar break → menu info
        if (String(b.tipo)==='break' && ahora >= inicio - ms30 - 30000 && ahora <= inicio - ms30 + 30000) {
          const titulo = `Preparar servicio: ${b.titulo} en 30 min`;
          const existe = await db.queryOne("SELECT id FROM notificaciones WHERE titulo=? AND creado_en > NOW() - INTERVAL '20 minutes' LIMIT 1", [titulo]).catch(()=>null);
          if (!existe) await db.crearNotificacion({ titulo, mensaje: `El servicio ${b.titulo} inicia a las ${b.hora_inicio}. Preparar entrega.`, tipo: 'info', activa: true, creadoPor: 'sistema' }).catch(()=>{});
        }
      }
    } catch (e) { console.error('[avisos] error', e.message); }
  }, 60000);
}
if (!EN_VERCEL) setTimeout(iniciarJobAvisos, 5000);


app.get('/api/version', (_req, res) => {
  const pkg = require('../package.json');
  res.json({ app: pkg.name, version: pkg.version });
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
