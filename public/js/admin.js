const ETIQUETAS_ROL = { admin: 'Administrador', operador: 'Operador' };
const ETIQUETAS_EVENTO = {
  inscripcion_creada: 'Inscripción creada',
  inscripcion_modificada: 'Inscripción modificada',
  inscripcion_eliminada: 'Inscripción eliminada',
  acreditacion_reenviada: 'Acreditación reenviada',
  acreditacion_verificada: 'Acreditación verificada',
  usuario_creado: 'Usuario creado',
  usuario_modificado: 'Usuario modificado',
  usuario_eliminado: 'Usuario eliminado',
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
  talleres: 'Talleres y cupos',
  programa: 'Programa del evento',
  encuentro: 'Listado del encuentro',
  pagos: 'Gestión de pagos y cuotas',
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
const modalBloquePrograma = el('modalBloquePrograma');
const modalBloqueTitulo = el('modalBloqueTitulo');
const formBloquePrograma = el('formBloquePrograma');
const mensajeBloque = el('mensajeBloque');
const campoPonencias = el('campoPonencias');

let talleresActuales = [];
let inscripcionEditando = null;
let talleresEditando = [];
let usuarioEditando = null;
let miSesion = null;
let vistaActiva = 'inscripciones';
let dniQrActual = null;
let bloqueEditandoId = null;

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
  if (vista === 'programa') {
    initProgramaAdmin();
  }
  if (vista === 'acreditaciones') {
    cargarAcreditaciones();
  }
  if (vista === 'comidas') {
    cargarComidas();
  }
  if (vista === 'inscripciones') {
    cargarInscripciones();
  }
  if (vista === 'pagos') {
    cargarPagos();
  }
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => cambiarVista(tab.dataset.vista));
}

