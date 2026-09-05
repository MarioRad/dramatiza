const ETIQUETAS_ROL = { admin: 'Administrador', operador: 'Operador' };
const ETIQUETAS_EVENTO = {
  inscripcion_creada: 'Inscripción creada',
  inscripcion_modificada: 'Inscripción modificada',
  inscripcion_eliminada: 'Inscripción eliminada',
  inscripcion_finalizada: 'Inscripción finalizada',
  inscripcion_anulada: 'Inscripción anulada',
  constancia_reenviada: 'Constancia reenviada',
  acreditacion_reenviada: 'Acreditación reenviada',
  acreditacion_verificada: 'Acreditación verificada',
  ponente_creado: 'Ponente creado',
  ponente_modificado: 'Ponente modificado',
  ponente_eliminado: 'Ponente eliminado',
  usuario_creado: 'Usuario creado',
  usuario_modificado: 'Usuario modificado',
  usuario_eliminado: 'Usuario eliminado',
  notificacion_creada: 'Notificación creada',
  notificacion_modificada: 'Notificación modificada',
  notificacion_eliminada: 'Notificación eliminada',
  config_modificada: 'Configuración modificada',
  encuentro_modificado: 'Registro del encuentro modificado',
  encuentro_ocultado: 'Registro del encuentro ocultado',
};
const ETIQUETAS_ALIMENTACION = {
  sin_restriccion: 'Sin restricción',
  vegano: 'Vegano',
  sin_tacc: 'Sin TACC',
  sin_lactosa: 'Sin lactosa',
  otro: 'Otro',
};
const TITULOS_VISTA = {
  inscripciones: 'Inscripciones',
  ponentes: 'Ponentes',
  encuentro: 'Importar listado',
  pagos: 'Gestión de pagos y cuotas',
  notificaciones: 'Notificaciones a la app móvil',
  acreditaciones: 'Acreditaciones',
  comidas: 'Desayunos y meriendas',
  eventos: 'Registro de eventos',
  usuarios: 'Usuarios',
  permisos: 'Permisos del sistema',
};
const ETIQUETAS_PAGO = {
  no_pagado: 'No pagado',
  pago_parcial: 'Pago parcial',
  pago_completo: 'Pago completo',
};

function el(id) {
  return document.getElementById(id);
}

const vistaLogin = el('vistaLogin');
const vistaPanel = el('vistaPanel');
const formLogin = el('formLogin');
const mensajeLogin = el('mensajeLogin');
const mensajePanel = el('mensajePanel');
const mensajeEncuentro = el('mensajeEncuentro');
const mensajeUsuarios = el('mensajeUsuarios');
const resumenEncuentro = el('resumenEncuentro');
const formImportarEncuentro = el('formImportarEncuentro');
const archivoEncuentro = el('archivoEncuentro');
const botonImportar = el('botonImportar');
const botonVaciarEncuentro = el('botonVaciarEncuentro');
const botonSalir = el('botonSalir');
const resumenInscripciones = el('resumenInscripciones');
const resumenEventos = el('resumenEventos');
const resumenAcreditaciones = el('resumenAcreditaciones');
const resumenComidas = el('resumenComidas');
const modalEditar = el('modalEditarInscripcion');
const modalEditarInfo = el('modalEditarInfo');
const modalEditarTalleres = el('modalEditarTalleres');
const botonGuardarEdicion = el('botonGuardarEdicion');
const botonCancelarEdicion = el('botonCancelarEdicion');
const modalUsuario = el('modalUsuario');
const modalUsuarioTitulo = el('modalUsuarioTitulo');
const modalUsuarioUsername = el('modalUsuarioUsername');
const modalUsuarioNombre = el('modalUsuarioNombre');
const modalUsuarioPassword = el('modalUsuarioPassword');
const modalUsuarioRol = el('modalUsuarioRol');
const modalUsuarioActivo = el('modalUsuarioActivo');
const botonGuardarUsuario = el('botonGuardarUsuario');
const botonCancelarUsuario = el('botonCancelarUsuario');
const modalQr = el('modalQr');
const qrInfo = el('qrInfo');
const qrImagen = el('qrImagen');
const qrPdfLink = el('qrPdfLink');
const botonReenviarQr = el('botonReenviarQr');
const botonCerrarQr = el('botonCerrarQr');
const buscarDni = el('buscarDni');
const filtroPago = el('filtroPago');
const modalPonente = el('modalPonente');
const formPonente = el('formPonente');
const resumenEncuentroLista = el('resumenEncuentroLista');
const buscarEncuentro = el('buscarEncuentro');
const modalEncuentro = el('modalEncuentro');
const modalEncuentroDni = el('encuentroDni');
const modalEncuentroMarcaTemporal = el('encuentroMarcaTemporal');
const modalEncuentroApellido = el('encuentroApellido');
const modalEncuentroNombre = el('encuentroNombre');
const modalEncuentroEmail = el('encuentroEmail');
const modalEncuentroNacimiento = el('encuentroNacimiento');
const modalEncuentroTelefono = el('encuentroTelefono');
const modalEncuentroProvincia = el('encuentroProvincia');
const modalEncuentroCiudad = el('encuentroCiudad');
const modalEncuentroOcupacion = el('encuentroOcupacion');
const modalEncuentroOpcionPago = el('encuentroOpcionPago');
const botonGuardarEncuentro = el('botonGuardarEncuentro');
const botonCancelarEncuentro = el('botonCancelarEncuentro');
const mensajeEncuentroModal = el('mensajeEncuentroModal');

let talleresActuales = [];
let inscripcionEditando = null;
let talleresEditando = [];
let usuarioEditando = null;
let miSesion = null;
let vistaActiva = 'inscripciones';
let dniQrActual = null;
let ponenteEditandoId = null;
let encuentroPersonas = [];
let encuentroEditando = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function mostrarMensaje(elNodo, texto, tipo) {
  elNodo.textContent = texto || '';
  elNodo.className = `mensaje visible ${tipo || ''}`;
}

