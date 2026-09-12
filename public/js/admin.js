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
  dashboard: 'Dashboard',
  inscripciones: 'Inscripciones',
  ponentes: 'Ponentes',
  programa: 'Programa del Encuentro',
  encuentro: 'Importar listado',
  pagos: 'Gestión de pagos y cuotas',
  notificaciones: 'Notificaciones a la app móvil',
  acreditaciones: 'Acreditaciones',
  comidas: 'Gestión de Menús',
  eventos: 'Registro de eventos',
  usuarios: 'Usuarios',
  permisos: 'Permisos del sistema',
};
const ETIQUETAS_PAGO = {
  no_pagado: 'No pagado',
  pago_parcial: 'Pago parcial',
  pago_completo: 'Pago completo',
};
const TZ_SALTA = 'America/Argentina/Salta';

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
let vistaActiva = 'dashboard';
let dniQrActual = null;
let ponenteEditandoId = null;
let encuentroPersonas = [];
let encuentroEditando = null;
let asistentesData = [];
let asistenteEditando = null;

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
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
    ...opciones,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function formatearFecha(valor) {
  if (!valor) return '';
  const str = String(valor).trim();
  const iso = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[3].padStart(2, '0')}/${iso[2].padStart(2, '0')}/${iso[1]}`;
  }
  // Si es fecha+hora (ISO con T o con hora), formatear en Salta como DD/MM/AAAA - HH:MM
  if (/[T ]\d{1,2}:\d{2}/.test(str)) {
    const fecha = new Date(str);
    if (!Number.isNaN(fecha.getTime())) {
      return new Intl.DateTimeFormat('es-AR', { timeZone: TZ_SALTA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(fecha).replace(',', ' -');
    }
  }
  const partes = str.split(/[/\-]/);
  if (partes.length >= 3 && !/[T:]/.test(str)) {
    const d = partes[0].padStart(2, '0');
    const m = partes[1].padStart(2, '0');
    const y = partes[2].length === 2 ? `20${partes[2]}` : partes[2];
    return `${d}/${m}/${y}`;
  }
  const fecha = new Date(str);
  if (Number.isNaN(fecha.getTime())) return valor;
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ_SALTA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(fecha).replace(',', ' -');
}

function mostrarLogin() {
  vistaLogin.hidden = false;
  vistaPanel.hidden = true;
  miSesion = null;
  const sb = el('sidebar');
  const ov = el('sidebarOverlay');
  const tb = document.querySelector('.app-topbar');
  if (sb) sb.hidden = true;
  if (ov) ov.hidden = true;
  if (tb) tb.hidden = true;
  document.body.classList.add('is-login');
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
    cambiarVista('dashboard');
  } else {
    cambiarVista(vistaActiva);
  }
  const textoUsuario = `${miSesion.nombre || miSesion.usuario} · ${ETIQUETAS_ROL[miSesion.rol] || miSesion.rol}`;
  el('usuarioActual').textContent = textoUsuario;
  const sidebarInfo = el('sidebarUserInfo');
  if (sidebarInfo) sidebarInfo.textContent = textoUsuario;
  const sb = el('sidebar');
  const ov = el('sidebarOverlay');
  const tb = document.querySelector('.app-topbar');
  if (sb) sb.hidden = false;
  if (ov) ov.hidden = false;
  if (tb) tb.hidden = false;
  document.body.classList.remove('is-login');
  // sync sidebar collapsed state
  const collapsed = localStorage.getItem('dramatiza-sidebar') === 'collapsed';
  document.body.classList.toggle('sidebar-collapsed', collapsed && window.innerWidth > 860);
}

let intervaloAcreditaciones = null;
let intervaloComidas = null;

function detenerPollingAcreditaciones() {
  if (intervaloAcreditaciones) { clearInterval(intervaloAcreditaciones); intervaloAcreditaciones = null; }
  if (intervaloComidas) { clearInterval(intervaloComidas); intervaloComidas = null; }
}

function cambiarVista(vista) {
  vistaActiva = vista;
  detenerPollingAcreditaciones();
  for (const tab of document.querySelectorAll('.tab')) {
    tab.classList.toggle('activo', tab.dataset.vista === vista);
  }
  for (const nombre of Object.keys(TITULOS_VISTA)) {
    const contenedor = el(`vista${nombre[0].toUpperCase()}${nombre.slice(1)}`);
    if (contenedor) contenedor.hidden = nombre !== vista;
  }
  const titulo = el('tituloPanel');
  if (titulo) titulo.textContent = TITULOS_VISTA[vista] || 'Panel';
  // cerrar sidebar en móvil
  if (window.innerWidth <= 860) {
    const sb = el('sidebar');
    const ov = el('sidebarOverlay');
    if (sb) sb.classList.remove('open');
    if (ov) ov.classList.remove('visible');
  }
  if (vista === 'dashboard') {
    cargarDashboard();
  }
  if (vista === 'ponentes') {
    cargarPonentes();
  }
  if (vista === 'programa') {
    cargarProgramaAdmin();
  }
  if (vista === 'acreditaciones') {
    cargarAcreditaciones();
    intervaloAcreditaciones = setInterval(() => {
      if (vistaActiva === 'acreditaciones' && !document.hidden) cargarAcreditaciones(true);
    }, 15000);
  }
  if (vista === 'comidas') {
    cargarComidas();
    intervaloComidas = setInterval(() => {
      if (vistaActiva === 'comidas' && !document.hidden) cargarComidas(true);
    }, 15000);
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

/* ── Sidebar custom ligero ─────────────────────────────── */
(function initSidebar() {
  const btn = el('btnToggleSidebar');
  const sidebar = el('sidebar');
  const overlay = el('sidebarOverlay');
  const filter = el('sidebarFilter');
  if (!btn || !sidebar) return;
  const toggle = () => {
    if (window.innerWidth <= 860) {
      const open = sidebar.classList.toggle('open');
      if (overlay) overlay.classList.toggle('visible', open);
    } else {
      const collapsed = document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('dramatiza-sidebar', collapsed ? 'collapsed' : 'expanded');
    }
  };
  btn.addEventListener('click', toggle);
  if (overlay) overlay.addEventListener('click', () => {
    sidebar.classList.remove('open');
    overlay.classList.remove('visible');
  });
  if (filter) {
    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      for (const link of document.querySelectorAll('.sidebar-link')) {
        const txt = (link.textContent || '').toLowerCase();
        // no ocultar si es título filtrado, solo links
        link.style.display = !q || txt.includes(q) ? '' : 'none';
      }
      for (const title of document.querySelectorAll('.sidebar-section-title')) {
        // ocultar título si todos sus links siguientes están ocultos
        let next = title.nextElementSibling;
        let hasVisible = false;
        while (next && !next.classList.contains('sidebar-section-title') && !next.classList.contains('sidebar-footer')) {
          if (next.classList.contains('sidebar-link') && next.style.display !== 'none' && !next.hidden) { hasVisible = true; break; }
          next = next.nextElementSibling;
        }
        title.style.display = hasVisible || !q ? '' : 'none';
      }
    });
  }
  // Ver más dashboard
  const btnVer = el('btnVerInscripciones');
  if (btnVer) btnVer.addEventListener('click', () => cambiarVista('inscripciones'));
  const btnActDash = el('botonActualizarDashboard');
  if (btnActDash) btnActDash.addEventListener('click', () => cargarDashboard());
})();

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
  el('subInscripcionesAsistentes').hidden = sub !== 'asistentes';
  el('subInscripcionesEncuentro').hidden = sub !== 'encuentro';
  if (sub === 'encuentro') renderEncuentroPersonas(encuentroPersonas);
  if (sub === 'asistentes') {
    if (!asistentesData.length) cargarAsistentes();
    else renderAsistentes(asistentesData);
  }
}

document.querySelectorAll('#subTabsInscripciones .sub-tab').forEach((btn) => {
  btn.addEventListener('click', () => activarSubTabInscripcion(btn.dataset.sub));
});

function subTabPagosActiva() {
  return (document.querySelector('#subTabsPagos .sub-tab.activo') || {}).dataset?.sub || 'plan';
}

function activarSubTabPagos(sub) {
  if (subTabPagosActiva() === sub) return;
  for (const btn of document.querySelectorAll('#subTabsPagos .sub-tab')) {
    btn.classList.toggle('activo', btn.dataset.sub === sub);
  }
  el('subPagosPlan').hidden = sub !== 'plan';
  el('subPagosAsignar').hidden = sub !== 'asignar';
}

document.querySelectorAll('#subTabsPagos .sub-tab').forEach((btn) => {
  btn.addEventListener('click', () => activarSubTabPagos(btn.dataset.sub));
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
    if (lleno) label.title = 'No hay más cupos disponibles';
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.value = id;
    check.checked = marcado;
    check.disabled = lleno;
    const span = document.createElement('span');
    const etiqueta = lleno
      ? `${t.nombre} — No hay más cupos disponibles`
      : `${t.nombre} — ${t.cupo - t.inscriptos} cupos`;
    span.textContent = etiqueta;
    label.appendChild(check);
    label.appendChild(span);
    if (lleno) {
      label.addEventListener('click', (e) => {
        e.preventDefault();
        alert('No hay más cupos disponibles');
      });
    }
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
    const msg = res.data.error || 'No se pudieron actualizar los talleres.';
    mostrarMensaje(mensajePanel, msg, 'error');
    if (String(msg).toLowerCase().includes('cupo') || String(msg).toLowerCase().includes('no hay más cupos')) {
      alert('No hay más cupos disponibles');
    }
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
    const alimKey = i.alimentacion || 'sin_restriccion';
    const badgeAlim = document.createElement('span');
    badgeAlim.className = `badge badge-alim ${alimKey}`;
    badgeAlim.textContent = ETIQUETAS_ALIMENTACION[alimKey] || alimKey || '—';
    badgeAlim.title = ETIQUETAS_ALIMENTACION[alimKey] || alimKey;
    tdAlimentacion.appendChild(badgeAlim);

    const tdTaller = document.createElement('td');
    const talleresUnicos = [...new Map(filas.map((f) => [f.taller, f])).values()];
    const totalSesiones = filas.length;
    const divTalleres = document.createElement('div');
    divTalleres.className = 'lista-talleres-inscripcion';
    for (const ft of talleresUnicos) {
      const span = document.createElement('div');
      span.className = 'chip-taller';
      span.textContent = ft.taller;
      span.title = ft.taller;
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
    const enEnc = filas.some((f) => f.en_encuentro);
    const badgeEnc = document.createElement('span');
    badgeEnc.className = `badge ${enEnc ? 'badge-encuentro-si' : 'badge-encuentro-no'}`;
    badgeEnc.textContent = enEnc ? '✓ En encuentro' : '○ Sin encuentro';
    tdEncuentro.appendChild(badgeEnc);

    const tdPago = document.createElement('td');
    const spanPago = document.createElement('span');
    const estadoKey = i.estado_pago || 'no_pagado';
    const iconPago = estadoKey === 'pago_completo' ? '✓' : estadoKey === 'pago_parcial' ? '◐' : '✕';
    spanPago.className = `badge badge-pago ${estadoKey}`;
    spanPago.textContent = `${iconPago} ${ETIQUETAS_PAGO[estadoKey] || '—'}`;
    tdPago.appendChild(spanPago);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(i.creado_en);
    tdFecha.title = i.creado_en || '';
    tdFecha.style.whiteSpace = 'nowrap';
    tdFecha.style.fontSize = '0.82rem';

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
  const mFechaHora = texto.match(/(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (mFechaHora) {
    const [, d, m, y, h, min] = mFechaHora;
    const anio = y.length === 2 ? `20${y}` : y;
    return `${pad(d)}/${pad(m)}/${anio} - ${pad(h)}:${pad(min)}`;
  }
  const mFecha = texto.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (mFecha) {
    const [, d, m, y] = mFecha;
    const anio = y.length === 2 ? `20${y}` : y;
    return `${pad(d)}/${pad(m)}/${anio} - 00:00`;
  }
  const d = new Date(texto);
  if (!Number.isNaN(d.getTime())) {
    return new Intl.DateTimeFormat('es-AR', { timeZone: TZ_SALTA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(d).replace(',', ' -');
  }
  return texto;
}

function formatearFechaNacimiento(valor) {
  if (!valor) return '—';
  const texto = String(valor).trim();
  const pad = (n) => String(n).padStart(2, '0');
  const mIso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (mIso) {
    const [, y, m, d] = mIso;
    return `${pad(d)}/${pad(m)}/${y}`;
  }
  const mFecha = texto.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (mFecha) {
    const [, d, m, y] = mFecha;
    const anio = y.length === 2 ? `20${y}` : y;
    return `${pad(d)}/${pad(m)}/${anio}`;
  }
  return texto;
}

function renderEncuentroPersonas(lista) {
  encuentroPersonas = Array.isArray(lista) ? lista : [];
  const cuerpo = document.querySelector('#tablaEncuentroPersonas tbody');
  cuerpo.innerHTML = '';

  const conTalleres = encuentroPersonas.filter((p) => p.tiene_talleres).length;
  const sinTalleres = encuentroPersonas.length - conTalleres;
  resumenEncuentroLista.textContent =
    `Personas importadas: ${encuentroPersonas.length} · inscriptas a talleres: ${conTalleres} · sin talleres: ${sinTalleres}.`;

  const q = buscarEncuentro.value.trim().toLowerCase();
  const filtroEstado = (el('filtroEncuentroEstado')?.value || '').trim();
  const visibles = encuentroPersonas.filter((p) => {
    if (filtroEstado === 'sin_taller' && p.tiene_talleres) return false;
    if (filtroEstado === 'con_taller' && !p.tiene_talleres) return false;
    if (!q) return true;
    return String(p.dni || '').includes(q) ||
      String(p.apellido || '').toLowerCase().includes(q) ||
      String(p.nombre || '').toLowerCase().includes(q) ||
      `${p.nombre || ''} ${p.apellido || ''}`.toLowerCase().includes(q) ||
      String(p.email || '').toLowerCase().includes(q);
  });

  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 12;
    const hayFiltro = Boolean(q || filtroEstado);
    td.textContent = hayFiltro ? 'Sin resultados para el filtro.' : 'No hay personas importadas del encuentro.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }

  for (const p of visibles) {
    const tr = document.createElement('tr');

    const tdEstado = document.createElement('td');
    const badgeEstado = document.createElement('span');
    badgeEstado.className = `badge ${p.tiene_talleres ? 'badge-encuentro-si' : 'badge-encuentro-no'}`;
    badgeEstado.textContent = p.tiene_talleres ? '✓ Con taller' : '○ Sin taller';
    badgeEstado.title = p.tiene_talleres ? 'Inscripto a talleres' : 'Sin inscribir a talleres';
    tdEstado.appendChild(badgeEstado);

    const tdMarca = document.createElement('td');
    tdMarca.textContent = formatearMarcaTemporal(p.marca_temporal || p.creado_en);
    tdMarca.style.whiteSpace = 'nowrap';
    tdMarca.style.fontSize = '0.78rem';
    tdMarca.title = p.marca_temporal || p.creado_en || '';

    const tdEmail = document.createElement('td');
    tdEmail.textContent = p.email || '—';
    tdEmail.title = p.email || '';
    tdEmail.style.maxWidth = '150px';
    tdEmail.style.overflow = 'hidden';
    tdEmail.style.textOverflow = 'ellipsis';
    tdEmail.style.whiteSpace = 'nowrap';
    tdEmail.style.fontSize = '0.78rem';

    const tdNombre = document.createElement('td');
    tdNombre.textContent = [p.apellido, p.nombre].filter(Boolean).join(', ') || '—';
    tdNombre.title = [p.apellido, p.nombre].filter(Boolean).join(', ') || '';
    tdNombre.style.fontWeight = '600';
    tdNombre.style.minWidth = '130px';

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = p.dni;

    const tdNacimiento = document.createElement('td');
    tdNacimiento.textContent = formatearFechaNacimiento(p.fecha_nacimiento);
    tdNacimiento.style.whiteSpace = 'nowrap';
    tdNacimiento.style.fontSize = '0.78rem';

    const tdTelefono = document.createElement('td');
    tdTelefono.textContent = p.telefono || '—';
    tdTelefono.style.whiteSpace = 'nowrap';
    tdTelefono.style.fontSize = '0.78rem';

    const tdProvincia = document.createElement('td');
    tdProvincia.textContent = p.provincia || '—';
    tdProvincia.title = p.provincia || '';
    tdProvincia.style.fontSize = '0.78rem';

    const tdCiudad = document.createElement('td');
    tdCiudad.textContent = p.ciudad || '—';
    tdCiudad.title = p.ciudad || '';
    tdCiudad.style.fontSize = '0.78rem';

    const tdOcupacion = document.createElement('td');
    tdOcupacion.textContent = p.ocupacion || '—';
    tdOcupacion.title = p.ocupacion || '';
    tdOcupacion.style.fontSize = '0.78rem';
    tdOcupacion.style.maxWidth = '110px';
    tdOcupacion.style.overflow = 'hidden';
    tdOcupacion.style.textOverflow = 'ellipsis';
    tdOcupacion.style.whiteSpace = 'nowrap';

    const tdOpcionPago = document.createElement('td');
    tdOpcionPago.textContent = p.opcion_pago || '—';
    tdOpcionPago.title = p.opcion_pago || '';
    tdOpcionPago.style.fontSize = '0.78rem';
    tdOpcionPago.style.maxWidth = '100px';
    tdOpcionPago.style.overflow = 'hidden';
    tdOpcionPago.style.textOverflow = 'ellipsis';
    tdOpcionPago.style.whiteSpace = 'nowrap';

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
el('filtroEncuentroEstado')?.addEventListener('change', () => renderEncuentroPersonas(encuentroPersonas));

el('botonActualizarEncuentro').addEventListener('click', async () => {
  const res = await api('/api/admin/encuentro');
  if (!res.ok) {
    mostrarMensaje(mensajePanel, res.data.error || 'No se pudieron cargar las personas importadas.', 'error');
    return;
  }
  renderEncuentroPersonas(res.data.personas || []);
});

// ── Asistentes (CRUD dentro de Inscripciones) ────────────────────────
const resumenAsistentes = el('resumenAsistentes');
const buscarAsistente = el('buscarAsistente');
const modalAsistente = el('modalAsistente');
const mensajeAsistenteModal = el('mensajeAsistenteModal');
const asistenteDni = el('asistenteDni');
const asistenteApellido = el('asistenteApellido');
const asistenteNombre = el('asistenteNombre');
const asistenteEmail = el('asistenteEmail');
const asistenteTelefono = el('asistenteTelefono');
const asistenteAlimentacion = el('asistenteAlimentacion');
const modalAsistenteTalleres = el('modalAsistenteTalleres');
const modalAsistenteConflicto = el('modalAsistenteConflicto');
const botonGuardarAsistente = el('botonGuardarAsistente');
const botonCancelarAsistente = el('botonCancelarAsistente');
const botonNuevoAsistente = el('botonNuevoAsistente');
const botonActualizarAsistentes = el('botonActualizarAsistentes');

function renderAsistentes(lista) {
  asistentesData = Array.isArray(lista) ? lista : [];
  const cuerpo = document.querySelector('#tablaAsistentes tbody');
  cuerpo.innerHTML = '';
  resumenAsistentes.textContent = `Asistentes: ${asistentesData.length} · ${asistentesData.reduce((s,a)=>s+Number(a.cantidad_talleres||0),0)} inscripciones en talleres.`;
  const q = (buscarAsistente.value || '').trim().toLowerCase();
  const visibles = asistentesData.filter(a =>
    !q || String(a.dni||'').includes(q) || String(a.apellido||'').toLowerCase().includes(q) || String(a.nombre||'').toLowerCase().includes(q) || String(a.email||'').toLowerCase().includes(q)
  );
  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.textContent = q ? 'Sin resultados para el filtro.' : 'No hay asistentes inscriptos.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }
  for (const a of visibles) {
    const tr = document.createElement('tr');
    const tdDni = document.createElement('td'); tdDni.className='celda-dni'; tdDni.textContent=a.dni; tdDni.title = `DNI ${a.dni}`;
    const tdNombre = document.createElement('td'); tdNombre.textContent=`${a.apellido}, ${a.nombre}`.replace(/^,\s*/,'') || '—'; tdNombre.title = `${a.apellido}, ${a.nombre}`; tdNombre.style.fontWeight='600'; tdNombre.style.textAlign='left';
    const tdEmail = document.createElement('td'); tdEmail.textContent=a.email||'—'; tdEmail.title = a.email||''; tdEmail.style.maxWidth='180px'; tdEmail.style.overflow='hidden'; tdEmail.style.textOverflow='ellipsis'; tdEmail.style.whiteSpace='nowrap'; tdEmail.style.fontSize='0.82rem'; tdEmail.style.textAlign='left';
    const tdTel = document.createElement('td'); tdTel.textContent=a.telefono||'—'; tdTel.style.whiteSpace='nowrap'; tdTel.style.fontSize='0.82rem';
    const tdAlim = document.createElement('td');
    const alimKey2 = a.alimentacion || 'sin_restriccion';
    const badge2 = document.createElement('span');
    badge2.className = `badge badge-alim ${alimKey2}`;
    badge2.textContent = ETIQUETAS_ALIMENTACION[alimKey2] || alimKey2;
    badge2.title = ETIQUETAS_ALIMENTACION[alimKey2] || alimKey2;
    tdAlim.appendChild(badge2);
    const tdTalleres = document.createElement('td');
    const divTalleres = document.createElement('div'); divTalleres.className='lista-talleres-inscripcion';
    const nombres = String(a.talleres_nombres||'').split(',').map(s=>s.trim()).filter(Boolean);
    for (const n of nombres.slice(0,3)) { const chip=document.createElement('div'); chip.className='chip-taller'; chip.textContent=n; chip.title=n; divTalleres.appendChild(chip); }
    if (nombres.length>3) { const more=document.createElement('div'); more.className='chip-taller chip-taller-mas'; more.textContent=`+${nombres.length-3} más`; more.title = nombres.slice(3).join(', '); divTalleres.appendChild(more); }
    if (!nombres.length) divTalleres.textContent='—';
    tdTalleres.appendChild(divTalleres);
    const tdEncuentro = document.createElement('td');
    const enEnc2 = Boolean(a.en_encuentro);
    const badgeEnc2 = document.createElement('span');
    badgeEnc2.className = `badge ${enEnc2 ? 'badge-encuentro-si' : 'badge-encuentro-no'}`;
    badgeEnc2.textContent = enEnc2 ? '✓ Sí' : '○ No';
    tdEncuentro.appendChild(badgeEnc2);
    const tdPago = document.createElement('td');
    const spanPago2=document.createElement('span');
    const estadoKey2 = a.estado_pago||'no_pagado';
    const icon2 = estadoKey2 === 'pago_completo' ? '✓' : estadoKey2 === 'pago_parcial' ? '◐' : '✕';
    spanPago2.className=`badge badge-pago ${estadoKey2}`;
    spanPago2.textContent=`${icon2} ${ETIQUETAS_PAGO[estadoKey2]||'—'}`;
    tdPago.appendChild(spanPago2);
    const tdFecha = document.createElement('td'); tdFecha.textContent=formatearFecha(a.creado_en); tdFecha.title = a.creado_en||''; tdFecha.style.whiteSpace='nowrap'; tdFecha.style.fontSize='0.82rem';
    const tdAcc = document.createElement('td'); const cont=document.createElement('div'); cont.className='acciones-fila';
    const btnEdit=document.createElement('button'); btnEdit.type='button'; btnEdit.className='boton boton-chico'; btnEdit.textContent='Editar'; btnEdit.addEventListener('click',()=>abrirModalAsistente(a)); cont.appendChild(btnEdit);
    const btnDel=document.createElement('button'); btnDel.type='button'; btnDel.className='boton boton-peligro boton-chico'; btnDel.textContent='Eliminar'; btnDel.addEventListener('click', async()=>{
      if(!window.confirm(`¿Eliminar asistente ${a.apellido}, ${a.nombre} (DNI ${a.dni}) y todas sus inscripciones?`)) return;
      btnDel.disabled=true;
      const res=await api(`/api/admin/asistentes/${encodeURIComponent(a.dni)}`,{method:'DELETE'});
      if(!res.ok){ mostrarMensaje(mensajePanel,res.data.error||'No se pudo eliminar.','error'); } else { mostrarMensaje(mensajePanel,'Asistente eliminado.','ok'); await cargarDatos(); await cargarAsistentes(); }
      btnDel.disabled=false;
    }); cont.appendChild(btnDel);
    tdAcc.appendChild(cont);
    tr.append(tdDni,tdNombre,tdEmail,tdTel,tdAlim,tdTalleres,tdEncuentro,tdPago,tdFecha,tdAcc);
    cuerpo.appendChild(tr);
  }
}

async function cargarAsistentes() {
  resumenAsistentes.textContent='Cargando…';
  const res=await api('/api/admin/asistentes');
  if(!res.ok){ resumenAsistentes.textContent=res.data.error||'No se pudieron cargar los asistentes.'; return; }
  renderAsistentes(res.data);
}

function actualizarConflictoAsistente(){
  const aviso=modalAsistenteConflicto;
  const seleccionados=[...modalAsistenteTalleres.querySelectorAll('input[type="checkbox"]:checked')].map(c=>Number(c.value));
  const byId=new Map(talleresActuales.map(t=>[Number(t.id),t]));
  const extra=seleccionados.map(id=>byId.get(id)).filter(Boolean);
  const pares=[];
  for(let i=0;i<extra.length;i++) for(let j=i+1;j<extra.length;j++) if(talleresSeSuperponenEdicion(extra[i],extra[j])) pares.push([extra[i],extra[j]]);
  if(pares.length===0){ aviso.hidden=true; aviso.innerHTML=''; return; }
  aviso.innerHTML=`<strong>⚠ Conflicto de horarios:</strong><br>${pares.map(([a,b])=>`• ${escapeHtml(a.nombre)} ↔ ${escapeHtml(b.nombre)}`).join('<br>')}`;
  aviso.hidden=false;
}

async function abrirModalAsistente(asistente){
  asistenteEditando = asistente || null;
  const esNuevo=!asistenteEditando;
  el('modalAsistenteTitulo').textContent= esNuevo ? 'Nuevo asistente' : 'Editar asistente';
  mostrarMensaje(mensajeAsistenteModal,'','');
  asistenteDni.value = asistente ? asistente.dni : '';
  asistenteDni.disabled = !esNuevo;
  asistenteApellido.value = asistente ? asistente.apellido : '';
  asistenteNombre.value = asistente ? asistente.nombre : '';
  asistenteEmail.value = asistente ? asistente.email : '';
  asistenteTelefono.value = asistente ? asistente.telefono : '';
  asistenteAlimentacion.value = asistente ? (asistente.alimentacion||'sin_restriccion') : 'sin_restriccion';
  if(!talleresActuales.length){
    try{ const r=await api('/api/admin/talleres'); if(r.ok) talleresActuales=r.data; }catch(_){}
  }
  modalAsistenteTalleres.innerHTML='';
  const idsActuales = asistente ? String(asistente.talleres_ids||'').split(',').map(s=>Number(s.trim())).filter(n=>n>0) : [];
  for(const t of talleresActuales){
    const id=Number(t.id);
    const marcado=idsActuales.includes(id);
    const lleno=t.inscriptos>=t.cupo && !marcado;
    const label=document.createElement('label'); label.className='opcion-taller'+(lleno?' opcion-taller-lleno':'');
    if (lleno) label.title = 'No hay más cupos disponibles';
    const check=document.createElement('input'); check.type='checkbox'; check.value=id; check.checked=marcado; check.disabled=lleno;
    const span=document.createElement('span'); span.textContent= lleno ? `${t.nombre} — No hay más cupos disponibles` : `${t.nombre} — ${t.cupo - t.inscriptos} cupos`;
    label.appendChild(check); label.appendChild(span);
    if (lleno) {
      label.addEventListener('click', (e) => {
        e.preventDefault();
        alert('No hay más cupos disponibles');
      });
    }
    modalAsistenteTalleres.appendChild(label);
  }
  actualizarConflictoAsistente();
  modalAsistente.hidden=false; modalAsistente.setAttribute('aria-hidden','false');
}
function cerrarModalAsistente(){
  modalAsistente.hidden=true; modalAsistente.setAttribute('aria-hidden','true');
  asistenteEditando=null; mostrarMensaje(mensajeAsistenteModal,'','');
}
botonCancelarAsistente.addEventListener('click', cerrarModalAsistente);
modalAsistente.addEventListener('click', (e)=>{ if(e.target===modalAsistente) cerrarModalAsistente(); });
modalAsistenteTalleres.addEventListener('change', actualizarConflictoAsistente);
botonNuevoAsistente.addEventListener('click', ()=>abrirModalAsistente(null));
botonActualizarAsistentes.addEventListener('click', cargarAsistentes);
buscarAsistente.addEventListener('input', ()=>renderAsistentes(asistentesData));
botonGuardarAsistente.addEventListener('click', async()=>{
  const dni=String(asistenteDni.value||'').trim().replace(/\D/g,'');
  const apellido=String(asistenteApellido.value||'').trim();
  const nombre=String(asistenteNombre.value||'').trim();
  const email=String(asistenteEmail.value||'').trim();
  const telefono=String(asistenteTelefono.value||'').trim();
  const alimentacion=String(asistenteAlimentacion.value||'sin_restriccion').trim();
  const seleccionados=[...modalAsistenteTalleres.querySelectorAll('input[type="checkbox"]:checked')].map(c=>Number(c.value));
  if(!/^\d{7,8}$/.test(dni)){ mostrarMensaje(mensajeAsistenteModal,'DNI inválido (7 u 8 dígitos).','error'); return; }
  if(apellido.length<2 || nombre.length<2){ mostrarMensaje(mensajeAsistenteModal,'Nombre y apellido requeridos.','error'); return; }
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ mostrarMensaje(mensajeAsistenteModal,'Email inválido.','error'); return; }
  if(seleccionados.length===0){ mostrarMensaje(mensajeAsistenteModal,'Seleccioná al menos un taller.','error'); return; }
  botonGuardarAsistente.disabled=true;
  const esNuevo=!asistenteEditando;
  const url= esNuevo ? '/api/admin/asistentes' : `/api/admin/asistentes/${encodeURIComponent(dni)}`;
  const method= esNuevo ? 'POST':'PUT';
  const payload={ dni, nombre, apellido, email, telefono, alimentacion, talleres: seleccionados };
  if(!esNuevo) { payload.dni=dni; }
  const res=await api(url,{method, body:JSON.stringify(payload)});
  if(!res.ok){
    const msg=res.data.error||'No se pudo guardar.';
    mostrarMensaje(mensajeAsistenteModal,msg,'error');
    if (String(msg).toLowerCase().includes('cupo') || String(msg).toLowerCase().includes('no hay más cupos')) {
      alert('No hay más cupos disponibles');
    }
  }
  else { mostrarMensaje(mensajePanel, esNuevo?'Asistente creado.':'Asistente actualizado.','ok'); cerrarModalAsistente(); await cargarDatos(); await cargarAsistentes(); if(subTabInscripcionActiva()==='talleres'){ await cargarInscripciones(); } }
  botonGuardarAsistente.disabled=false;
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

  let porTaller = datos.porTaller || [];
  // El servidor ya unifica talleres de 2 partes en una sola fila (por taller lógico)
  porTaller = [...porTaller].sort((a, b) => String(a.fecha||'').localeCompare(String(b.fecha||'')) || String(a.hora||'').localeCompare(String(b.hora||'')));

  if (porTaller.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
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

    const tdCupo = document.createElement('td');
    tdCupo.textContent = t.cupo != null ? t.cupo : '—';
    tdCupo.style.color = 'var(--color-texto-suave)';

    const cupoNum = Number(t.cupo) || 0;
    const inscriptosNum = Number(t.inscriptos) || 0;
    const libres = Math.max(0, cupoNum - inscriptosNum);
    const tdLibres = document.createElement('td');
    tdLibres.textContent = libres;
    tdLibres.style.fontWeight = libres === 0 ? 'bold' : '';
    tdLibres.className = libres === 0 ? 'cupo-lleno' : '';

    const tdInscriptos = document.createElement('td');
    tdInscriptos.textContent = t.inscriptos;

    const tdAcreditados = document.createElement('td');
    tdAcreditados.textContent = t.acreditados;
    tdAcreditados.style.fontWeight = 'bold';

    const tdPendientes = document.createElement('td');
    const pendientes = Math.max(0, inscriptosNum - Number(t.acreditados));
    tdPendientes.textContent = pendientes;
    tdPendientes.className = pendientes === 0 ? 'encuentro-si' : '';

    tr.append(tdTaller, tdFecha, tdHora, tdCupo, tdLibres, tdInscriptos, tdAcreditados, tdPendientes);
    cuerpo.appendChild(tr);
  }
}

async function cargarAcreditaciones(silencioso = false) {
  if (!silencioso) resumenAcreditaciones.textContent = 'Cargando…';
  const res = await api('/api/admin/acreditaciones/resumen');
  if (!res.ok) {
    if (!silencioso) resumenAcreditaciones.textContent = res.data.error || 'No se pudieron cargar las acreditaciones.';
    return;
  }
  renderAcreditaciones(res.data);
}

el('botonActualizarAcreditaciones').addEventListener('click', cargarAcreditaciones);

const ICONO_CATEGORIA_COMIDA = { desayuno: '☕', merienda: '🫖', otro: '🍽️' };

let _comidasInscriptosCache = [];

function renderTablaInscriptosConDieta() {
  // legacy table
  const cuerpo = document.querySelector('#tablaInscriptosConDieta tbody');
  if (cuerpo) {
    cuerpo.innerHTML = '';
    const filtroDieta = (el('filtroComidasDieta')?.value || '').trim();
    const q = (el('buscarComidasDietas')?.value || '').trim().toLowerCase();
    const visiblesTable = _comidasInscriptosCache.filter(p => {
      if (filtroDieta && p.alimentacion !== filtroDieta) return false;
      if (!q) return true;
      return String(p.dni||'').includes(q) || String(p.apellido||'').toLowerCase().includes(q) || String(p.nombre||'').toLowerCase().includes(q) || `${p.nombre||''} ${p.apellido||''}`.toLowerCase().includes(q);
    });
    if (visiblesTable.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = _comidasInscriptosCache.length === 0 ? 'Aún no hay inscriptos a talleres.' : 'Sin resultados para el filtro.';
      td.style.color = 'var(--color-texto-suave)';
      tr.appendChild(td);
      cuerpo.appendChild(tr);
    } else {
      for (const p of visiblesTable) {
        const tr = document.createElement('tr');
        const tdDni = document.createElement('td'); tdDni.className='celda-dni'; tdDni.textContent = p.dni;
        const tdNombre = document.createElement('td'); tdNombre.textContent = `${p.apellido}, ${p.nombre}`.replace(/^,\s*/,'') || '—';
        const tdAlim = document.createElement('td'); tdAlim.textContent = ETIQUETAS_ALIMENTACION[p.alimentacion] || p.alimentacion || '—';
        if (p.alimentacion !== 'sin_restriccion') tdAlim.classList.add('encuentro-si');
        const tdEmail = document.createElement('td'); tdEmail.textContent = p.email || '—'; tdEmail.style.fontSize='0.85rem';
        tr.append(tdDni, tdNombre, tdAlim, tdEmail);
        cuerpo.appendChild(tr);
      }
    }
  }
  // cards
  const cardsCont = el('cardsInscriptosConDieta');
  if (!cardsCont) return;
  cardsCont.innerHTML = '';
  const filtroDieta2 = (el('filtroComidasDieta')?.value || '').trim();
  const q2 = (el('buscarComidasDietas')?.value || '').trim().toLowerCase();
  const visibles = _comidasInscriptosCache.filter(p => {
    if (filtroDieta2 && p.alimentacion !== filtroDieta2) return false;
    if (!q2) return true;
    return String(p.dni||'').includes(q2) || String(p.apellido||'').toLowerCase().includes(q2) || String(p.nombre||'').toLowerCase().includes(q2) || `${p.nombre||''} ${p.apellido||''}`.toLowerCase().includes(q2);
  });
  if (visibles.length === 0) {
    const div = document.createElement('div');
    div.className = 'menu-empty';
    div.textContent = _comidasInscriptosCache.length === 0 ? 'Aún no hay inscriptos a talleres.' : 'Sin resultados para el filtro.';
    cardsCont.appendChild(div);
    return;
  }
  const badgeClass = { sin_restriccion:'badge-sin', vegano:'badge-vegano', sin_tacc:'badge-tacc', sin_lactosa:'badge-lactosa', otro:'badge-otro' };
  for (const p of visibles) {
    const card = document.createElement('div');
    card.className = 'menu-card';
    const header = document.createElement('div');
    header.className = 'menu-card-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'menu-card-title';
    title.textContent = `${p.apellido}, ${p.nombre}`.replace(/^,\s*/,'') || '—';
    const sub = document.createElement('div');
    sub.className = 'menu-card-subtitle';
    sub.textContent = `DNI ${p.dni} · ${p.email || 'sin email'}`;
    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);
    const badge = document.createElement('span');
    badge.className = 'menu-card-badge ' + (badgeClass[p.alimentacion] || 'badge-sin');
    badge.textContent = ETIQUETAS_ALIMENTACION[p.alimentacion] || p.alimentacion || '—';
    header.appendChild(titleWrap);
    header.appendChild(badge);
    const footer = document.createElement('div');
    footer.className = 'menu-card-footer';
    footer.innerHTML = `<span>📧 ${escapeHtml(p.email || '—')}</span>`;
    card.appendChild(header);
    card.appendChild(footer);
    cardsCont.appendChild(card);
  }
}

function renderComidas(datos) {
  const totalInscriptos = Number(datos.totalInscriptos) || 0;
  const totalInscripcionesTalleres = Number(datos.totalInscripcionesTalleres) || 0;
  const totalAcreditados = Number(datos.total) || 0;
  const dietasInscriptos = datos.inscriptosPorDieta || {};
  // Resumen al estilo Inscripciones: Personas: 65 (253 inscripciones) · desglose por dieta
  const desglose = ['sin_restriccion','vegano','sin_tacc','sin_lactosa','otro'].map(k => `${ETIQUETAS_ALIMENTACION[k]}: ${Number(dietasInscriptos[k]||0)}`).join(' · ');
  resumenComidas.textContent = `Personas: ${totalInscriptos} (${totalInscripcionesTalleres} inscripciones en talleres) · ${desglose} · Acreditados: ${totalAcreditados}. Hora del servidor: ${datos.horaServidor || '—'}`;
  const resumenInscriptos = el('resumenComidasInscriptos');
  if (resumenInscriptos) {
    resumenInscriptos.textContent = `Personas: ${totalInscriptos} (${totalInscripcionesTalleres} inscripciones) · Vegano: ${Number(dietasInscriptos.vegano||0)} · Sin TACC: ${Number(dietasInscriptos.sin_tacc||0)} · Sin lactosa: ${Number(dietasInscriptos.sin_lactosa||0)} · Sin restricción: ${Number(dietasInscriptos.sin_restriccion||0)} · Otro: ${Number(dietasInscriptos.otro||0)}`;
  }

  // ── Inscriptos por dieta (global, DNI únicos) ──
  const cuerpoInscriptos = document.querySelector('#tablaInscriptosDieta tbody');
  if (cuerpoInscriptos) {
    cuerpoInscriptos.innerHTML = '';
    const ordenDietas = ['sin_restriccion', 'vegano', 'sin_tacc', 'sin_lactosa', 'otro'];
    const tr = document.createElement('tr');
    const tdTotal = document.createElement('td');
    tdTotal.textContent = totalInscriptos;
    tdTotal.style.fontWeight = 'bold';
    tr.appendChild(tdTotal);
    for (const clave of ordenDietas) {
      const td = document.createElement('td');
      const cantidad = Number(dietasInscriptos[clave] || 0);
      td.textContent = cantidad;
      if (cantidad > 0 && clave !== 'sin_restriccion') td.classList.add('encuentro-si');
      if (clave !== 'sin_restriccion' && cantidad > 0) td.style.fontWeight = 'bold';
      tr.appendChild(td);
    }
    cuerpoInscriptos.appendChild(tr);
    if (totalInscriptos === 0) {
      const tr2 = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 6;
      td.textContent = 'Aún no hay inscriptos a talleres.';
      td.style.color = 'var(--color-texto-suave)';
      td.style.fontSize = '0.85rem';
      tr2.appendChild(td);
      cuerpoInscriptos.appendChild(tr2);
    }
  }
  // cards resumen dieta
  const cardsDieta = el('cardsInscriptosDieta');
  if (cardsDieta) {
    cardsDieta.innerHTML = '';
    cardsDieta.className = 'menu-grid menu-grid--stats';
    const dietConfig = [
      { clave: 'total', label: 'Total inscriptos', valor: totalInscriptos, badge: 'badge-total', icon: '👥' },
      { clave: 'sin_restriccion', label: 'Sin restricción', valor: Number(dietasInscriptos.sin_restriccion||0), badge: 'badge-sin', icon: '🍽️' },
      { clave: 'vegano', label: 'Vegano', valor: Number(dietasInscriptos.vegano||0), badge: 'badge-vegano', icon: '🌱' },
      { clave: 'sin_tacc', label: 'Sin TACC', valor: Number(dietasInscriptos.sin_tacc||0), badge: 'badge-tacc', icon: '🌾' },
      { clave: 'sin_lactosa', label: 'Sin lactosa', valor: Number(dietasInscriptos.sin_lactosa||0), badge: 'badge-lactosa', icon: '🥛' },
      { clave: 'otro', label: 'Otro', valor: Number(dietasInscriptos.otro||0), badge: 'badge-otro', icon: '📝' },
    ];
    for (const d of dietConfig) {
      const card = document.createElement('div');
      card.className = 'menu-card menu-card--' + d.clave;
      const header = document.createElement('div');
      header.className = 'menu-card-header';
      const titleWrap = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'menu-card-title';
      title.textContent = d.label;
      const sub = document.createElement('div');
      sub.className = 'menu-card-subtitle';
      sub.textContent = d.icon + ' ' + d.label;
      titleWrap.appendChild(title);
      const badge = document.createElement('span');
      badge.className = 'menu-card-badge ' + d.badge;
      badge.textContent = d.clave === 'total' ? 'TOTAL' : d.label.toUpperCase();
      header.appendChild(titleWrap);
      header.appendChild(badge);
      const value = document.createElement('div');
      value.className = 'menu-card-value';
      value.textContent = String(d.valor);
      if (d.valor > 0 && d.clave !== 'total' && d.clave !== 'sin_restriccion') value.style.color = 'var(--color-primario)';
      card.appendChild(header);
      card.appendChild(value);
      if (d.clave === 'total') {
        const meta = document.createElement('div');
        meta.className = 'menu-card-subtitle';
        meta.textContent = `${totalInscripcionesTalleres} inscripciones en talleres`;
        card.appendChild(meta);
      }
      cardsDieta.appendChild(card);
    }
  }

  // ── Listado detallado de quién tiene restricción ──
  _comidasInscriptosCache = Array.isArray(datos.inscriptosConDieta) ? datos.inscriptosConDieta : [];
  renderTablaInscriptosConDieta();

  const cuerpoServicios = document.querySelector('#tablaComidasServicios tbody');
  if (cuerpoServicios) cuerpoServicios.innerHTML = '';
  const servicios = datos.servicios || [];
  if (cuerpoServicios && servicios.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 9;
    td.textContent = 'No hay bloques de desayuno/merienda en el programa.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpoServicios.appendChild(tr);
  }
  if (cuerpoServicios) {
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
  }
  // cards servicios
  const cardsServicios = el('cardsComidasServicios');
  if (cardsServicios) {
    cardsServicios.innerHTML = '';
    if (servicios.length === 0) {
      const div = document.createElement('div');
      div.className = 'menu-empty';
      div.textContent = 'No hay bloques de desayuno/merienda en el programa.';
      cardsServicios.appendChild(div);
    } else {
      for (const s of servicios) {
        const icono = ICONO_CATEGORIA_COMIDA[s.categoria] || '🍽️';
        const card = document.createElement('div');
        card.className = 'menu-card';
        const header = document.createElement('div');
        header.className = 'menu-card-header';
        const titleWrap = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'menu-card-title';
        title.textContent = `${icono} ${s.titulo}`;
        const sub = document.createElement('div');
        sub.className = 'menu-card-subtitle';
        sub.textContent = `${formatearFecha(s.dia)} · ${s.hora_inicio || ''} – ${s.hora_fin || ''}`;
        titleWrap.appendChild(title);
        titleWrap.appendChild(sub);
        const badge = document.createElement('span');
        badge.className = 'menu-card-badge badge-total';
        badge.textContent = `${s.asistentes} retiraron`;
        header.appendChild(titleWrap);
        header.appendChild(badge);
        const meta = document.createElement('div');
        meta.className = 'menu-card-meta';
        const dietas = s.dietas || {};
        for (const clave of ['sin_restriccion','vegano','sin_tacc','sin_lactosa','otro']) {
          const chip = document.createElement('span');
          const val = Number(dietas[clave]||0);
          chip.className = 'menu-chip' + (val>0 && clave!=='sin_restriccion' ? ' menu-chip--highlight' : '');
          chip.innerHTML = `<strong>${val}</strong> ${ETIQUETAS_ALIMENTACION[clave]}`;
          meta.appendChild(chip);
        }
        card.appendChild(header);
        card.appendChild(meta);
        cardsServicios.appendChild(card);
      }
    }
  }

  const cuerpoAsistentes = document.querySelector('#tablaComidasAsistentes tbody');
  if (cuerpoAsistentes) cuerpoAsistentes.innerHTML = '';
  const porAsistente = datos.porAsistente || [];
  if (cuerpoAsistentes && porAsistente.length === 0) {
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
  // cards asistentes
  const cardsAsistentes = el('cardsComidasAsistentes');
  if (cardsAsistentes) {
    cardsAsistentes.innerHTML = '';
    if (porAsistente.length === 0) {
      const div = document.createElement('div');
      div.className = 'menu-empty';
      div.textContent = 'Todavía no hay escaneos registrados en desayunos o meriendas.';
      cardsAsistentes.appendChild(div);
    } else {
      const badgeClass2 = { sin_restriccion:'badge-sin', vegano:'badge-vegano', sin_tacc:'badge-tacc', sin_lactosa:'badge-lactosa', otro:'badge-otro' };
      for (const p of porAsistente) {
        const card = document.createElement('div');
        card.className = 'menu-card';
        const header = document.createElement('div');
        header.className = 'menu-card-header';
        const titleWrap = document.createElement('div');
        const title = document.createElement('div');
        title.className = 'menu-card-title';
        title.textContent = `${p.apellido}, ${p.nombre}`.replace(/^,\s*/,'') || '—';
        const sub = document.createElement('div');
        sub.className = 'menu-card-subtitle';
        sub.textContent = `DNI ${p.dni} · ${p.fechaAcreditacion || 'sin fecha'}`;
        titleWrap.appendChild(title);
        titleWrap.appendChild(sub);
        const badge = document.createElement('span');
        badge.className = 'menu-card-badge ' + (badgeClass2[p.alimentacion] || 'badge-sin');
        badge.textContent = ETIQUETAS_ALIMENTACION[p.alimentacion] || p.alimentacion || '—';
        header.appendChild(titleWrap);
        header.appendChild(badge);
        const meta = document.createElement('div');
        meta.className = 'menu-card-meta';
        const chip1 = document.createElement('span'); chip1.className='menu-chip'; chip1.innerHTML = `☕ <strong>${p.desayunos}</strong> desayunos`;
        const chip2 = document.createElement('span'); chip2.className='menu-chip'; chip2.innerHTML = `🫖 <strong>${p.meriendas}</strong> meriendas`;
        const chip3 = document.createElement('span'); chip3.className='menu-chip menu-chip--highlight'; chip3.innerHTML = `Total <strong>${p.total}</strong>`;
        meta.append(chip1, chip2, chip3);
        card.append(header, meta);
        cardsAsistentes.appendChild(card);
      }
    }
  }
}

async function cargarComidas(silencioso = false) {
  if (!silencioso) resumenComidas.textContent = 'Cargando…';
  const res = await api('/api/admin/comidas/resumen');
  if (!res.ok) {
    if (!silencioso) resumenComidas.textContent = res.data.error || 'No se pudo cargar el recuento de comidas.';
    return;
  }
  renderComidas(res.data);
}

el('botonActualizarComidas').addEventListener('click', () => cargarComidas(false));
el('filtroComidasDieta')?.addEventListener('change', renderTablaInscriptosConDieta);
el('buscarComidasDietas')?.addEventListener('input', renderTablaInscriptosConDieta);

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
let ponenteInscriptos = new Map();
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
      const cupo = Number(p.cupo ?? 20);
      const inscriptos = ponenteInscriptos.get(Number(p.id)) ?? null;
      const libres = inscriptos !== null ? Math.max(0, cupo - inscriptos) : null;
      const linea = document.createElement('div');
      linea.style.fontSize = '0.72rem';
      linea.style.marginTop = '4px';
      linea.style.lineHeight = '1.3';
      linea.style.display = 'flex';
      linea.style.flexWrap = 'wrap';
      linea.style.gap = '0.35rem';
      const chipCupo = document.createElement('span');
      chipCupo.className = 'badge badge-sin';
      chipCupo.style.fontSize = '0.70rem';
      chipCupo.textContent = `Cupo ${cupo}`;
      linea.appendChild(chipCupo);
      if (inscriptos !== null) {
        const chipInsc = document.createElement('span');
        chipInsc.className = 'badge badge-sin';
        chipInsc.style.fontSize = '0.70rem';
        chipInsc.textContent = `${inscriptos} inscriptos`;
        linea.appendChild(chipInsc);
      }
      if (libres !== null) {
        const chipLibres = document.createElement('span');
        chipLibres.style.fontSize = '0.70rem';
        chipLibres.className = 'badge ' + (libres === 0 ? 'badge-pago no_pagado' : libres <= 5 ? 'badge-pago pago_parcial' : 'badge-pago pago_completo');
        chipLibres.textContent = libres === 0 ? 'Sin cupos' : `${libres} libres`;
        linea.appendChild(chipLibres);
      }
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
  const [ponentesRes, diasRes, talleresRes] = await Promise.all([
    api('/api/admin/ponentes'),
    api('/api/admin/ponentes/dias'),
    api('/api/admin/talleres').catch(() => ({ ok: false, data: [] })),
  ]);
  if (!ponentesRes.ok) {
    mostrarMensaje(mensajePonente, ponentesRes.data.error || 'No se pudieron cargar los ponentes.', 'error');
    return;
  }
  ponentes = ponentesRes.data || [];
  diasPonentes = diasRes.ok ? diasRes.data || [] : [];
  // mapear inscriptos por ponente (unificando 2 partes)
  ponenteInscriptos = new Map();
  if (talleresRes && talleresRes.ok && Array.isArray(talleresRes.data)) {
    const porPonente = new Map();
    for (const t of talleresRes.data) {
      const pid = t.ponente_id ? Number(t.ponente_id) : null;
      if (!pid) continue;
      const ins = Number(t.inscriptos) || 0;
      if (!porPonente.has(pid)) porPonente.set(pid, ins);
      else porPonente.set(pid, Math.max(porPonente.get(pid), ins));
    }
    for (const [pid, ins] of porPonente.entries()) ponenteInscriptos.set(pid, ins);
    // ponentes sin taller vinculado quedan sin dato
  }
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

// ── Programa del Encuentro (bloques) ────────────────────────────────
const appPrograma = el('programaAdminApp');
const modalBloque = el('modalBloque');
const formBloque = el('formBloque');
const mensajeBloque = el('mensajeBloque');
let bloquesPrograma = [];

async function cargarProgramaAdmin() {
  if (!appPrograma || !window.ProgramaUI) return;
  ProgramaUI.init({
    container: appPrograma,
    mode: 'admin',
    onAdd: () => abrirModalBloque(null),
    onEdit: (id) => abrirModalBloque(id),
    onDelete: async (id) => {
      const b = bloquesPrograma.find((x) => Number(x.id) === Number(id));
      if (!b) return;
      if (!window.confirm(`¿Eliminar el bloque "${b.titulo}"? Esta acción no se puede deshacer.`)) return;
      const res = await api(`/api/admin/programa/bloques/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarMensaje(mensajePanel, res.data.error || 'No se pudo eliminar el bloque.', 'error');
      } else {
        mostrarMensaje(mensajePanel, 'Bloque eliminado.', 'ok');
        await recargarProgramaAdmin();
      }
    },
  });
  await recargarProgramaAdmin();
}