function filaTaller(t, partesExistentes, esNuevo = false) {
  const card = document.createElement('div');
  card.className = 'taller-card';

  const inputNombre = document.createElement('input');
  inputNombre.type = 'text';
  inputNombre.value = (t.nombre || '').replace(/\s*\(\d+°\s*parte\)\s*/gi, '').trim();
  inputNombre.placeholder = 'Nombre del taller';

  const inputDescripcion = document.createElement('input');
  inputDescripcion.type = 'text';
  inputDescripcion.value = t.descripcion || '';
  inputDescripcion.placeholder = 'Descripción (opcional)';

  const inputDisertante = document.createElement('input');
  inputDisertante.type = 'text';
  inputDisertante.value = t.disertante || '';
  inputDisertante.placeholder = 'Disertante';

  const inputLugar = document.createElement('input');
  inputLugar.type = 'text';
  inputLugar.value = t.lugar || '';
  inputLugar.placeholder = 'Lugar (opcional)';
  inputLugar.maxLength = 255;

  const inputCupo = document.createElement('input');
  inputCupo.type = 'number';
  inputCupo.min = '0';
  inputCupo.value = t.cupo ?? 20;

  const partesContainer = document.createElement('div');
  partesContainer.className = 'taller-card-parts';

  function crearSeccionParte(parteIdx, datos) {
    const section = document.createElement('div');
    section.className = 'taller-part-section';

    const group = document.createElement('div');
    group.className = 'taller-card-row-group';

    const colFecha = document.createElement('div');
    colFecha.className = 'taller-card-col';
    const lblFecha = document.createElement('label');
    lblFecha.textContent = 'Fecha';
    const inputFecha = document.createElement('input');
    inputFecha.type = 'date';
    inputFecha.value = datos.fecha || '';
    colFecha.append(lblFecha, inputFecha);

    const colHora = document.createElement('div');
    colHora.className = 'taller-card-col';
    const lblHora = document.createElement('label');
    lblHora.textContent = 'Hora';
    const inputHora = document.createElement('input');
    inputHora.type = 'time';
    inputHora.value = datos.hora || '';
    colHora.append(lblHora, inputHora);

    const colDuracion = document.createElement('div');
    colDuracion.className = 'taller-card-col';
    const lblDuracion = document.createElement('label');
    lblDuracion.textContent = 'Horas';
    const inputDuracion = document.createElement('input');
    inputDuracion.type = 'number';
    inputDuracion.min = '1';
    inputDuracion.max = '10';
    inputDuracion.value = datos.duracion_hs ?? 3;
    colDuracion.append(lblDuracion, inputDuracion);

    group.append(colFecha, colHora, colDuracion);
    section.append(group);

    section._datos = () => ({
      id: datos.id || null,
      fecha: inputFecha.value || '',
      hora: inputHora.value || '',
      duracion_hs: Number(inputDuracion.value) || 3,
    });

    return section;
  }

  function renderPartes() {
    const cant = Number(inputPartes.value) || 1;
    partesContainer.innerHTML = '';
    for (let i = 0; i < cant; i++) {
      const datos = partesExistentes[i] || { fecha: '', hora: '', duracion_hs: 3 };
      partesContainer.appendChild(crearSeccionParte(i, datos));
    }
  }

  const rowPartes = document.createElement('div');
  rowPartes.className = 'taller-card-row-group';
  const colPartes = document.createElement('div');
  colPartes.className = 'taller-card-col';
  const lblPartes = document.createElement('label');
  lblPartes.textContent = 'Partes';
  const inputPartes = document.createElement('input');
  inputPartes.type = 'number';
  inputPartes.min = '1';
  inputPartes.max = '5';
  inputPartes.value = partesExistentes.length || 1;
  inputPartes.addEventListener('input', renderPartes);
  colPartes.append(lblPartes, inputPartes);
  rowPartes.append(colPartes);

  renderPartes();

  const btnGuardar = document.createElement('button');
  btnGuardar.type = 'button';
  btnGuardar.className = 'boton boton-chico';
  btnGuardar.textContent = esNuevo ? 'Crear' : 'Guardar';
  btnGuardar.addEventListener('click', async () => {
    const cantPartes = Number(inputPartes.value) || 1;
    const parts = [];
    const sections = partesContainer.querySelectorAll('.taller-part-section');
    sections.forEach(sec => { if (sec._datos) parts.push(sec._datos()); });
    while (parts.length < cantPartes) parts.push({ fecha: '', hora: '', duracion_hs: 3 });

    const payload = {
      nombre: inputNombre.value.trim(),
      descripcion: inputDescripcion.value.trim(),
      cupo: inputCupo.value,
      lugar: inputLugar.value || '',
      disertante: inputDisertante.value || '',
      parts: parts.slice(0, cantPartes),
    };
    if (!payload.nombre) {
      mostrarMensaje(mensajePanel, 'El nombre del taller es obligatorio.', 'error');
      return;
    }
    btnGuardar.disabled = true;
    const res = esNuevo
      ? await api('/api/admin/talleres', { method: 'POST', body: JSON.stringify(payload) })
      : await api(`/api/admin/talleres/${t.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) {
      mostrarMensaje(mensajePanel, res.data.error || 'No se pudo guardar el taller.', 'error');
    } else {
      mostrarMensaje(mensajePanel, esNuevo ? 'Taller creado.' : 'Taller actualizado.', 'ok');
      await cargarDatos();
    }
    btnGuardar.disabled = false;
  });

  const header = document.createElement('div');
  header.className = 'taller-card-header';

  const badgePartes = document.createElement('span');
  badgePartes.className = 'taller-badge taller-badge-partes';
  badgePartes.textContent = 'Insc./Cupo';

  const badgeInscriptos = document.createElement('span');
  badgeInscriptos.className = 'taller-inscriptos';
  const inscriptos = t.inscriptos ?? 0;
  const cupo = t.cupo ?? 20;
  const lleno = inscriptos >= cupo;
  badgeInscriptos.textContent = `${inscriptos}/${cupo}`;
  if (lleno) badgeInscriptos.classList.add('lleno');

  header.append(badgePartes, badgeInscriptos);

  const body = document.createElement('div');
  body.className = 'taller-card-body';

  const row1 = document.createElement('div');
  row1.className = 'taller-card-row';
  const lblNombre = document.createElement('label');
  lblNombre.textContent = 'Nombre';
  row1.append(lblNombre, inputNombre);

  const row2 = document.createElement('div');
  row2.className = 'taller-card-row';
  const lblDisertante = document.createElement('label');
  lblDisertante.textContent = 'Disertante';
  row2.append(lblDisertante, inputDisertante);

  const row3 = document.createElement('div');
  row3.className = 'taller-card-row';
  const lblDesc = document.createElement('label');
  lblDesc.textContent = 'Descripción';
  row3.append(lblDesc, inputDescripcion);

  const row4 = document.createElement('div');
  row4.className = 'taller-card-row';
  const lblLugar = document.createElement('label');
  lblLugar.textContent = 'Lugar';
  row4.append(lblLugar, inputLugar);

  const rowCupo = document.createElement('div');
  rowCupo.className = 'taller-card-row-group';
  const colCupo = document.createElement('div');
  colCupo.className = 'taller-card-col';
  const lblCupo = document.createElement('label');
  lblCupo.textContent = 'Cupo';
  inputCupo.className = 'input-cupo';
  colCupo.append(lblCupo, inputCupo);
  rowCupo.append(colCupo);

  body.append(row1, row2, row3, row4, rowCupo, rowPartes, partesContainer);

  const footer = document.createElement('div');
  footer.className = 'taller-card-footer';

  if (!esNuevo) {
    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'boton boton-peligro boton-chico';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.addEventListener('click', async () => {
      const totalPartes = partesExistentes.length || 1;
      const aviso =
        t.inscriptos > 0
          ? `El taller "${t.nombre}" tiene ${t.inscriptos} inscriptos${totalPartes > 1 ? ` y ${totalPartes} partes` : ''}, que también se eliminarán. ¿Continuar?`
          : totalPartes > 1
            ? `¿Eliminar el taller "${t.nombre}" y sus ${totalPartes} partes?`
            : `¿Eliminar el taller "${t.nombre}"?`;
      if (!window.confirm(aviso)) return;
      botonEliminar.disabled = true;
      const res = await api(`/api/admin/talleres/${t.id}`, { method: 'DELETE' });
      if (!res.ok) {
        mostrarMensaje(mensajePanel, res.data.error || 'No se pudo eliminar el taller.', 'error');
      } else {
        mostrarMensaje(mensajePanel, 'Taller eliminado.', 'ok');
        await cargarDatos();
      }
      botonEliminar.disabled = false;
    });
    footer.append(btnGuardar, botonEliminar);
  } else {
    footer.append(btnGuardar);
  }

  card.append(header, body, footer);
  return card;
}

function renderTalleres(talleres) {
  const contenedor = el('listaTalleres');
  contenedor.innerHTML = '';
  const mainMap = new Map();
  const order = [];
  for (const t of talleres) {
    if (t.pareja_id) {
      if (!mainMap.has(t.pareja_id)) mainMap.set(t.pareja_id, []);
      mainMap.get(t.pareja_id).push(t);
    } else {
      if (!mainMap.has(t.id)) mainMap.set(t.id, []);
      order.push(t);
    }
  }
  for (const t of order) {
    const hijos = (mainMap.get(t.id) || []).sort((a, b) => a.id - b.id);
    const partes = [{ id: t.id, fecha: t.fecha || '', hora: t.hora || '', duracion_hs: t.duracion_hs ?? 3 }];
    for (const h of hijos) {
      partes.push({ id: h.id, fecha: h.fecha || '', hora: h.hora || '', duracion_hs: h.duracion_hs ?? 3 });
    }
    contenedor.appendChild(filaTaller(t, partes));
  }
}

el('botonAgregar').addEventListener('click', () => {
  const contenedor = el('listaTalleres');
  contenedor.insertBefore(filaTaller({ cupo: 20 }, [], true), contenedor.firstChild);
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
  el('permUsuarioPrograma').checked = usuario ? usuario.perm_programa : true;
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
    perm_programa: el('permUsuarioPrograma').checked,
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
  renderTalleres(talleres.data);
  window.__inscripcionesActuales = inscripciones.data;
  renderInscripciones(inscripciones.data);
  resumenEncuentro.textContent = `Personas cargadas: ${encuentro.data.total ?? 0}.`;
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
    { key: 'perm_programa', label: 'Programa' },
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

function abrirModalBloque(bloque) {
  bloqueEditandoId = bloque ? bloque.id : null;
  modalBloqueTitulo.textContent = bloque ? 'Editar bloque' : 'Nuevo bloque';
  mostrarMensaje(mensajeBloque, '', '');

  if (bloque) {
    el('bloqueDia').value = bloque.dia || '';
    el('bloqueTipo').value = bloque.tipo || 'general';
    el('bloqueTitulo').value = bloque.titulo || '';
    el('bloqueIcono').value = bloque.icono || '';
    el('bloqueHoraInicio').value = bloque.hora_inicio || '';
    el('bloqueHoraFin').value = bloque.hora_fin || '';
    el('bloqueDescripcion').value = bloque.descripcion || '';
    el('bloqueOrden').value = bloque.orden || 0;
    if (bloque.tipo === 'ponencia') {
      let datos = [];
      try { datos = JSON.parse(bloque.datos || '[]'); } catch (e) { datos = []; }
      el('bloquePonencias').value = datos.map(p => `${p.hora || ''} | ${p.titulo || ''} | ${p.ponente || ''}`).join('\n');
      campoPonencias.hidden = false;
    } else {
      el('bloquePonencias').value = '';
      campoPonencias.hidden = true;
    }
  } else {
    formBloquePrograma.reset();
    el('bloqueOrden').value = 0;
    campoPonencias.hidden = true;
  }

  modalBloquePrograma.hidden = false;
  modalBloquePrograma.setAttribute('aria-hidden', 'false');
}

function cerrarModalBloque() {
  modalBloquePrograma.hidden = true;
  modalBloquePrograma.setAttribute('aria-hidden', 'true');
  bloqueEditandoId = null;
}

el('bloqueTipo').addEventListener('change', () => {
  campoPonencias.hidden = el('bloqueTipo').value !== 'ponencia';
});

el('botonCancelarBloque').addEventListener('click', cerrarModalBloque);

formBloquePrograma.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje(mensajeBloque, '', '');

  let datos = null;
  if (el('bloqueTipo').value === 'ponencia') {
    const lineas = el('bloquePonencias').value.trim().split('\n').filter(Boolean);
    datos = lineas.map(linea => {
      const partes = linea.split('|').map(s => s.trim());
      return { hora: partes[0] || '', titulo: partes[1] || '', ponente: partes[2] || '' };
    });
  }

  const payload = {
    dia: el('bloqueDia').value,
    tipo: el('bloqueTipo').value,
    titulo: el('bloqueTitulo').value.trim(),
    icono: el('bloqueIcono').value.trim(),
    hora_inicio: el('bloqueHoraInicio').value,
    hora_fin: el('bloqueHoraFin').value,
    descripcion: el('bloqueDescripcion').value.trim(),
    orden: Number(el('bloqueOrden').value) || 0,
    datos: datos ? JSON.stringify(datos) : null,
  };

  if (!payload.titulo) {
    mostrarMensaje(mensajeBloque, 'El título es obligatorio.', 'error');
    return;
  }

  const esEdicion = !!bloqueEditandoId;
  const res = esEdicion
    ? await api(`/api/admin/programa/bloques/${bloqueEditandoId}`, { method: 'PUT', body: JSON.stringify(payload) })
    : await api('/api/admin/programa/bloques', { method: 'POST', body: JSON.stringify(payload) });

  if (!res.ok) {
    mostrarMensaje(mensajeBloque, res.data.error || 'No se pudo guardar el bloque.', 'error');
  } else {
    mostrarMensaje(mensajeBloque, esEdicion ? 'Bloque actualizado.' : 'Bloque creado.', 'ok');
    await initProgramaAdmin();
  }
});

async function initProgramaAdmin() {
  const container = el('programaAdmin');
  if (!container) return;
  ProgramaUI.init({
    container,
    mode: 'admin',
    onAdd: () => abrirModalBloque(null),
    onEdit: (id) => {
      const bloques = ProgramaUI.getBloques();
      const bloque = bloques.find(b => b.id === id);
      if (bloque) abrirModalBloque(bloque);
    },
    onDelete: async (id) => {
      if (!window.confirm('¿Eliminar este bloque del programa?')) return;
      const ok = await ProgramaUI.eliminarBloque(id);
      if (!ok) {
        mostrarMensaje(mensajePanel, 'No se pudo eliminar el bloque.', 'error');
      } else {
        mostrarMensaje(mensajePanel, 'Bloque eliminado.', 'ok');
        await initProgramaAdmin();
      }
    },
  });
  const ok = await ProgramaUI.cargar();
  if (ok) ProgramaUI.render();
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