async function api(uri, opciones = {}) {
  const res = await fetch(uri, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function formatearFecha(valor) {
  if (!valor) return '';
  const iso = String(valor).match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1].slice(-2)}`;
  }
  const partes = String(valor).split(/[/\-]/);
  if (partes.length >= 3) {
    const d = partes[0].padStart(2, '0');
    const m = partes[1].padStart(2, '0');
    const y = partes[2].slice(-2);
    return `${d}/${m}/${y}`;
  }
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  const yy = String(fecha.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function mostrarLogin() {
  vistaLogin.hidden = false;
  vistaPanel.hidden = true;
  miSesion = null;
}

function mostrarPanel() {
  vistaLogin.hidden = true;
  vistaPanel.hidden = false;
  const esAdmin = miSesion && miSesion.rol === 'admin';
  for (const tab of document.querySelectorAll('.tab-admin')) tab.hidden = !esAdmin;
  const puedeAcreditar = esAdmin || Boolean(miSesion && miSesion.perm_acreditacion);
  for (const tab of document.querySelectorAll('.tab-acreditacion')) tab.hidden = !puedeAcreditar;
  const vistasSinPermiso = ['eventos', 'usuarios', 'permisos'];
  if (!puedeAcreditar) vistasSinPermiso.push('acreditaciones', 'comidas');
  if (vistasSinPermiso.includes(vistaActiva)) {
    cambiarVista('inscripciones');
  } else {
    cambiarVista(vistaActiva);
  }
  el('usuarioActual').textContent =
    `${miSesion.nombre || miSesion.usuario} · ${ETIQUETAS_ROL[miSesion.rol] || miSesion.rol}`;
}

function cambiarVista(vista) {
  vistaActiva = vista;
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('activo', tab.dataset.vista === vista);
  }
  for (const nombre of Object.keys(TITULOS_VISTA)) {
    const contenedor = el(`vista${nombre[0].toUpperCase()}${nombre.slice(1)}`);
    if (contenedor) contenedor.hidden = nombre !== vista;
  }
  el('tituloPanel').textContent = TITULOS_VISTA[vista] || 'Panel';
  if (vista === 'ponentes') {
    cargarPonentes();
  }
  if (vista === 'acreditaciones') {
    cargarAcreditaciones();
  }
  if (vista === 'comidas') {
    cargarComidas();
  }
  if (vista === 'inscripciones') {
    cargarInscripciones();
    if (subTabInscripcionActiva() === 'encuentro') renderEncuentroPersonas(encuentroPersonas);
  }
  if (vista === 'pagos') {
    cargarPagos();
  }
  if (vista === 'notificaciones') {
    cargarNotificaciones();
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => cambiarVista(tab.dataset.vista));
}

function subTabInscripcionActiva() {
  return (document.querySelector('#subTabsInscripciones .sub-tab.activo') || {}).dataset?.sub || 'talleres';
}

function activarSubTabInscripcion(sub) {
  const activa = subTabInscripcionActiva();
  if (activa === sub) return;
  for (const btn of document.querySelectorAll('#subTabsInscripciones .sub-tab')) {
    btn.classList.toggle('activo', btn.dataset.sub === sub);
  }
  el('subInscripcionesTalleres').hidden = sub !== 'talleres';
  el('subInscripcionesEncuentro').hidden = sub !== 'encuentro';
  if (sub === 'encuentro') renderEncuentroPersonas(encuentroPersonas);
}

document.querySelectorAll('#subTabsInscripciones .sub-tab').forEach((btn) => {
  btn.addEventListener('click', () => activarSubTabInscripcion(btn.dataset.sub));
});


function bloquesHorario(t) {
  const mFecha = String(t.fecha || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mHora = String(t.hora || '').trim().match(/(\d{1,2}):(\d{2})/);
  if (!mFecha || !mHora) return [];
  const durHs = Number(t.duracion_hs) || 3;
  const numDias = durHs >= 6 ? 2 : 1;
  const inicio = new Date(Number(mFecha[1]), Number(mFecha[2]) - 1, Number(mFecha[3]), Number(mHora[1]), Number(mHora[2]));
  if (Number.isNaN(inicio.getTime())) return [];
  const durMs = durHs * 3600 * 1000;
  const bloques = [];
  for (let i = 0; i < numDias; i++) {
    const s = new Date(inicio.getTime() + i * 86400000);
    bloques.push([s.getTime(), s.getTime() + durMs]);
  }
  return bloques;
}

function talleresSeSuperponenEdicion(a, b) {
  const ba = bloquesHorario(a);
  const bb = bloquesHorario(b);
  for (const x of ba) {
    for (const y of bb) {
      if (x[0] < y[1] && y[0] < x[1]) return true;
    }
  }
  return false;
}

function actualizarConflictoEdicion() {
  const aviso = el('modalEditarConflicto');
  const seleccionados = [...modalEditarTalleres.querySelectorAll('input[type="checkbox"]:checked')].map((c) => Number(c.value));
  const byId = new Map(talleresActuales.map((t) => [Number(t.id), t]));
  const extra = seleccionados.map((id) => byId.get(id)).filter(Boolean);
  const pares = [];
  for (let i = 0; i < extra.length; i++) {
    for (let j = i + 1; j < extra.length; j++) {
      if (talleresSeSuperponenEdicion(extra[i], extra[j])) pares.push([extra[i], extra[j]]);
    }
  }
  if (pares.length === 0) {
    aviso.hidden = true;
    aviso.innerHTML = '';
    return;
  }
  const filas = pares.map(([a, b]) => `• ${a.nombre} ↔ ${b.nombre}`).join('<br>');
  aviso.innerHTML = `<strong>⚠ Conflicto de horarios:</strong><br>${filas}`;
  aviso.hidden = false;
}

function abrirModalEdicion(inscripcion, filas = []) {
  inscripcionEditando = inscripcion;
  talleresEditando = filas.map((f) => Number(f.taller_id));
  modalEditarInfo.textContent =
    `${inscripcion.nombre} ${inscripcion.apellido} (DNI ${inscripcion.dni})`;

  modalEditarTalleres.innerHTML = '';
  for (const t of talleresActuales) {
    const id = Number(t.id);
    const marcado = talleresEditando.includes(id);
    const lleno = t.inscriptos >= t.cupo && !marcado;

    const label = document.createElement('label');
    label.className = 'opcion-taller' + (lleno ? ' opcion-taller-lleno' : '');
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = id;
    check.checked = marcado;
    check.disabled = lleno;
    const span = document.createElement('span');
    const etiqueta = lleno
      ? `${t.nombre} (lleno)`
      : `${t.nombre} — ${t.cupo - t.inscriptos} cupos`;
    span.textContent = etiqueta;
    label.appendChild(check);
    label.appendChild(span);
    modalEditarTalleres.appendChild(label);
  }

  actualizarConflictoEdicion();
  modalEditar.hidden = false;
  modalEditar.setAttribute('aria-hidden', 'false');
}

function cerrarModalEdicion() {
  modalEditar.hidden = true;
  modalEditar.setAttribute('aria-hidden', 'true');
  inscripcionEditando = null;
  talleresEditando = [];
}

botonCancelarEdicion.addEventListener('click', cerrarModalEdicion);
modalEditarTalleres.addEventListener('change', actualizarConflictoEdicion);

botonGuardarEdicion.addEventListener('click', async () => {
  if (!inscripcionEditando) return;
  const seleccionados = [...modalEditarTalleres.querySelectorAll('input[type="checkbox"]:checked')].map(
    (c) => Number(c.value)
  );
  if (seleccionados.length === 0) {
    mostrarMensaje(mensajePanel, 'Debés seleccionar al menos un taller.', 'error');
    return;
  }
  botonGuardarEdicion.disabled = true;
  const res = await api('/api/admin/inscripciones-talleres', {
    method: 'PUT',
    body: JSON.stringify({ dni: inscripcionEditando.dni, talleres: seleccionados }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePanel, res.data.error || 'No se pudieron actualizar los talleres.', 'error');
  } else {
    mostrarMensaje(mensajePanel, 'Talleres actualizados.', 'ok');
    cerrarModalEdicion();
    await cargarDatos();
  }
  botonGuardarEdicion.disabled = false;
});

function renderInscripciones(inscripciones) {
  const cuerpo = document.querySelector('#tablaInscripciones tbody');
  cuerpo.innerHTML = '';

  const porDniResumen = new Map();
  for (const i of inscripciones) {
    if (!porDniResumen.has(i.dni)) porDniResumen.set(i.dni, []);
    porDniResumen.get(i.dni).push(i);
  }
  const personas = [...porDniResumen.keys()];
  const enEncuentro = personas.filter((d) => porDniResumen.get(d).some((i) => i.en_encuentro)).length;
  let completos = 0;
  let parciales = 0;
  let noPagados = 0;
  for (const d of personas) {
    const estados = porDniResumen.get(d).map((i) => i.estado_pago || 'no_pagado');
    if (estados.every((e) => e === 'pago_completo')) completos++;
    else if (estados.some((e) => e === 'pago_parcial')) parciales++;
    else noPagados++;
  }
  resumenInscripciones.textContent =
    `Personas: ${personas.length} (${inscripciones.length} inscripciones en talleres) · ` +
    `en encuentro: ${enEncuentro} · pagos: ${completos} completo(s) · ${parciales} parcial(es) · ${noPagados} no pagado(s).`;

  const dniFiltro = buscarDni.value.trim().replace(/\D/g, '');
  const pagoFiltro = filtroPago.value;
  const visibles = inscripciones.filter(
    (i) => (!dniFiltro || i.dni.includes(dniFiltro)) && (!pagoFiltro || i.estado_pago === pagoFiltro)
  );

  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.textContent = dniFiltro || pagoFiltro ? 'Sin resultados para el filtro.' : 'No hay inscripciones.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }

  const grupos = [];
  const porDni = new Map();
  for (const i of visibles) {
    if (!porDni.has(i.dni)) {
      porDni.set(i.dni, []);
      grupos.push(i.dni);
    }
    porDni.get(i.dni).push(i);
  }

  for (const dni of grupos) {
    const filas = porDni.get(dni);
    const i = filas[0];

    const tr = document.createElement('tr');

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = i.dni;

    const tdNombre = document.createElement('td');
    tdNombre.textContent = `${i.nombre} ${i.apellido}`;

    const tdEmail = document.createElement('td');
    tdEmail.textContent = i.email;

    const tdTelefono = document.createElement('td');
    tdTelefono.textContent = i.telefono || '—';

    const tdAlimentacion = document.createElement('td');
    tdAlimentacion.textContent = ETIQUETAS_ALIMENTACION[i.alimentacion] || i.alimentacion || '—';

    const tdTaller = document.createElement('td');
    const talleresUnicos = [...new Map(filas.map((f) => [f.taller, f])).values()];
    const totalSesiones = filas.length;
    const divTalleres = document.createElement('div');
    divTalleres.className = 'lista-talleres-inscripcion';
    for (const ft of talleresUnicos) {
      const span = document.createElement('div');
      span.className = 'chip-taller';
      span.textContent = ft.taller;
      divTalleres.appendChild(span);
    }
    if (totalSesiones > talleresUnicos.length) {
      const span = document.createElement('div');
      span.className = 'chip-taller chip-taller-mas';
      span.textContent = `+${totalSesiones - talleresUnicos.length} sesión(es)`;
      divTalleres.appendChild(span);
    }
    if (talleresUnicos.length === 0) {
      divTalleres.textContent = '—';
    }
    tdTaller.appendChild(divTalleres);

    const tdEncuentro = document.createElement('td');
    tdEncuentro.textContent = filas.some((f) => f.en_encuentro) ? 'Sí' : 'No';
    tdEncuentro.className = filas.some((f) => f.en_encuentro) ? 'encuentro-si' : 'encuentro-no';

    const tdPago = document.createElement('td');
    const spanPago = document.createElement('span');
    spanPago.className = `estado-pago-texto ${i.estado_pago || 'no_pagado'}`;
    spanPago.textContent = ETIQUETAS_PAGO[i.estado_pago] || '—';
    tdPago.appendChild(spanPago);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(i.creado_en);

    const tdAccion = document.createElement('td');
    const contenedorAcciones = document.createElement('div');
    contenedorAcciones.className = 'acciones-fila';

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'boton boton-chico';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => abrirModalEdicion(i, filas));
    contenedorAcciones.appendChild(botonEditar);

    const botonQr = document.createElement('button');
    botonQr.type = 'button';
    botonQr.className = 'boton boton-chico boton-qr';
    botonQr.textContent = 'QR';
    botonQr.addEventListener('click', () => abrirModalQr(i.dni));
    contenedorAcciones.appendChild(botonQr);

    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'boton boton-peligro boton-chico';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.addEventListener('click', async () => {
      if (!window.confirm(`¿Eliminar la inscripción de ${i.nombre} ${i.apellido}?`)) return;
      botonEliminar.disabled = true;
      const res = await api(`/api/admin/inscripciones/${i.id}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarMensaje(mensajePanel, res.data.error || 'No se pudo eliminar.', 'error');
      } else {
        mostrarMensaje(mensajePanel, 'Inscripción eliminada.', 'ok');
        await cargarDatos();
      }
      botonEliminar.disabled = false;
    });
    contenedorAcciones.appendChild(botonEliminar);
    tdAccion.appendChild(contenedorAcciones);

    tr.append(tdDni, tdNombre, tdEmail, tdTelefono, tdAlimentacion, tdTaller, tdEncuentro, tdPago, tdFecha, tdAccion);
    cuerpo.appendChild(tr);
  }
}