async function recargarProgramaAdmin() {
  const ok = await ProgramaUI.cargar();
  if (!ok) {
    mostrarMensaje(mensajeBloque, 'No se pudo cargar el programa.', 'error');
    return;
  }
  bloquesPrograma = ProgramaUI.getBloques() || [];
  ProgramaUI.render();
}

function abrirModalBloque(id) {
  formBloque.reset();
  el('bloqueId').value = '';
  el('bloqueDia').value = '';
  el('bloqueHoraInicio').value = '';
  el('bloqueHoraFin').value = '';
  el('bloqueTipo').value = 'general';
  el('bloqueTitulo').value = '';
  el('bloqueDescripcion').value = '';
  el('bloqueIcono').value = '';
  el('bloqueOrden').value = '0';
  el('tituloModalBloque').textContent = 'Nuevo bloque';
  mostrarMensaje(mensajeBloque, '', '');

  if (id) {
    const b = bloquesPrograma.find((x) => Number(x.id) === Number(id));
    if (b) {
      el('tituloModalBloque').textContent = 'Editar bloque';
      el('bloqueId').value = b.id;
      el('bloqueDia').value = b.dia ?? 1;
      el('bloqueHoraInicio').value = b.hora_inicio || '';
      el('bloqueHoraFin').value = b.hora_fin || '';
      el('bloqueTipo').value = b.tipo || 'general';
      el('bloqueTitulo').value = b.titulo || '';
      el('bloqueDescripcion').value = b.descripcion || '';
      el('bloqueIcono').value = b.icono || '';
      el('bloqueOrden').value = b.orden ?? 0;
    }
  }
  modalBloque.hidden = false;
  modalBloque.setAttribute('aria-hidden', 'false');
  el('bloqueTitulo').focus();
}