function formatearMarcaTemporal(valor) {
  if (!valor) return '—';
  const texto = String(valor).trim();
  const pad = (n) => String(n).padStart(2, '0');
  const mFechaHora = texto.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s+(\d{1,2}):(\d{2})/);
  if (mFechaHora) {
    const [, d, m, y, h, min] = mFechaHora;
    const anio = y.length === 2 ? `20${y}` : y;
    return `${pad(d)}/${pad(m)}/${anio} ${pad(h)}:${min}`;
  }
  const d = new Date(texto);
  if (!Number.isNaN(d.getTime())) {
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  return texto;
}

function renderEncuentroPersonas(lista) {
  encuentroPersonas = Array.isArray(lista) ? lista : [];
  const cuerpo = document.querySelector('#tablaEncuentroPersonas tbody');
  cuerpo.innerHTML = '';

  const conTalleres = encuentroPersonas.filter((p) => p.tiene_talleres).length;
  resumenEncuentroLista.textContent =
    `Personas importadas: ${encuentroPersonas.length} · inscriptas a talleres: ${conTalleres} · sin talleres: ${encuentroPersonas.length - conTalleres}.`;

  const q = buscarEncuentro.value.trim().toLowerCase();
  const visibles = encuentroPersonas.filter(
    (p) =>
      !q ||
      String(p.dni || '').includes(q) ||
      String(p.apellido || '').toLowerCase().includes(q) ||
      String(p.nombre || '').toLowerCase().includes(q) ||
      `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase().includes(q) ||
      String(p.email || '').toLowerCase().includes(q)
  );

  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12;
    td.textContent = q ? 'Sin resultados para el filtro.' : 'No hay personas importadas del encuentro.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }

  for (const p of visibles) {
    const tr = document.createElement('tr');

    const tdEstado = document.createElement('td');
    const spanEstado = document.createElement('span');
    spanEstado.textContent = p.tiene_talleres ? 'Inscripto a talleres' : 'Sin inscribir a talleres';
    spanEstado.className = p.tiene_talleres ? 'encuentro-si' : 'encuentro-no';
    tdEstado.appendChild(spanEstado);

    const tdMarca = document.createElement('td');
    tdMarca.textContent = formatearMarcaTemporal(p.marca_temporal || p.creado_en);

    const tdEmail = document.createElement('td');
    tdEmail.textContent = p.email || '—';

    const tdNombre = document.createElement('td');
    tdNombre.textContent = [p.apellido, p.nombre].filter(Boolean).join(', ') || '—';

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = p.dni;

    const tdNacimiento = document.createElement('td');
    tdNacimiento.textContent = p.fecha_nacimiento || '—';

    const tdTelefono = document.createElement('td');
    tdTelefono.textContent = p.telefono || '—';

    const tdProvincia = document.createElement('td');
    tdProvincia.textContent = p.provincia || '—';

    const tdCiudad = document.createElement('td');
    tdCiudad.textContent = p.ciudad || '—';

    const tdOcupacion = document.createElement('td');
    tdOcupacion.textContent = p.ocupacion || '—';

    const tdOpcionPago = document.createElement('td');
    tdOpcionPago.textContent = p.opcion_pago || '—';

    const tdAccion = document.createElement('td');
    const contenedorAcciones = document.createElement('div');
    contenedorAcciones.className = 'acciones-fila';

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'boton boton-chico';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => abrirModalEncuentro(p));
    contenedorAcciones.appendChild(botonEditar);

    const botonOcultar = document.createElement('button');
    botonOcultar.type = 'button';
    botonOcultar.className = 'boton boton-peligro boton-chico';
    botonOcultar.textContent = 'Eliminar';
    botonOcultar.addEventListener('click', async () => {
      const nombre = [p.apellido, p.nombre].filter(Boolean).join(', ') || p.dni;
      if (!window.confirm(`¿Ocultar el registro de ${nombre}? No se borra, solo se oculta del listado.`)) return;
      botonOcultar.disabled = true;
      const res = await api(`/api/admin/encuentro/${p.id}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarMensaje(mensajePanel, res.data.error || 'No se pudo ocultar el registro.', 'error');
      } else {
        mostrarMensaje(mensajePanel, 'Registro ocultado del listado.', 'ok');
        await cargarDatos();
      }
      botonOcultar.disabled = false;
    });
    contenedorAcciones.appendChild(botonOcultar);

    tdAccion.appendChild(contenedorAcciones);

    tr.append(
      tdEstado,
      tdMarca,
      tdEmail,
      tdNombre,
      tdDni,
      tdNacimiento,
      tdTelefono,
      tdProvincia,
      tdCiudad,
      tdOcupacion,
      tdOpcionPago,
      tdAccion
    );
    cuerpo.appendChild(tr);
  }
}

function abrirModalEncuentro(persona) {
  encuentroEditando = persona;
  mostrarMensaje(mensajeEncuentroModal, '', '');
  modalEncuentroDni.value = persona.dni || '';
  modalEncuentroMarcaTemporal.value = persona.marca_temporal || '';
  modalEncuentroApellido.value = persona.apellido || '';
  modalEncuentroNombre.value = persona.nombre || '';
  modalEncuentroEmail.value = persona.email || '';
  modalEncuentroNacimiento.value = persona.fecha_nacimiento || '';
  modalEncuentroTelefono.value = persona.telefono || '';
  modalEncuentroProvincia.value = persona.provincia || '';
  modalEncuentroCiudad.value = persona.ciudad || '';
  modalEncuentroOcupacion.value = persona.ocupacion || '';
  modalEncuentroOpcionPago.value = persona.opcion_pago || '';
  modalEncuentro.hidden = false;
  modalEncuentro.setAttribute('aria-hidden', 'false');
}

function cerrarModalEncuentro() {
  modalEncuentro.hidden = true;
  modalEncuentro.setAttribute('aria-hidden', 'true');
  encuentroEditando = null;
  mostrarMensaje(mensajeEncuentroModal, '', '');
}

botonCancelarEncuentro.addEventListener('click', cerrarModalEncuentro);

modalEncuentro.addEventListener('click', (e) => {
  if (e.target === modalEncuentro) cerrarModalEncuentro();
});

botonGuardarEncuentro.addEventListener('click', async () => {
  if (!encuentroEditando) return;
  botonGuardarEncuentro.disabled = true;
  const res = await api(`/api/admin/encuentro/${encuentroEditando.id}`, {
    method: 'PUT',
    body: JSON.stringify({
      nombre: modalEncuentroNombre.value.trim(),
      apellido: modalEncuentroApellido.value.trim(),
      email: modalEncuentroEmail.value.trim(),
      telefono: modalEncuentroTelefono.value.trim(),
      marca_temporal: modalEncuentroMarcaTemporal.value.trim(),
      fecha_nacimiento: modalEncuentroNacimiento.value.trim(),
      provincia: modalEncuentroProvincia.value.trim(),
      ciudad: modalEncuentroCiudad.value.trim(),
      ocupacion: modalEncuentroOcupacion.value.trim(),
      opcion_pago: modalEncuentroOpcionPago.value.trim(),
    }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajeEncuentroModal, res.data.error || 'No se pudo guardar el registro.', 'error');
  } else {
    mostrarMensaje(mensajeEncuentroModal, 'Registro actualizado.', 'ok');
    cerrarModalEncuentro();
    await cargarDatos();
    if (subTabInscripcionActiva() === 'encuentro') renderEncuentroPersonas(encuentroPersonas);
  }
  botonGuardarEncuentro.disabled = false;
});

buscarEncuentro.addEventListener('input', () => renderEncuentroPersonas(encuentroPersonas));

el('botonActualizarEncuentro').addEventListener('click', async () => {
  const res = await api('/api/admin/encuentro');
  if (!res.ok) {
    mostrarMensaje(mensajePanel, res.data.error || 'No se pudieron cargar las personas importadas.', 'error');
    return;
  }
  renderEncuentroPersonas(res.data.personas || []);
});

function renderEventos(eventos) {
  const cuerpo = document.querySelector('#tablaEventos tbody');
  cuerpo.innerHTML = '';
  resumenEventos.textContent = `Total: ${eventos.length} evento(s).`;

  for (const ev of eventos) {
    const tr = document.createElement('tr');
    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(ev.creado_en);
    const tdTipo = document.createElement('td');
    tdTipo.textContent = ETIQUETAS_EVENTO[ev.tipo] || ev.tipo;
    const tdDetalle = document.createElement('td');
    tdDetalle.textContent = ev.detalle || '';
    tdDetalle.style.whiteSpace = 'normal';
    const tdUsuario = document.createElement('td');
    tdUsuario.textContent = ev.usuario || '—';
    tr.append(tdFecha, tdTipo, tdDetalle, tdUsuario);
    cuerpo.appendChild(tr);
  }
}

function abrirModalUsuario(usuario) {
  usuarioEditando = usuario || null;
  modalUsuarioTitulo.textContent = usuario ? 'Editar usuario' : 'Nuevo usuario';
  modalUsuarioUsername.value = usuario ? usuario.username : '';
  modalUsuarioUsername.disabled = !!usuario;
  modalUsuarioNombre.value = usuario ? usuario.nombre : '';
  modalUsuarioPassword.value = '';
  modalUsuarioRol.value = usuario ? usuario.rol : 'operador';
  modalUsuarioActivo.checked = usuario ? usuario.activo : true;
  el('permUsuarioInscripciones').checked = usuario ? usuario.perm_inscripciones : true;
  el('permUsuarioTalleres').checked = usuario ? usuario.perm_talleres : true;
  el('permUsuarioEncuentro').checked = usuario ? usuario.perm_encuentro : true;
  el('permUsuarioAcreditacion').checked = usuario ? usuario.perm_acreditacion : true;
  modalUsuario.hidden = false;
  modalUsuario.setAttribute('aria-hidden', 'false');
}

function cerrarModalUsuario() {
  modalUsuario.hidden = true;
  modalUsuario.setAttribute('aria-hidden', 'true');
  usuarioEditando = null;
}

botonCancelarUsuario.addEventListener('click', cerrarModalUsuario);

botonGuardarUsuario.addEventListener('click', async () => {
  const esNuevo = !usuarioEditando;
  const payload = {
    username: modalUsuarioUsername.value.trim(),
    password: modalUsuarioPassword.value,
    nombre: modalUsuarioNombre.value.trim(),
    rol: modalUsuarioRol.value,
    activo: modalUsuarioActivo.checked,
    perm_inscripciones: el('permUsuarioInscripciones').checked,
    perm_talleres: el('permUsuarioTalleres').checked,
    perm_encuentro: el('permUsuarioEncuentro').checked,
    perm_acreditacion: el('permUsuarioAcreditacion').checked,
  };
  if (!esNuevo && !payload.username) delete payload.username;
  if (!esNuevo && !payload.password) delete payload.password;
  botonGuardarUsuario.disabled = true;
  const res = esNuevo
    ? await api('/api/admin/usuarios', { method: 'POST', body: JSON.stringify(payload) })
    : await api(`/api/admin/usuarios/${usuarioEditando.id}`, { method: 'PUT', body: JSON.stringify(payload) });
  if (!res.ok) {
    mostrarMensaje(mensajeUsuarios, res.data.error || 'No se pudo guardar el usuario.', 'error');
  } else {
    mostrarMensaje(mensajeUsuarios, esNuevo ? 'Usuario creado.' : 'Usuario actualizado.', 'ok');
    cerrarModalUsuario();
    await cargarDatos();
  }
  botonGuardarUsuario.disabled = false;
});

function renderUsuarios(usuarios) {
  const cuerpo = document.querySelector('#tablaUsuarios tbody');
  cuerpo.innerHTML = '';

  for (const u of usuarios) {
    const tr = document.createElement('tr');

    const tdUser = document.createElement('td');
    tdUser.textContent = u.username;

    const tdNombre = document.createElement('td');
    tdNombre.textContent = u.nombre || '—';

    const tdRol = document.createElement('td');
    tdRol.textContent = ETIQUETAS_ROL[u.rol] || u.rol;

    const tdEstado = document.createElement('td');
    tdEstado.textContent = u.activo ? 'Activo' : 'Inactivo';
    tdEstado.className = u.activo ? 'encuentro-si' : 'encuentro-no';

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(u.creado_en);

    const tdAcciones = document.createElement('td');
    const contenedorAcciones = document.createElement('div');
    contenedorAcciones.className = 'acciones-fila';

    const esPropio = u.username === miSesion.usuario;

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'boton boton-chico';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => abrirModalUsuario(u));
    contenedorAcciones.appendChild(botonEditar);

    if (!esPropio) {
      const botonEliminar = document.createElement('button');
      botonEliminar.type = 'button';
      botonEliminar.className = 'boton boton-peligro boton-chico';
      botonEliminar.textContent = 'Eliminar';
      botonEliminar.addEventListener('click', async () => {
        if (!window.confirm(`¿Eliminar el usuario "${u.username}"?`)) return;
        botonEliminar.disabled = true;
        const res = await api(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' });
        if (!res.ok) {
          mostrarMensaje(mensajeUsuarios, res.data.error || 'No se pudo eliminar.', 'error');
        } else {
          mostrarMensaje(mensajeUsuarios, 'Usuario eliminado.', 'ok');
          await cargarDatos();
        }
        botonEliminar.disabled = false;
      });
      contenedorAcciones.appendChild(botonEliminar);
    }

    tdAcciones.appendChild(contenedorAcciones);

    tr.append(tdUser, tdNombre, tdRol, tdEstado, tdFecha, tdAcciones);
    cuerpo.appendChild(tr);
  }
}

el('botonAgregarUsuario').addEventListener('click', () => abrirModalUsuario(null));

buscarDni.addEventListener('input', () => {
  const listadoActual = window.__inscripcionesActuales || [];
  renderInscripciones(listadoActual);
});

filtroPago.addEventListener('change', () => {
  const listadoActual = window.__inscripcionesActuales || [];
  renderInscripciones(listadoActual);
});

async function abrirModalQr(dni) {
  dniQrActual = dni;
  modalQr.hidden = false;
  modalQr.setAttribute('aria-hidden', 'false');
  qrImagen.src = `/api/admin/acreditacion/${encodeURIComponent(dni)}/png?t=${Date.now()}`;
  qrPdfLink.href = `/api/admin/acreditacion/${encodeURIComponent(dni)}/pdf`;
  qrInfo.textContent = `DNI ${dni} · Cargando acreditación…`;
  try {
    const res = await api(`/api/admin/acreditacion/${encodeURIComponent(dni)}`);
    if (!res.ok || !res.data.encontrado) {
      qrInfo.textContent = `DNI ${dni} · No se encontró acreditación.`;
      return;
    }
    const d = res.data.datos || {};
    const sesiones = (d.sesiones || []).map((s) => `${s.taller}`).join(' · ');
    qrInfo.textContent = `${d.apellido || ''} ${d.nombre || ''} · Código ${d.id}${sesiones ? ` · ${sesiones}` : ''}`;
  } catch (e) {
    qrInfo.textContent = `DNI ${dni} · No se pudo cargar la acreditación.`;
  }
}

function cerrarModalQr() {
  modalQr.hidden = true;
  modalQr.setAttribute('aria-hidden', 'true');
  qrImagen.src = '';
  qrPdfLink.href = '#';
  dniQrActual = null;
}

botonCerrarQr.addEventListener('click', cerrarModalQr);

botonReenviarQr.addEventListener('click', async () => {
  if (!dniQrActual) return;
  botonReenviarQr.disabled = true;
  const res = await api(`/api/admin/acreditacion/${encodeURIComponent(dniQrActual)}/reenviar`, { method: 'POST' });
  if (!res.ok) {
    mostrarMensaje(mensajePanel, res.data.error || 'No se pudo reenviar la acreditación.', 'error');
  } else {
    mostrarMensaje(mensajePanel, res.data.mensaje || 'Acreditación reenviada.', 'ok');
    await cargarDatos();
  }
  botonReenviarQr.disabled = false;
});

function renderAcreditaciones(datos) {
  const cuerpo = document.querySelector('#tablaAcreditacionesTalleres tbody');
  cuerpo.innerHTML = '';
  const total = Number(datos.total) || 0;
  const inscriptosUnicos = Number(datos.inscriptosUnicos) || 0;
  resumenAcreditaciones.textContent = `Total acreditados: ${total} de ${inscriptosUnicos} inscripto(s).`;

  const porTaller = datos.porTaller || [];
  if (porTaller.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No hay talleres cargados.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }

  for (const t of porTaller) {
    const tr = document.createElement('tr');

    const tdTaller = document.createElement('td');
    tdTaller.textContent = t.taller;

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(t.fecha);

    const tdHora = document.createElement('td');
    tdHora.textContent = t.hora || '—';

    const tdAcreditados = document.createElement('td');
    tdAcreditados.textContent = t.acreditados;
    tdAcreditados.style.fontWeight = 'bold';

    const tdInscriptos = document.createElement('td');
    tdInscriptos.textContent = t.inscriptos;

    const tdPendientes = document.createElement('td');
    const pendientes = Math.max(0, t.inscriptos - t.acreditados);
    tdPendientes.textContent = pendientes;
    tdPendientes.className = pendientes === 0 ? 'encuentro-si' : '';

    tr.append(tdTaller, tdFecha, tdHora, tdAcreditados, tdInscriptos, tdPendientes);
    cuerpo.appendChild(tr);
  }
}

async function cargarAcreditaciones() {
  resumenAcreditaciones.textContent = 'Cargando…';
  const res = await api('/api/admin/acreditaciones/resumen');
  if (!res.ok) {
    resumenAcreditaciones.textContent = res.data.error || 'No se pudieron cargar las acreditaciones.';
    return;
  }
  renderAcreditaciones(res.data);
}

el('botonActualizarAcreditaciones').addEventListener('click', cargarAcreditaciones);

const ICONO_CATEGORIA_COMIDA = { desayuno: '☕', merienda: '🫖', otro: '🍽️' };

function renderComidas(datos) {
  resumenComidas.textContent = `Total acreditados: ${Number(datos.total) || 0}. Hora del servidor: ${datos.horaServidor || '—'} (los escaneos cuentan para el servicio cuyo horario incluya esa hora, ±20 min).`;

  const cuerpoServicios = document.querySelector('#tablaComidasServicios tbody');
  cuerpoServicios.innerHTML = '';
  const servicios = datos.servicios || [];
  if (servicios.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9;
    td.textContent = 'No hay bloques de desayuno/merienda en el programa.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpoServicios.appendChild(tr);
  }
  for (const s of servicios) {
    const tr = document.createElement('tr');
    const icono = ICONO_CATEGORIA_COMIDA[s.categoria] || '';

    const tdTitulo = document.createElement('td');
    tdTitulo.textContent = `${icono} ${s.titulo}`;

    const tdDia = document.createElement('td');
    tdDia.textContent = formatearFecha(s.dia);

    const tdHorario = document.createElement('td');
    tdHorario.textContent = `${s.hora_inicio || ''} – ${s.hora_fin || ''}`;

    const tdTotal = document.createElement('td');
    tdTotal.textContent = s.asistentes;
    tdTotal.style.fontWeight = 'bold';

    const dietas = s.dietas || {};
    const celdasDietas = ['sin_restriccion', 'vegano', 'sin_tacc', 'sin_lactosa', 'otro'].map((clave) => {
      const td = document.createElement('td');
      const cantidad = Number(dietas[clave] || 0);
      td.textContent = cantidad;
      if (cantidad > 0 && clave !== 'sin_restriccion') td.classList.add('encuentro-si');
      return td;
    });

    tr.append(tdTitulo, tdDia, tdHorario, tdTotal, ...celdasDietas);
    cuerpoServicios.appendChild(tr);
  }

  const cuerpoAsistentes = document.querySelector('#tablaComidasAsistentes tbody');
  cuerpoAsistentes.innerHTML = '';
  const porAsistente = datos.porAsistente || [];
  if (porAsistente.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'Todavía no hay escaneos registrados en desayunos o meriendas.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpoAsistentes.appendChild(tr);
  }
  for (const p of porAsistente) {
    const tr = document.createElement('tr');

    const tdFecha = document.createElement('td');
    tdFecha.textContent = p.fechaAcreditacion || '—';
    if (!p.fechaAcreditacion) tdFecha.style.color = 'var(--color-texto-suave)';

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = p.dni;

    const tdNombre = document.createElement('td');
    tdNombre.textContent = `${p.apellido}, ${p.nombre}`.replace(/^,\s*/, '');

    const tdAlimentacion = document.createElement('td');
    tdAlimentacion.textContent = ETIQUETAS_ALIMENTACION[p.alimentacion] || p.alimentacion || '—';

    const tdDesayunos = document.createElement('td');
    tdDesayunos.textContent = p.desayunos;

    const tdMeriendas = document.createElement('td');
    tdMeriendas.textContent = p.meriendas;

    const tdTotal = document.createElement('td');
    tdTotal.textContent = p.total;
    tdTotal.style.fontWeight = 'bold';

    tr.append(tdFecha, tdDni, tdNombre, tdAlimentacion, tdDesayunos, tdMeriendas, tdTotal);
    cuerpoAsistentes.appendChild(tr);
  }
}

async function cargarComidas() {
  resumenComidas.textContent = 'Cargando…';
  const res = await api('/api/admin/comidas/resumen');
  if (!res.ok) {
    resumenComidas.textContent = res.data.error || 'No se pudo cargar el recuento de comidas.';
    return;
  }
  renderComidas(res.data);
}

el('botonActualizarComidas').addEventListener('click', cargarComidas);

async function cargarDatos() {
  mostrarMensaje(mensajePanel, '', '');
  const esAdmin = miSesion && miSesion.rol === 'admin';
  const peticiones = [
    api('/api/admin/talleres'),
    api('/api/admin/inscripciones'),
    api('/api/admin/encuentro'),
  ];
  if (esAdmin) peticiones.push(api('/api/admin/eventos'), api('/api/admin/usuarios'), api('/api/admin/config'));
  const respuestas = await Promise.all(peticiones);
  const [talleres, inscripciones, encuentro] = respuestas;

  if (!talleres.ok) {
    mostrarLogin();
    return;
  }
  talleresActuales = talleres.data;
  window.__inscripcionesActuales = inscripciones.data;
  renderInscripciones(inscripciones.data);
  encuentroPersonas = Array.isArray(encuentro.data?.personas) ? encuentro.data.personas : [];
  resumenEncuentro.textContent = `Personas cargadas: ${encuentro.data.total ?? encuentroPersonas.length}.`;
  if (subTabInscripcionActiva() === 'encuentro') renderEncuentroPersonas(encuentroPersonas);
  if (esAdmin) {
    const [, , , eventos, usuarios, config] = respuestas;
    renderEventos(eventos.data || []);
    renderUsuarios(usuarios.data || []);
    renderPermisos(usuarios.data || []);
  }
  mostrarPanel();
}

async function cargarInscripciones() {
  try {
    const r = await api('/api/admin/inscripciones');
    if (!r.ok) {
      mostrarMensaje(mensajePanel, r.error || 'No se pudieron cargar las inscripciones.', 'error');
      return;
    }
    window.__inscripcionesActuales = r.data;
    renderInscripciones(r.data);
  } catch {
    mostrarMensaje(mensajePanel, 'No se pudieron cargar las inscripciones.', 'error');
  }
}

formImportarEncuentro.addEventListener('submit', async (e) => {
  e.preventDefault();
  const archivo = archivoEncuentro.files[0];
  if (!archivo) {
    mostrarMensaje(mensajeEncuentro, 'Elegí un archivo CSV o Excel.', 'error');
    return;
  }
  botonImportar.disabled = true;
  try {
    const nombre = archivo.name;
    const ext = nombre.toLowerCase().split('.').pop();
    let csv = '';
    let base64 = '';
    if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await archivo.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binario = '';
      for (const b of bytes) binario += String.fromCharCode(b);
      base64 = btoa(binario);
    } else {
      csv = await archivo.text();
    }
    const res = await api('/api/admin/encuentro/import', {
      method: 'POST',
      body: JSON.stringify({ nombre, csv, base64 }),
    });
    if (!res.ok) {
      mostrarMensaje(mensajeEncuentro, res.data.error || 'No se pudo importar el archivo.', 'error');
      return;
    }
    const d = res.data;
    mostrarMensaje(
      mensajeEncuentro,
      `Importación correcta: ${d.importados} nuevo(s), ${d.existentes} ya estaban, ${d.invalidos} inválido(s).`,
      'ok'
    );
    archivoEncuentro.value = '';
    await cargarDatos();
  } catch (err) {
    mostrarMensaje(mensajeEncuentro, 'No se pudo leer el archivo. Verificá que sea CSV o Excel válido.', 'error');
  } finally {
    botonImportar.disabled = false;
  }
});