function cerrarModalBloque() {
  modalBloque.hidden = true;
  modalBloque.setAttribute('aria-hidden', 'true');
}

el('cancelarModalBloque').addEventListener('click', cerrarModalBloque);

formBloque.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = el('bloqueId').value;
  const titulo = el('bloqueTitulo').value.trim();
  if (!titulo) {
    mostrarMensaje(mensajeBloque, 'El título es obligatorio.', 'error');
    return;
  }
  const payload = {
    dia: el('bloqueDia').value,
    hora_inicio: el('bloqueHoraInicio').value,
    hora_fin: el('bloqueHoraFin').value,
    tipo: el('bloqueTipo').value,
    titulo,
    descripcion: el('bloqueDescripcion').value.trim(),
    icono: el('bloqueIcono').value.trim(),
    orden: Number(el('bloqueOrden').value) || 0,
  };
  const esEdicion = !!id;
  const res = esEdicion
    ? await api(`/api/admin/programa/bloques/${id}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await api('/api/admin/programa/bloques', { method: 'POST', body: JSON.stringify(payload) });
  if (!res.ok) {
    mostrarMensaje(mensajeBloque, res.data.error || 'No se pudo guardar el bloque.', 'error');
    return;
  }
  mostrarMensaje(mensajeBloque, esEdicion ? 'Bloque actualizado.' : 'Bloque creado.', 'ok');
  cerrarModalBloque();
  await recargarProgramaAdmin();
});

// ── Pagos y cuotas ────────────────────────────────────────────────
const mensajePagos = el('mensajePagos');
const formPlanPago = el('formPlanPago');
const planIdEditando = el('planIdEditando');
const planNombre = el('planNombre');
const planDescripcion = el('planDescripcion');
const planMonto = el('planMonto');
const planCuotas = el('planCuotas');
const planActivo = el('planActivo');
const planTallerista = el('planTallerista');
const botonGuardarPlan = el('botonGuardarPlan');
const botonCancelarPlan = el('botonCancelarPlan');
const tablaPlanes = el('tablaPlanes');
const formAsignarPlan = el('formAsignarPlan');
const asignarDni = el('asignarDni');
const asignarPlan = el('asignarPlan');
const asignarTallerista = el('asignarTallerista');
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

function formatearFechaTope(valor) {
  const m = String(valor || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/);
  if (m) return `${Number(m[3])}/${Number(m[2])}/${m[1]}`;
  return String(valor || '');
}

function montoCuota(a, numero) {
  const det = (a.cuotasDetalle || []).find((c) => Number(c.numero) === Number(numero));
  if (det && det.monto != null) return Number(det.monto);
  const n = Number(a.cantidadCuotas) || 1;
  return (Number(a.montoTotal) || 0) / n;
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
    const marcaTallerista = p.es_tallerista ? ' [Tallerista 50%]' : '';
    opcion.textContent = `${p.nombre}${marcaTallerista} — ${formatearMoneda(p.monto_total)} / ${p.cantidad_cuotas} cuota(s)`;
    asignarPlan.appendChild(opcion);
  }
}

function renderPlanesPago() {
  const tbody = tablaPlanes.querySelector('tbody');
  tbody.innerHTML = '';
  if (planesPago.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
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
    const detalleCuotas = p.cuotas || [];
    const cuotasIguales = detalleCuotas.length > 0 && detalleCuotas.every((c) => Number(c.monto) === Number(detalleCuotas[0].monto));
    tdCuotas.textContent = detalleCuotas.length
      ? cuotasIguales
        ? `${detalleCuotas.length} × ${formatearMoneda(detalleCuotas[0].monto)}`
        : detalleCuotas.map((c) => formatearMoneda(c.monto)).join(' + ')
      : String(p.cantidad_cuotas);
    const tdTallerista = document.createElement('td');
    tdTallerista.style.textAlign = 'center';
    if (p.es_tallerista) {
      const badge = document.createElement('span');
      badge.className = 'badge badge-tallerista';
      badge.textContent = 'Tallerista 50%';
      badge.title = 'Este plan está marcado como de talleristas';
      tdTallerista.appendChild(badge);
    } else {
      tdTallerista.textContent = '—';
      tdTallerista.style.color = 'var(--color-texto-suave)';
    }
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
    tr.append(tdNombre, tdDesc, tdMonto, tdCuotas, tdTallerista, tdActivo, tdAcciones);
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
  if (planTallerista) planTallerista.checked = Boolean(p.es_tallerista);
  botonGuardarPlan.textContent = 'Actualizar plan';
  botonCancelarPlan.hidden = false;
}

function resetFormPlan() {
  planIdEditando.value = '';
  formPlanPago.reset();
  planActivo.checked = true;
  if (planTallerista) planTallerista.checked = false;
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
      es_tallerista: planTallerista ? planTallerista.checked : false,
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
    body: JSON.stringify({ dni, plan_id: Number(asignarPlan.value), es_tallerista: asignarTallerista ? asignarTallerista.checked : false }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePagos, res.data.error || 'No se pudo asignar el plan.', 'error');
  } else {
    const esTall = asignarTallerista && asignarTallerista.checked;
    mostrarMensaje(mensajePagos, esTall ? 'Plan asignado (tallerista 50%).' : 'Plan asignado.', 'ok');
    asignarDni.value = '';
    if (asignarTallerista) asignarTallerista.checked = false;
    await cargarPagos();
  }
  botonAsignarPlan.disabled = false;
});

function renderPagos() {
  const tbody = tablaPagos.querySelector('tbody');
  tbody.innerHTML = '';
  const dniFiltro = filtroPagoDni.value.trim().replace(/\D/g, '');
  const visibles = pagosAsistentes.filter((a) => !dniFiltro || String(a.dni).includes(dniFiltro));
  const talleristasCount = pagosAsistentes.filter((x) => x.esTallerista || x.es_tallerista).length;
  resumenPagos.textContent = `Asistentes con plan: ${pagosAsistentes.length} · Talleristas 50%: ${talleristasCount} · Estándar: ${pagosAsistentes.length - talleristasCount}.`;
  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
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
    const detalleCuotas = a.cuotasDetalle || [];
    const esTallerista = Boolean(a.esTallerista || a.es_tallerista);

    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = a.dni;
    const tdNombre = document.createElement('td');
    tdNombre.textContent = [a.apellido, a.nombre].filter(Boolean).join(', ') || '—';
    const tdPlan = document.createElement('td');
    tdPlan.textContent = a.planNombre || '—';
    const tdModo = document.createElement('td');
    tdModo.style.textAlign = 'center';
    const badgeModo = document.createElement('span');
    badgeModo.className = esTallerista ? 'badge badge-tallerista' : 'badge badge-estandar';
    badgeModo.textContent = esTallerista ? 'Tallerista 50%' : 'Estándar';
    badgeModo.title = esTallerista ? 'Paga el 50% del plan' : 'Paga el 100%';
    tdModo.appendChild(badgeModo);
    // toggle button
    const btnToggle = document.createElement('button');
    btnToggle.type = 'button';
    btnToggle.className = 'boton boton-chico boton-secundario';
    btnToggle.style.marginTop = '0.25rem';
    btnToggle.style.fontSize = '0.72rem';
    btnToggle.style.padding = '0.15rem 0.4rem';
    btnToggle.textContent = esTallerista ? 'Quitar 50%' : 'Aplicar 50%';
    btnToggle.title = esTallerista ? 'Volver a pago completo (100%)' : 'Cambiar a tallerista (paga 50%)';
    btnToggle.addEventListener('click', async () => {
      btnToggle.disabled = true;
      const res = await api(`/api/admin/pagos/${a.asistentePlanId}/tallerista`, {
        method: 'PUT',
        body: JSON.stringify({ es_tallerista: !esTallerista }),
      });
      if (!res.ok) {
        mostrarMensaje(mensajePagos, res.data.error || 'No se pudo actualizar modo tallerista.', 'error');
      } else {
        mostrarMensaje(mensajePagos, !esTallerista ? 'Modo tallerista 50% activado.' : 'Modo tallerista desactivado.', 'ok');
        await cargarPagos();
      }
      btnToggle.disabled = false;
    });
    tdModo.appendChild(document.createElement('br'));
    tdModo.appendChild(btnToggle);
    const tdTotal = document.createElement('td');
    tdTotal.textContent = detalleCuotas.length
      ? `${formatearMoneda(a.montoTotal)}${esTallerista ? ' (50%)' : ''} · ${detalleCuotas.map((c) => formatearMoneda(c.monto)).join(' / ')}`
      : `${formatearMoneda(a.montoTotal)} / ${formatearMoneda(montoCuota(a, 1))}`;
    tdTotal.className = 'pagos-total';

    const tdCuotas = document.createElement('td');
    const caja = document.createElement('div');
    caja.className = 'pagos-cuotas';
    for (let i = 1; i <= n; i++) {
      const chip = document.createElement('button');
      chip.type = 'button';
      const pagada = pagadas.has(i);
      const infoCuota = detalleCuotas.find((c) => Number(c.numero) === i);
      const montoEsperado = infoCuota ? Number(infoCuota.monto) : montoCuota(a, i);
      const tope = infoCuota && infoCuota.fecha_tope ? ` · vence ${formatearFechaTope(infoCuota.fecha_tope)}` : '';
      chip.className = 'pagos-cuota' + (pagada ? ' pagos-cuota-pagada' : '');
      chip.textContent = pagada ? `✓ ${i}` : `${i}`;
      chip.title = `Cuota ${i} · ${formatearMoneda(montoEsperado)}${tope}${esTallerista ? ' (50% tallerista)' : ''}`;
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

    tr.append(tdDni, tdNombre, tdPlan, tdModo, tdTotal, tdCuotas, tdEstado);
    tbody.appendChild(tr);
  }
}

function abrirModalCuota(a, numero, pagada) {
  cuotaContexto = { asistentePlanId: a.asistentePlanId, numero, pagada };
  const pagoPrevio = a.cuotas.find((c) => c.numero === numero);
  const det = (a.cuotasDetalle || []).find((c) => Number(c.numero) === Number(numero));
  const montoEsperado = det ? Number(det.monto) : montoCuota(a, numero);
  modalCuotaPlanId.value = a.asistentePlanId;
  modalCuotaNumero.value = numero;
  modalCuotaMonto.value = pagada ? (pagoPrevio ? pagoPrevio.monto : montoEsperado) : montoEsperado;
  modalCuotaFecha.value = pagada ? (pagoPrevio && pagoPrevio.fecha ? pagoPrevio.fecha : '') : new Intl.DateTimeFormat('en-CA', { timeZone: TZ_SALTA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const nombre = [a.apellido, a.nombre].filter(Boolean).join(', ') || a.dni;
  const tope = det && det.fecha_tope ? ` · vence ${formatearFechaTope(det.fecha_tope)}` : '';
  modalCuotaInfo.textContent = `${nombre} · Cuota ${numero}/${a.cantidadCuotas}${tope}`;
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
  return new Intl.DateTimeFormat('es-AR', { timeZone: TZ_SALTA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d).replace(',', '');
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

// ── Dashboard (solo frontend) ───────────────────────────────────
function formatearMoneda(valor) {
  const n = Number(valor) || 0;
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 });
}

async function cargarDashboard() {
  const resumen = el('resumenDashboard');
  const kpiInscritosValor = el('kpiInscriptosValor');
  const kpiInscriptosSub = el('kpiInscriptosSub');
  const kpiTalleresValor = el('kpiTalleresValor');
  const kpiTalleresSub = el('kpiTalleresSub');
  const kpiTalleresBar = el('kpiTalleresBar');
  const kpiRecaudadoValor = el('kpiRecaudadoValor');
  const kpiRecaudadoSub = el('kpiRecaudadoSub');
  if (resumen) resumen.textContent = 'Cargando…';
  if (kpiInscriptosValor) kpiInscriptosValor.textContent = '—';
  if (kpiTalleresValor) kpiTalleresValor.textContent = '—';
  if (kpiRecaudadoValor) kpiRecaudadoValor.textContent = '—';

  const [tRes, iRes, pRes, aRes, eRes] = await Promise.all([
    api('/api/admin/talleres'),
    api('/api/admin/inscripciones'),
    api('/api/admin/pagos'),
    api('/api/admin/asistentes'),
    api('/api/admin/encuentro'),
  ]);

  // --- KPI 1: Inscriptos en general (DNI únicos del encuentro + fallback) ---
  let totalGeneral = 0;
  if (eRes && eRes.ok && eRes.data && typeof eRes.data.total === 'number') {
    totalGeneral = Number(eRes.data.total) || 0;
  } else if (eRes && eRes.ok && Array.isArray(eRes.data.personas)) {
    totalGeneral = eRes.data.personas.length;
  } else if (aRes.ok && Array.isArray(aRes.data)) {
    totalGeneral = aRes.data.length;
  } else if (iRes.ok && Array.isArray(iRes.data)) {
    totalGeneral = new Set(iRes.data.map((x) => String(x.dni))).size;
  }
  // fallback: si no hay encuentro, usar asistentes + inscripciones como total
  if (totalGeneral === 0 && iRes.ok && Array.isArray(iRes.data)) {
    totalGeneral = new Set(iRes.data.map((x) => String(x.dni))).size;
  }
  const totalInscripciones = iRes.ok && Array.isArray(iRes.data) ? iRes.data.length : 0;
  if (kpiInscriptosValor) kpiInscriptosValor.textContent = String(totalGeneral);
  if (kpiInscriptosSub) kpiInscriptosSub.textContent = `${totalGeneral} inscriptos en total`;

  // --- KPI 2: Inscriptos a talleres / faltantes (sobre total general) - unifica 2-partes ---
  let cupoTotal = 0;
  let totalSlots = 0;
  let talleresParaKpi = [];
  if (tRes.ok && Array.isArray(tRes.data)) {
    const mapa = new Map();
    for (const t of tRes.data) {
      const key = t.pareja_id ? Number(t.pareja_id) : Number(t.id);
      const nombreBase = String(t.nombre || '').replace(/\s*\(\d+°\s*parte\)\s*/gi, '').trim();
      if (!mapa.has(key)) {
        mapa.set(key, { id: key, nombre: nombreBase || t.nombre, cupo: Number(t.cupo) || 0, inscriptos: Number(t.inscriptos) || 0 });
      } else {
        const cur = mapa.get(key);
        // cupo se controla unificado (tomar el del bloque principal)
        cur.inscriptos = Math.max(cur.inscriptos, Number(t.inscriptos) || 0);
      }
    }
    talleresParaKpi = [...mapa.values()];
    for (const t of talleresParaKpi) {
      cupoTotal += t.cupo;
      totalSlots += t.inscriptos;
    }
  }
  // asistentes = personas con al menos un taller asignado (total DISTINCT en inscripciones)
  const asistentesConTaller = aRes.ok && Array.isArray(aRes.data) ? aRes.data.length : new Set(
    (iRes.ok && Array.isArray(iRes.data) ? iRes.data : []).map((x) => String(x.dni))
  ).size;
  // Cálculo correcto basado en encuentro (fuente de verdad para faltantes)
  // Antes: faltan = totalGeneral - asistentesConTaller daba 1 porque 13 inscriptos no están en encuentro
  // Ahora: faltan = encuentro sin taller (14)
  let encuentroConTaller = 0;
  let encuentroSin = 0;
  if (eRes && eRes.ok && Array.isArray(eRes.data?.personas)) {
    encuentroConTaller = eRes.data.personas.filter((p) => p.tiene_talleres).length;
    const encTotal = typeof eRes.data.total === 'number' ? eRes.data.total : eRes.data.personas.length;
    encuentroSin = Math.max(0, encTotal - encuentroConTaller);
  } else {
    encuentroConTaller = asistentesConTaller;
    encuentroSin = Math.max(0, totalGeneral - asistentesConTaller);
  }
  const pctInscriptosTalleres = totalGeneral > 0 ? Math.round((encuentroConTaller / totalGeneral) * 100) : 0;
  if (kpiTalleresValor) {
    kpiTalleresValor.textContent = `${encuentroConTaller} / ${encuentroSin}`;
    kpiTalleresValor.title = 'Click para filtrar faltantes en Importadas del encuentro';
  }
  const kpiTalleresCard = el('kpiTalleres');
  if (kpiTalleresCard) {
    kpiTalleresCard.style.cursor = 'pointer';
    kpiTalleresCard.title = 'Click para ver sin taller en Importadas del encuentro';
  }
  if (kpiTalleresSub) kpiTalleresSub.textContent = totalGeneral > 0
    ? `${encuentroSin} sin taller en encuentro · ${pctInscriptosTalleres}% con taller`
    : `${encuentroConTaller} con taller`;
  if (kpiTalleresBar) kpiTalleresBar.style.width = `${Math.min(100, pctInscriptosTalleres)}%`;
  // actualizar sub de KPI1 con detalle de faltantes + extras no en encuentro
  if (kpiInscriptosSub && totalGeneral > 0) {
    const extraNoEncuentro = Math.max(0, asistentesConTaller - encuentroConTaller);
    let texto = `${totalGeneral} en total (encuentro) · ${encuentroConTaller} con taller · ${encuentroSin} sin taller`;
    if (extraNoEncuentro > 0) {
      texto += ` (+${extraNoEncuentro} inscriptos fuera del listado del encuentro; total con taller ${asistentesConTaller})`;
    }
    kpiInscriptosSub.textContent = texto;
    kpiInscriptosSub.title = extraNoEncuentro > 0 ? `Hay ${extraNoEncuentro} DNIs inscriptos a talleres que no figuran en el listado del encuentro (ej. carga manual). Por eso el cálculo anterior 65-66=1 no coincidía con los 14 sin taller del listado.` : '';
  }

  // --- KPI 3: Monto recaudado ---
  let recaudado = 0;
  let cuotasPagadas = 0;
  if (pRes.ok && Array.isArray(pRes.data)) {
    for (const ap of pRes.data) {
      const cuotas = Array.isArray(ap.cuotas) ? ap.cuotas : [];
      for (const c of cuotas) {
        recaudado += Number(c.monto) || 0;
        cuotasPagadas += 1;
      }
    }
  }
  if (kpiRecaudadoValor) kpiRecaudadoValor.textContent = formatearMoneda(recaudado);
  if (kpiRecaudadoSub) kpiRecaudadoSub.textContent = `${cuotasPagadas} cuotas registradas · actualizado`;

  if (resumen) {
    const pagTxt = pRes.ok ? 'pagos ok' : 'pagos no disponible';
    resumen.textContent = `Actualizado: ${new Date().toLocaleString('es-AR', { timeZone: TZ_SALTA })} · ${pagTxt}`;
  }

  // --- Ranking ---
  renderRankingTalleres(talleresParaKpi);

  // --- Últimos 5 ---
  const inscripciones = iRes.ok && Array.isArray(iRes.data) ? iRes.data : [];
  renderUltimos5(inscripciones);
}

// KPI Inscriptos a talleres / Faltantes: click filtra sin taller en Importadas del encuentro
(function initKpiTalleresClick() {
  const card = el('kpiTalleres');
  if (!card) return;
  card.addEventListener('click', () => {
    cambiarVista('inscripciones');
    activarSubTabInscripcion('encuentro');
    const sel = el('filtroEncuentroEstado');
    if (sel) sel.value = 'sin_taller';
    // asegurar que encuentroPersonas esté cargado; si no, forzar render cuando llegue
    renderEncuentroPersonas(encuentroPersonas);
    // resaltar filtro visualmente
    if (sel) {
      sel.style.outline = '2px solid var(--color-primario)';
      setTimeout(() => { sel.style.outline = ''; }, 1200);
    }
    // scroll al listado filtrado
    const anchor = el('subInscripcionesEncuentro');
    if (anchor) anchor.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
})();

function renderRankingTalleres(talleres) {
  const cont = el('rankingTalleres');
  const sub = el('rankingSub');
  if (!cont) return;
  cont.innerHTML = '';
  if (!Array.isArray(talleres) || talleres.length === 0) {
    cont.innerHTML = '<div class="ranking-empty">No hay talleres cargados.</div>';
    if (sub) sub.textContent = 'Sin datos';
    return;
  }
  const ordenados = [...talleres].sort((a, b) => Number(a.inscriptos) - Number(b.inscriptos)).slice(0, 5);
  const max = Math.max(...ordenados.map((t) => Number(t.inscriptos) || 0), 1);
  if (sub) sub.textContent = `Top 5 de menor a mayor ocupación · ${talleres.length} talleres`;
  for (const t of ordenados) {
    const ins = Number(t.inscriptos) || 0;
    const cupo = Number(t.cupo) || 0;
    const pct = Math.round((ins / max) * 100);
    const pctCupo = cupo > 0 ? Math.round((ins / cupo) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'ranking-row';
    const label = document.createElement('div');
    label.className = 'ranking-label';
    label.textContent = t.nombre || '—';
    label.title = t.nombre || '';
    const meta = document.createElement('div');
    meta.className = 'ranking-meta';
    meta.textContent = cupo ? `${ins}/${cupo} · ${pctCupo}%` : `${ins} inscriptos`;
    const barWrap = document.createElement('div');
    barWrap.className = 'ranking-bar-wrap';
    const bar = document.createElement('div');
    bar.className = 'ranking-bar';
    bar.style.width = `${pct}%`;
    if (pctCupo >= 90) bar.style.background = 'var(--color-error)';
    else if (pctCupo >= 70) bar.style.background = '#f59e0b';
    barWrap.appendChild(bar);
    row.append(label, meta, barWrap);
    cont.appendChild(row);
  }
}

function renderUltimos5(inscripciones) {
  const tbody = document.querySelector('#tablaUltimos5 tbody');
  if (!tbody) return;
  tbody.innerHTML = '';
  if (!Array.isArray(inscripciones) || inscripciones.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'No hay inscripciones.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  // DNI únicos: tomar los 5 más recientes por persona
  const porDni = new Map();
  const ordenadas = [...inscripciones].sort((a, b) => {
    const da = new Date(a.creado_en || 0).getTime();
    const db = new Date(b.creado_en || 0).getTime();
    return db - da;
  });
  for (const row of ordenadas) {
    const dni = String(row.dni || '').trim();
    if (!dni) continue;
    if (!porDni.has(dni)) porDni.set(dni, row);
    if (porDni.size >= 5) break;
  }
  // si no hay suficientes DNI únicos, completar con ordenadas (evita vacío)
  const ultimos = [...porDni.values()];
  if (ultimos.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 5;
    td.textContent = 'No hay inscripciones.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    tbody.appendChild(tr);
    return;
  }
  for (const i of ultimos) {
    // agréga todos los talleres de ese DNI si existen
    const filasDni = inscripciones.filter((r) => String(r.dni) === String(i.dni));
    const talleres = [...new Set(filasDni.map((r) => r.taller).filter(Boolean))].join(', ');
    const tr = document.createElement('tr');
    const tdDni = document.createElement('td');
    tdDni.className = 'celda-dni';
    tdDni.textContent = i.dni || '—';
    const tdNombre = document.createElement('td');
    tdNombre.textContent = `${i.apellido || ''} ${i.nombre || ''}`.trim() || `${i.nombre || ''} ${i.apellido || ''}`.trim() || '—';
    const tdTaller = document.createElement('td');
    tdTaller.textContent = talleres || i.taller || '—';
    tdTaller.title = talleres || i.taller || '';
    const tdPago = document.createElement('td');
    const spanPago = document.createElement('span');
    const estado = i.estado_pago || 'no_pagado';
    const iconMap = { pago_completo: '✓', pago_parcial: '⚠', no_pagado: '✕' };
    const icon = iconMap[estado] || '•';
    spanPago.className = `estado-pago-texto ${estado}`;
    spanPago.textContent = `${icon} ${ETIQUETAS_PAGO[estado] || estado}`;
    tdPago.appendChild(spanPago);
    const tdHora = document.createElement('td');
    tdHora.textContent = i.creado_en ? formatearFecha(i.creado_en) : '—';
    tdHora.title = i.creado_en ? String(i.creado_en) : '';
    tr.append(tdDni, tdNombre, tdTaller, tdPago, tdHora);
    tbody.appendChild(tr);
  }
}

(async () => {
  try {
    const resVersion = await fetch('/api/version', { credentials: 'include' });
    if (resVersion.ok) {
      const datosVersion = await resVersion.json();
      if (datosVersion && datosVersion.version) {
        el('versionApp').textContent = datosVersion.version;
        const vF = el('versionAppFooter');
        if (vF) vF.textContent = datosVersion.version;
      }
    }
  } catch (_e) {
    /* la versión es informativa */
  }
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