botonVaciarEncuentro.addEventListener('click', async () => {
  if (!window.confirm('¿Eliminar todo el listado del encuentro? Las inscripciones a talleres no se borran.')) return;
  botonVaciarEncuentro.disabled = true;
  const res = await api('/api/admin/encuentro', { method: 'DELETE' });
  if (!res.ok) {
    mostrarMensaje(mensajeEncuentro, res.data.error || 'No se pudo vaciar el listado.', 'error');
  } else {
    mostrarMensaje(mensajeEncuentro, `Listado vaciado (${res.data.eliminados || 0} registros).`, 'ok');
    await cargarDatos();
  }
  botonVaciarEncuentro.disabled = false;
});

formLogin.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeLogin, '', '');
  const res = await api('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify({ username: formLogin.username.value, password: formLogin.password.value }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajeLogin, res.data.error || 'Usuario o contraseña incorrectos.', 'error');
    return;
  }
  miSesion = {
    usuario: res.data.usuario,
    nombre: res.data.nombre,
    rol: res.data.rol,
    perm_acreditacion: Boolean(res.data.perm_acreditacion),
  };
  formLogin.reset();
  await cargarDatos();
});

botonSalir.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  mostrarLogin();
});

function renderPermisos(usuarios) {
  const tabla = el('tablaPermisos');
  if (!tabla) return;
  const cuerpo = tabla.querySelector('tbody');
  cuerpo.innerHTML = '';
  const PERM_CAMPOS = [
    { key: 'perm_inscripciones', label: 'Inscripciones' },
    { key: 'perm_talleres', label: 'Talleres' },
    { key: 'perm_encuentro', label: 'Encuentro' },
    { key: 'perm_acreditacion', label: 'Acreditación' },
  ];
  for (const u of usuarios) {
    const tr = document.createElement('tr');
    const tdUser = document.createElement('td');
    tdUser.innerHTML = `<strong>${escapeHtml(u.username)}</strong><br><span style="color:var(--color-texto-suave);font-size:0.85rem;">${escapeHtml(u.nombre)} (${u.rol})</span>`;
    tr.appendChild(tdUser);
    for (const p of PERM_CAMPOS) {
      const td = document.createElement('td');
      td.style.textAlign = 'center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!u[p.key];
      cb.dataset.userId = u.id;
      cb.dataset.perm = p.key;
      cb.addEventListener('change', async () => {
        const payload = {};
        for (const pp of PERM_CAMPOS) {
          const input = tabla.querySelector(`input[data-user-id="${u.id}"][data-perm="${pp.key}"]`);
          payload[pp.key] = input ? input.checked : false;
        }
        const res = await api(`/api/admin/usuarios/${u.id}`, { method: 'PUT', body: JSON.stringify(payload) });
        if (!res.ok) {
          mostrarMensaje(el('mensajePermisos'), res.data.error || 'No se pudo guardar.', 'error');
          cb.checked = !cb.checked;
        } else {
          mostrarMensaje(el('mensajePermisos'), `Permisos de ${u.username} actualizados.`, 'ok');
        }
      });
      td.appendChild(cb);
      tr.appendChild(td);
    }
    cuerpo.appendChild(tr);
  }
}

el('formPermisos').addEventListener('submit', (e) => {
  e.preventDefault();
});

// ── Ponentes (catálogo) ─────────────────────────────────────────────
const mensajePonente = el('mensajePonente');
const botonNuevoPonente = el('botonNuevoPonente');
const botonCancelarPonente = el('botonCancelarPonente');
const buscarPonente = el('buscarPonente');
const ponenteFoto = el('ponenteFoto');
const ponenteFotoPreview = el('ponenteFotoPreview');
const ponenteFotoLabel = el('ponenteFotoLabel');

let ponentes = [];
let diasPonentes = [];
let compressedFoto = null;

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

function initials(nombre) {
  return String(nombre || '')
    .split(/[\s–-]+/)
    .filter((w) => w.length > 0)
    .map((w) => w[0].toUpperCase())
    .slice(0, 2)
    .join('');
}

function ponenteThumb(p) {
  if (p.foto) {
    return `<img src="${escapeHtml(p.foto)}" alt="" style="width:100%;height:100%;object-fit:cover;">`;
  }
  return `<span style="font-weight:700;color:var(--color-texto-suave);">${initials(p.nombre)}</span>`;
}

const ETIQUETAS_TIPO_PONENTE = { ponencia: 'Ponencia', taller: 'Taller', conversatorio: 'Conversatorio' };

function renderTablaPonentes() {
  const cuerpo = document.querySelector('#tablaPonentes tbody');
  cuerpo.innerHTML = '';
  const q = buscarPonente.value.trim().toLowerCase();
  const lista = ponentes.filter(
    (p) => !q || String(p.nombre || '').toLowerCase().includes(q) || String(p.titulo || '').toLowerCase().includes(q)
  );
  if (lista.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = q ? 'Sin resultados para el filtro.' : 'No hay ponentes cargados.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }
  for (const p of lista) {
    const tr = document.createElement('tr');
    tr.dataset.id = p.id;

    const tdFoto = document.createElement('td');
    const thumb = document.createElement('div');
    thumb.className = 'ponente-thumb';
    thumb.innerHTML = ponenteThumb(p);
    tdFoto.appendChild(thumb);

    const tdNombre = document.createElement('td');
    tdNombre.innerHTML = `<strong>${escapeHtml(p.nombre)}</strong>`;

    const tdTipo = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `ponente-badge badge-${p.tipo}`;
    badge.textContent = ETIQUETAS_TIPO_PONENTE[p.tipo] || p.tipo;
    tdTipo.appendChild(badge);
    if (p.tipo === 'taller') {
      const linea = document.createElement('div');
      linea.style.fontSize = '0.75rem';
      linea.style.marginTop = '4px';
      linea.style.color = 'var(--color-texto-suave)';
      linea.textContent = `Cupo: ${p.cupo ?? 20}`;
      tdTipo.appendChild(linea);
    }

    const tdTitulo = document.createElement('td');
    tdTitulo.textContent = p.titulo || '';

    const tdHorario = document.createElement('td');
    const slots = []; 
    slots.push(`Día ${p.dia ?? 1} · ${escapeHtml(p.horario || '—')}`);
    if (p.dia2) slots.push(`Día ${p.dia2} · ${escapeHtml(p.horario2 || '—')}`);
    tdHorario.innerHTML = slots.join('<br>');

    const tdAcciones = document.createElement('td');
    const cont = document.createElement('div');
    cont.className = 'acciones-fila';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'boton boton-chico';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => abrirModalPonente(p.id));
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'boton boton-peligro boton-chico';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', () => eliminarPonente(p.id));
    cont.appendChild(btnEditar);
    cont.appendChild(btnEliminar);
    tdAcciones.appendChild(cont);

    tr.append(tdFoto, tdNombre, tdTipo, tdTitulo, tdHorario, tdAcciones);
    cuerpo.appendChild(tr);
  }
}

function renderDiasPonentes() {
  const box = el('diasPonentes');
  const diasUsados = [...new Set(ponentes.flatMap((p) => [p.dia, p.dia2].filter((d) => d)))]
    .sort((a, b) => a - b);
  if (!diasUsados.length) {
    box.innerHTML = '<span class="ayuda">Aún no hay días definidos.</span>';
    return;
  }
  box.innerHTML = diasUsados
    .map((dia) => {
      const d = diasPonentes.find((x) => x.dia === dia);
      return `
        <div class="ponente-dia-item">
          <strong>Día ${dia}</strong>
          <input type="text" data-dia="${dia}" value="${escapeHtml((d && d.fecha) || '')}" placeholder="DD-MM-AAAA">
        </div>`;
    })
    .join('');
  box.querySelectorAll('input').forEach((input) => {
    input.addEventListener('change', guardarFechasPonentes);
  });
}

async function guardarFechasPonentes() {
  const data = [...document.querySelectorAll('#diasPonentes input')].map((input) => ({
    dia: Number.parseInt(input.dataset.dia, 10),
    fecha: input.value.trim(),
  }));
  if (!data.length) return;
  const res = await api('/api/admin/ponentes/dias', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePonente, res.data.error || 'No se pudieron guardar las fechas.', 'error');
  } else {
    diasPonentes = res.data;
    mostrarMensaje(mensajePonente, 'Fechas guardadas.', 'ok');
  }
}

async function cargarPonentes() {
  const [ponentesRes, diasRes] = await Promise.all([
    api('/api/admin/ponentes'),
    api('/api/admin/ponentes/dias'),
  ]);
  if (!ponentesRes.ok) {
    mostrarMensaje(mensajePonente, ponentesRes.data.error || 'No se pudieron cargar los ponentes.', 'error');
    return;
  }
  ponentes = ponentesRes.data || [];
  diasPonentes = diasRes.ok ? diasRes.data || [] : [];
  renderTablaPonentes();
  renderDiasPonentes();
}

function abrirModalPonente(id) {
  ponenteEditandoId = id ?? null;
  formPonente.reset();
  compressedFoto = null;
  ponenteFotoLabel.textContent = 'Sin fotografía';
  ponenteFotoPreview.style.display = 'none';
  ponenteFotoPreview.src = '';

  el('modalPonenteTitulo').textContent = id ? 'Editar ponente' : 'Nuevo ponente';
  mostrarMensaje(mensajePonente, '', '');

  if (id) {
    const p = ponentes.find((x) => Number(x.id) === Number(id));
    if (p) {
      el('ponenteId').value = p.id;
      el('ponenteNombre').value = p.nombre;
      el('ponenteTipo').value = p.tipo;
      el('ponenteCupo').value = p.cupo ?? 20;
      el('ponenteDia').value = p.dia ?? 1;
      el('ponenteHorario').value = p.horario || '';
      el('ponenteDia2').value = p.dia2 || '';
      el('ponenteHorario2').value = p.horario2 || '';
      el('ponenteTitulo').value = p.titulo || '';
      el('ponenteDescripcion').value = p.descripcion || '';
      el('ponenteFotoPos').value = p.foto_pos || '';
      if (p.foto) {
        ponenteFotoPreview.src = p.foto;
        ponenteFotoPreview.style.display = 'block';
        ponenteFotoLabel.textContent = 'Imagen actual (solo se reemplaza si elegís una nueva)';
      }
    }
  }
  modalPonente.hidden = false;
  modalPonente.setAttribute('aria-hidden', 'false');
  el('ponenteNombre').focus();
}

function cerrarModalPonente() {
  modalPonente.hidden = true;
  modalPonente.setAttribute('aria-hidden', 'true');
  ponenteEditandoId = null;
}

botonCancelarPonente.addEventListener('click', cerrarModalPonente);
el('botonCerrarPonente').addEventListener('click', cerrarModalPonente);

botonNuevoPonente.addEventListener('click', () => abrirModalPonente(null));

buscarPonente.addEventListener('input', renderTablaPonentes);

ponenteFoto.addEventListener('change', async () => {
  const file = ponenteFoto.files[0];
  if (!file) {
    compressedFoto = null;
    return;
  }
  try {
    compressedFoto = await compressImagen(file);
  } catch {
    compressedFoto = null;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    ponenteFotoPreview.src = e.target.result;
    ponenteFotoPreview.style.display = 'block';
    ponenteFotoLabel.textContent = compressedFoto
      ? 'Nueva fotografía (se comprimirá automáticamente al guardar)'
      : 'Nueva fotografía seleccionada';
  };
  reader.readAsDataURL(file);
});

function compressImagen(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    const MAX = 800;
    img.onload = () => {
      const { width: w, height: h } = img;
      const ratio = Math.min(1, MAX / Math.max(w, h));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (!blob) return reject(new Error('No se pudo comprimir la imagen'));
        blob.name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
        resolve(blob);
      }, 'image/jpeg', 0.85);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}

formPonente.addEventListener('submit', async (e) => {
  e.preventDefault();
  const nombre = el('ponenteNombre').value.trim();
  if (!nombre) {
    mostrarMensaje(mensajePonente, 'El nombre es obligatorio.', 'error');
    return;
  }
  const esEdicion = !!ponenteEditandoId;
  const fd = new FormData();
  fd.append('nombre', nombre);
  fd.append('tipo', el('ponenteTipo').value);
  fd.append('cupo', el('ponenteCupo').value);
  fd.append('dia', el('ponenteDia').value);
  fd.append('horario', el('ponenteHorario').value);
  fd.append('dia2', el('ponenteDia2').value);
  fd.append('horario2', el('ponenteHorario2').value);
  fd.append('foto_pos', el('ponenteFotoPos').value);
  fd.append('titulo', el('ponenteTitulo').value);
  fd.append('descripcion', el('ponenteDescripcion').value);
  if (compressedFoto) fd.append('foto', compressedFoto, compressedFoto.name);
  else if (ponenteFoto.files[0]) fd.append('foto', ponenteFoto.files[0]);

  el('botonGuardarPonente').disabled = true;
  const res = esEdicion
    ? await fetch(`/api/admin/ponentes/${ponenteEditandoId}`, { method: 'PUT', body: fd })
    : await fetch('/api/admin/ponentes', { method: 'POST', body: fd });
  let data = {};
  try { data = await res.json(); } catch { data = {}; }
  el('botonGuardarPonente').disabled = false;

  if (!res.ok) {
    mostrarMensaje(mensajePonente, data.error || 'No se pudo guardar el ponente.', 'error');
    return;
  }
  mostrarMensaje(mensajePonente, esEdicion ? 'Ponente actualizado.' : 'Ponente creado.', 'ok');
  cerrarModalPonente();
  await cargarPonentes();
});

async function eliminarPonente(id) {
  const p = ponentes.find((x) => Number(x.id) === Number(id));
  if (!p) return;
  if (!window.confirm(`¿Eliminar a "${p.nombre}"? Esta acción no se puede deshacer.`)) return;
  const res = await api(`/api/admin/ponentes/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    mostrarMensaje(mensajePonente, res.data.error || 'No se pudo eliminar.', 'error');
  } else {
    mostrarMensaje(mensajePonente, 'Ponente eliminado.', 'ok');
    await cargarPonentes();
  }
}

// ── Pagos y cuotas ────────────────────────────────────────────────
const mensajePagos = el('mensajePagos');
const formPlanPago = el('formPlanPago');
const planIdEditando = el('planIdEditando');
const planNombre = el('planNombre');
const planDescripcion = el('planDescripcion');
const planMonto = el('planMonto');
const planCuotas = el('planCuotas');
const planActivo = el('planActivo');
const botonGuardarPlan = el('botonGuardarPlan');
const botonCancelarPlan = el('botonCancelarPlan');
const tablaPlanes = el('tablaPlanes');
const formAsignarPlan = el('formAsignarPlan');
const asignarDni = el('asignarDni');
const asignarPlan = el('asignarPlan');
const botonAsignarPlan = el('botonAsignarPlan');
const tablaPagos = el('tablaPagos');
const resumenPagos = el('resumenPagos');
const filtroPagoDni = el('filtroPagoDni');
const modalCuota = el('modalCuota');
const modalCuotaInfo = el('modalCuotaInfo');
const modalCuotaPlanId = el('modalCuotaPlanId');
const modalCuotaNumero = el('modalCuotaNumero');
const modalCuotaMonto = el('modalCuotaMonto');
const modalCuotaFecha = el('modalCuotaFecha');
const botonGuardarCuota = el('botonGuardarCuota');
const botonCancelarCuota = el('botonCancelarCuota');

let planesPago = [];
let pagosAsistentes = [];
let cuotaContexto = null;

function formatearMoneda(n) {
  return Number(n ?? 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pagarPorCuota(ap) {
  const n = Number(ap.cantidadCuotas) || 1;
  return (Number(ap.montoTotal) || 0) / n;
}

function cuotaPagadaSet(ap) {
  const s = new Set();
  for (const c of ap.cuotas || []) s.add(c.numero);
  return s;
}

async function cargarPagos() {
  const [planesRes, pagosRes] = await Promise.all([
    api('/api/admin/pagos/planes'),
    api('/api/admin/pagos'),
  ]);
  if (!planesRes.ok || !pagosRes.ok) {
    mostrarMensaje(mensajePagos, 'No se pudieron cargar los pagos.', 'error');
    return;
  }
  planesPago = planesRes.data || [];
  pagosAsistentes = pagosRes.data || [];
  prellenarSelectPlanes();
  renderPlanesPago();
  renderPagos();
}

function prellenarSelectPlanes() {
  asignarPlan.innerHTML = '';
  for (const p of planesPago) {
    const opcion = document.createElement('option');
    opcion.value = p.id;
    opcion.textContent = `${p.nombre} — ${formatearMoneda(p.monto_total)} / ${p.cantidad_cuotas} cuota(s)`;
    asignarPlan.appendChild(opcion);
  }
}

function renderPlanesPago() {
  const tbody = tablaPlanes.querySelector('tbody');
  tbody.innerHTML = '';
  if (planesPago.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = 'No hay planes creados.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const p of planesPago) {
    const tr = document.createElement('tr');
    const tdNombre = document.createElement('td');
    tdNombre.textContent = p.nombre;
    const tdDesc = document.createElement('td');
    tdDesc.textContent = p.descripcion || '—';
    const tdMonto = document.createElement('td');
    tdMonto.textContent = formatearMoneda(p.monto_total);
    const tdCuotas = document.createElement('td');
    tdCuotas.textContent = p.cantidad_cuotas;
    const tdActivo = document.createElement('td');
    tdActivo.textContent = p.activo ? 'Sí' : 'No';
    tdActivo.className = p.activo ? 'encuentro-si' : 'encuentro-no';
    const tdAcciones = document.createElement('td');
    const cont = document.createElement('div');
    cont.className = 'acciones-fila';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'boton boton-chico';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => editarPlanPago(p));
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'boton boton-peligro boton-chico';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', () => eliminarPlanPago(p));
    cont.appendChild(btnEditar);
    cont.appendChild(btnEliminar);
    tdAcciones.appendChild(cont);
    tr.append(tdNombre, tdDesc, tdMonto, tdCuotas, tdActivo, tdAcciones);
    tbody.appendChild(tr);
  }
}

function editarPlanPago(p) {
  planIdEditando.value = p.id;
  planNombre.value = p.nombre;
  planDescripcion.value = p.descripcion || '';
  planMonto.value = p.monto_total;
  planCuotas.value = p.cantidad_cuotas;
  planActivo.checked = Boolean(p.activo);
  botonGuardarPlan.textContent = 'Actualizar plan';
  botonCancelarPlan.hidden = false;
}

function resetFormPlan() {
  planIdEditando.value = '';
  formPlanPago.reset();
  planActivo.checked = true;
  botonCancelarPlan.hidden = true;
  botonGuardarPlan.textContent = 'Guardar plan';
}

async function eliminarPlanPago(p) {
  if (!window.confirm(`¿Eliminar el plan "${p.nombre}"? Se eliminarán las cuotas asociadas.`)) return;
  const res = await api(`/api/admin/pagos/planes/${p.id}`, { method: 'DELETE' });
  if (!res.ok) {
    mostrarMensaje(mensajePagos, res.data.error || 'No se pudo eliminar el plan.', 'error');
  } else {
    mostrarMensaje(mensajePagos, 'Plan eliminado.', 'ok');
    await cargarPagos();
  }
}

formPlanPago.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = planIdEditando.value;
  const uri = id ? `/api/admin/pagos/planes/${id}` : '/api/admin/pagos/planes';
  const method = id ? 'PUT' : 'POST';
  const res = await api(uri, {
    method,
    body: JSON.stringify({
      nombre: planNombre.value.trim(),
      descripcion: planDescripcion.value.trim(),
      monto_total: Number(planMonto.value) || 0,
      cantidad_cuotas: Number(planCuotas.value) || 1,
      activo: planActivo.checked,
    }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePagos, res.data.error || 'No se pudo guardar el plan.', 'error');
  } else {
    mostrarMensaje(mensajePagos, id ? 'Plan actualizado.' : 'Plan creado.', 'ok');
    resetFormPlan();
    await cargarPagos();
  }
});

botonCancelarPlan.addEventListener('click', resetFormPlan);

formAsignarPlan.addEventListener('submit', async (e) => {
  e.preventDefault();
  const dni = asignarDni.value.trim().replace(/\D/g, '');
  if (!dni) {
    mostrarMensaje(mensajePagos, 'Indicá un DNI.', 'error');
    return;
  }
  if (!asignarPlan.value) {
    mostrarMensaje(mensajePagos, 'Seleccioná un plan.', 'error');
    return;
  }
  botonAsignarPlan.disabled = true;
  const res = await api('/api/admin/pagos/asignar', {
    method: 'POST',
    body: JSON.stringify({ dni, plan_id: Number(asignarPlan.value) }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePagos, res.data.error || 'No se pudo asignar el plan.', 'error');
  } else {
    mostrarMensaje(mensajePagos, 'Plan asignado.', 'ok');
    asignarDni.value = '';
    await cargarPagos();
  }
  botonAsignarPlan.disabled = false;
});

function renderPagos() {
  const tbody = tablaPagos.querySelector('tbody');
  tbody.innerHTML = '';
  const dniFiltro = filtroPagoDni.value.trim().replace(/\D/g, '');
  const visibles = pagosAsistentes.filter((a) => !dniFiltro || String(a.dni).includes(dniFiltro));
  resumenPagos.textContent = `Asistentes con plan: ${pagosAsistentes.length}.`;
  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 6;
    td.textContent = dniFiltro ? 'Sin resultados.' : 'No hay asistentes con plan asignado.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const a of visibles) {
    const tr = document.createElement('tr');
    const pagadas = cuotaPagadaSet(a);
    const n = Number(a.cantidadCuotas) || 1;
    const cuota = pagarPorCuota(a);

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = a.dni;
    const tdNombre = document.createElement('td');
    tdNombre.textContent = [a.apellido, a.nombre].filter(Boolean).join(', ') || '—';
    const tdPlan = document.createElement('td');
    tdPlan.textContent = a.planNombre || '—';
    const tdTotal = document.createElement('td');
    tdTotal.textContent = `${formatearMoneda(a.montoTotal)} / ${formatearMoneda(cuota)}`;
    tdTotal.className = 'pagos-total';

    const tdCuotas = document.createElement('td');
    const caja = document.createElement('div');
    caja.className = 'pagos-cuotas';
    for (let i = 1; i <= n; i++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      const pagada = pagadas.has(i);
      chip.className = 'pagos-cuota' + (pagada ? ' pagos-cuota-pagada' : '');
      chip.textContent = pagada ? `✓ ${i}` : `${i}`;
      chip.addEventListener('click', () => abrirModalCuota(a, i, pagada));
      caja.appendChild(chip);
    }
    tdCuotas.appendChild(caja);

    const tdEstado = document.createElement('td');
    const pagadasN = pagadas.size;
    const estado = pagadasN >= n ? 'pago_completo' : pagadasN === 0 ? 'no_pagado' : 'pago_parcial';
    const spanEstado = document.createElement('span');
    spanEstado.className = `estado-pago-texto ${estado}`;
    spanEstado.textContent = ETIQUETAS_PAGO[estado] || '—';
    tdEstado.appendChild(spanEstado);

    tr.append(tdDni, tdNombre, tdPlan, tdTotal, tdCuotas, tdEstado);
    tbody.appendChild(tr);
  }
}

function abrirModalCuota(a, numero, pagada) {
  cuotaContexto = { asistentePlanId: a.asistentePlanId, numero, pagada };
  const pagoPrevio = a.cuotas.find((c) => c.numero === numero);
  modalCuotaPlanId.value = a.asistentePlanId;
  modalCuotaNumero.value = numero;
  modalCuotaMonto.value = pagada ? (pagoPrevio ? pagoPrevio.monto : pagarPorCuota(a)) : pagarPorCuota(a);
  modalCuotaFecha.value = pagada ? (pagoPrevio && pagoPrevio.fecha ? pagoPrevio.fecha : '') : new Date().toISOString().slice(0, 10);
  const nombre = [a.apellido, a.nombre].filter(Boolean).join(', ') || a.dni;
  modalCuotaInfo.textContent = `${nombre} · Cuota ${numero}/${a.cantidadCuotas}`;
  document.getElementById('modalCuotaTitulo').textContent = pagada ? 'Quitar pago de cuota' : 'Registrar pago de cuota';
  botonGuardarCuota.textContent = pagada ? 'Quitar pago' : 'Registrar pago';
  modalCuota.hidden = false;
  modalCuota.setAttribute('aria-hidden', 'false');
}

function cerrarModalCuota() {
  modalCuota.hidden = true;
  modalCuota.setAttribute('aria-hidden', 'true');
  cuotaContexto = null;
}

modalCuota.addEventListener('click', (e) => {
  if (e.target === modalCuota) cerrarModalCuota();
});

botonCancelarCuota.addEventListener('click', cerrarModalCuota);

botonGuardarCuota.addEventListener('click', async () => {
  if (!cuotaContexto) return;
  const { asistentePlanId, numero, pagada } = cuotaContexto;
  botonGuardarCuota.disabled = true;
  if (pagada) {
    const res = await api('/api/admin/pagos/cuota', {
      method: 'DELETE',
      body: JSON.stringify({ asistente_plan_id: asistentePlanId, numero_cuota: numero }),
    });
    if (!res.ok) {
      mostrarMensaje(mensajePagos, res.data.error || 'No se pudo quitar el pago.', 'error');
    } else {
      mostrarMensaje(mensajePagos, 'Pago de cuota eliminado.', 'ok');
      cerrarModalCuota();
      await cargarPagos();
    }
  } else {
    const res = await api('/api/admin/pagos/cuota', {
      method: 'POST',
      body: JSON.stringify({
        asistente_plan_id: asistentePlanId,
        numero_cuota: numero,
        monto: Number(modalCuotaMonto.value) || 0,
        fecha_pago: modalCuotaFecha.value,
      }),
    });
    if (!res.ok) {
      mostrarMensaje(mensajePagos, res.data.error || 'No se pudo registrar el pago.', 'error');
    } else {
      mostrarMensaje(mensajePagos, 'Pago de cuota registrado.', 'ok');
      cerrarModalCuota();
      await cargarPagos();
    }
  }
  botonGuardarCuota.disabled = false;
});

filtroPagoDni.addEventListener('input', renderPagos);

// ── Notificaciones a la app móvil ──────────────────────────────────
const mensajeNotificaciones = el('mensajeNotificaciones');
const formNotificacion = el('formNotificacion');
const notifTitulo = el('notifTitulo');
const notifMensaje = el('notifMensaje');
const notifTipo = el('notifTipo');
const notifActiva = el('notifActiva');
const botonGuardarNotif = el('botonGuardarNotif');
const botonCancelarNotif = el('botonCancelarNotif');
const tablaNotificaciones = el('tablaNotificaciones');

const ETIQUETAS_TIPO_NOTIF = { info: 'Info', alerta: 'Alerta', urgente: 'Urgente', recordatorio: 'Recordatorio' };

let notifEditandoId = null;

function formatearFechaCompleta(valor) {
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return valor || '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(-2)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

async function cargarNotificaciones() {
  const res = await api('/api/admin/notificaciones');
  if (!res.ok) {
    mostrarMensaje(mensajeNotificaciones, res.data.error || 'No se pudieron cargar las notificaciones.', 'error');
    return;
  }
  renderNotificaciones(res.data || []);
}

function renderNotificaciones(lista) {
  const tbody = tablaNotificaciones.querySelector('tbody');
  tbody.innerHTML = '';
  if (lista.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
    td.textContent = 'No hay notificaciones creadas.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const n of lista) {
    const tr = document.createElement('tr');

    const tdTitulo = document.createElement('td');
    tdTitulo.textContent = n.titulo;
    tdTitulo.style.fontWeight = 'bold';

    const tdTipo = document.createElement('td');
    tdTipo.textContent = ETIQUETAS_TIPO_NOTIF[n.tipo] || n.tipo;
    tdTipo.className = 'notif-tipo-' + (ETIQUETAS_TIPO_NOTIF[n.tipo] ? n.tipo : 'info');

    const tdMensaje = document.createElement('td');
    tdMensaje.textContent = n.mensaje || '';
    tdMensaje.style.whiteSpace = 'normal';

    const tdEstado = document.createElement('td');
    tdEstado.style.textAlign = 'center';
    const checkVisible = document.createElement('input');
    checkVisible.type = 'checkbox';
    checkVisible.checked = Boolean(n.activa);
    checkVisible.title = 'Visible para la app móvil';
    checkVisible.addEventListener('change', async () => {
      checkVisible.disabled = true;
      const res = await api(`/api/admin/notificaciones/${n.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          titulo: n.titulo,
          mensaje: n.mensaje,
          tipo: n.tipo || 'info',
          activa: checkVisible.checked,
        }),
      });
      if (!res.ok) {
        checkVisible.checked = !checkVisible.checked;
        mostrarMensaje(mensajeNotificaciones, res.data.error || 'No se pudo actualizar la notificación.', 'error');
      } else {
        mostrarMensaje(
          mensajeNotificaciones,
          checkVisible.checked ? 'La notificación ya es visible para la app.' : 'La notificación quedó oculta en la app.',
          'ok'
        );
        await cargarNotificaciones();
      }
      checkVisible.disabled = false;
    });
    tdEstado.appendChild(checkVisible);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = n.creado_en_texto || formatearFechaCompleta(n.creado_en);

    const tdUsuario = document.createElement('td');
    tdUsuario.textContent = n.creado_por || '—';

    const tdAcciones = document.createElement('td');
    const cont = document.createElement('div');
    cont.className = 'acciones-fila';
    const btnEditar = document.createElement('button');
    btnEditar.type = 'button';
    btnEditar.className = 'boton boton-chico';
    btnEditar.textContent = 'Editar';
    btnEditar.addEventListener('click', () => editarNotificacion(n));
    const btnEliminar = document.createElement('button');
    btnEliminar.type = 'button';
    btnEliminar.className = 'boton boton-peligro boton-chico';
    btnEliminar.textContent = 'Eliminar';
    btnEliminar.addEventListener('click', () => eliminarNotificacion(n));
    cont.appendChild(btnEditar);
    cont.appendChild(btnEliminar);
    tdAcciones.appendChild(cont);

    tr.append(tdTitulo, tdTipo, tdMensaje, tdEstado, tdFecha, tdUsuario, tdAcciones);
    tbody.appendChild(tr);
  }
}

function editarNotificacion(n) {
  notifEditandoId = n.id;
  notifTitulo.value = n.titulo;
  notifMensaje.value = n.mensaje;
  notifTipo.value = n.tipo || 'info';
  notifActiva.checked = Boolean(n.activa);
  botonGuardarNotif.textContent = 'Guardar cambios';
  botonCancelarNotif.hidden = false;
  el('vistaNotificaciones').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetFormNotificacion() {
  notifEditandoId = null;
  formNotificacion.reset();
  notifTipo.value = 'info';
  notifActiva.checked = true;
  botonCancelarNotif.hidden = true;
  botonGuardarNotif.textContent = 'Publicar notificación';
}

async function eliminarNotificacion(n) {
  if (!window.confirm(`¿Eliminar la notificación "${n.titulo}"?`)) return;
  const res = await api(`/api/admin/notificaciones/${n.id}`, { method: 'DELETE' });
  if (!res.ok) {
    mostrarMensaje(mensajeNotificaciones, res.data.error || 'No se pudo eliminar.', 'error');
  } else {
    mostrarMensaje(mensajeNotificaciones, 'Notificación eliminada.', 'ok');
    await cargarNotificaciones();
  }
}

formNotificacion.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    titulo: notifTitulo.value.trim(),
    mensaje: notifMensaje.value.trim(),
    tipo: notifTipo.value,
    activa: notifActiva.checked,
  };
  if (!payload.titulo || !payload.mensaje) {
    mostrarMensaje(mensajeNotificaciones, 'Completá título y mensaje.', 'error');
    return;
  }
  botonGuardarNotif.disabled = true;
  const res = notifEditandoId
    ? await api(`/api/admin/notificaciones/${notifEditandoId}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await api('/api/admin/notificaciones', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) {
    mostrarMensaje(mensajeNotificaciones, res.data.error || 'No se pudo guardar la notificación.', 'error');
  } else {
    mostrarMensaje(
      mensajeNotificaciones,
      notifEditandoId ? 'Notificación actualizada.' : 'Notificación publicada. La app la verá al sincronizar.',
      'ok'
    );
    resetFormNotificacion();
    await cargarNotificaciones();
  }
  botonGuardarNotif.disabled = false;
});

botonCancelarNotif.addEventListener('click', resetFormNotificacion);

(async () => {
  const res = await api('/api/admin/perfil');
  if (res.ok) {
    miSesion = {
      usuario: res.data.usuario,
      nombre: res.data.nombre,
      rol: res.data.rol,
      perm_acreditacion: Boolean(res.data.perm_acreditacion),
    };
    await cargarDatos();
  } else {
    mostrarLogin();
  }
})();
