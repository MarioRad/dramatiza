const ETIQUETAS_TURNO = { manana: 'Mañana', tarde: 'Tarde' };
const ETIQUETAS_ROL = { admin: 'Administrador', operador: 'Operador' };
const ETIQUETAS_EVENTO = {
  inscripcion_creada: 'Inscripción creada',
  inscripcion_modificada: 'Inscripción modificada',
  inscripcion_eliminada: 'Inscripción eliminada',
  acreditacion_reenviada: 'Acreditación reenviada',
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
  encuentro: 'Listado del encuentro',
  eventos: 'Registro de eventos',
  usuarios: 'Usuarios',
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
const modalEditar = el('modalEditarInscripcion');
const modalEditarInfo = el('modalEditarInfo');
const modalEditarTaller = el('modalEditarTaller');
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

let talleresActuales = [];
let inscripcionEditando = null;
let usuarioEditando = null;
let miSesion = null;
let vistaActiva = 'inscripciones';
let dniQrActual = null;

function mostrarMensaje(elNodo, texto, tipo) {
  elNodo.textContent = texto || '';
  elNodo.className = `mensaje visible ${tipo || ''}`;
}

async function api(uri, opciones = {}) {
  const res = await fetch(uri, {
    headers: { 'Content-Type': 'application/json' },
    ...opciones,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function formatearFecha(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return valor;
  return fecha.toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' });
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
  if (!esAdmin && (vistaActiva === 'eventos' || vistaActiva === 'usuarios')) {
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
}

for (const tab of document.querySelectorAll('.tab')) {
  tab.addEventListener('click', () => cambiarVista(tab.dataset.vista));
}

function filaTaller(t, esNuevo = false) {
  const tr = document.createElement('tr');

  const tdTurno = document.createElement('td');
  const selectTurno = document.createElement('select');
  for (const [valor, etiqueta] of Object.entries(ETIQUETAS_TURNO)) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = etiqueta;
    selectTurno.appendChild(opcion);
  }
  selectTurno.value = t.turno;
  tdTurno.appendChild(selectTurno);

  const tdNombre = document.createElement('td');
  const inputNombre = document.createElement('input');
  inputNombre.type = 'text';
  inputNombre.value = t.nombre || '';
  inputNombre.placeholder = 'Nombre del taller';
  tdNombre.appendChild(inputNombre);

  const tdDescripcion = document.createElement('td');
  const inputDescripcion = document.createElement('input');
  inputDescripcion.type = 'text';
  inputDescripcion.value = t.descripcion || '';
  inputDescripcion.placeholder = 'Descripción (opcional)';
  tdDescripcion.appendChild(inputDescripcion);

  const tdInscriptos = document.createElement('td');
  tdInscriptos.textContent = t.inscriptos ?? 0;

  const tdCupo = document.createElement('td');
  const inputCupo = document.createElement('input');
  inputCupo.type = 'number';
  inputCupo.min = '0';
  inputCupo.value = t.cupo ?? 20;
  inputCupo.className = 'input-cupo';
  tdCupo.appendChild(inputCupo);

  const tdDuracion = document.createElement('td');
  const selectDuracion = document.createElement('select');
  for (const [valor, etiqueta] of [[3, '3hs · 1 día'], [6, '6hs · 2 días']]) {
    const opcion = document.createElement('option');
    opcion.value = valor;
    opcion.textContent = etiqueta;
    selectDuracion.appendChild(opcion);
  }
  selectDuracion.value = t.duracion_hs ?? 3;
  tdDuracion.appendChild(selectDuracion);

  const tdFecha = document.createElement('td');
  const inputFecha = document.createElement('input');
  inputFecha.type = 'date';
  inputFecha.value = t.fecha || '';
  tdFecha.appendChild(inputFecha);

  const tdHora = document.createElement('td');
  const inputHora = document.createElement('input');
  inputHora.type = 'time';
  inputHora.value = t.hora || '';
  tdHora.appendChild(inputHora);

  const tdLugar = document.createElement('td');
  const inputLugar = document.createElement('input');
  inputLugar.type = 'text';
  inputLugar.value = t.lugar || '';
  inputLugar.placeholder = 'Lugar (opcional)';
  inputLugar.maxLength = 255;
  tdLugar.appendChild(inputLugar);

  const tdAcciones = document.createElement('td');
  const botonGuardar = document.createElement('button');
  botonGuardar.type = 'button';
  botonGuardar.className = 'boton boton-chico';
  botonGuardar.textContent = esNuevo ? 'Crear' : 'Guardar';
  botonGuardar.addEventListener('click', async () => {
    const payload = {
      nombre: inputNombre.value.trim(),
      descripcion: inputDescripcion.value.trim(),
      turno: selectTurno.value,
      cupo: inputCupo.value,
      duracion_hs: selectDuracion.value,
      fecha: inputFecha.value || '',
      hora: inputHora.value || '',
      lugar: inputLugar.value || '',
    };
    if (!payload.nombre) {
      mostrarMensaje(mensajePanel, 'El nombre del taller es obligatorio.', 'error');
      return;
    }
    botonGuardar.disabled = true;
    const res = esNuevo
      ? await api('/api/admin/talleres', { method: 'POST', body: JSON.stringify(payload) })
      : await api(`/api/admin/talleres/${t.id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (!res.ok) {
      mostrarMensaje(mensajePanel, res.data.error || 'No se pudo guardar el taller.', 'error');
    } else {
      mostrarMensaje(mensajePanel, esNuevo ? 'Taller creado.' : 'Taller actualizado.', 'ok');
      await cargarDatos();
    }
    botonGuardar.disabled = false;
  });
  tdAcciones.appendChild(botonGuardar);

  if (!esNuevo) {
    const botonEliminar = document.createElement('button');
    botonEliminar.type = 'button';
    botonEliminar.className = 'boton boton-peligro boton-chico';
    botonEliminar.textContent = 'Eliminar';
    botonEliminar.addEventListener('click', async () => {
      const aviso =
        t.inscriptos > 0
          ? `El taller "${t.nombre}" tiene ${t.inscriptos} inscriptos, que también se eliminarán. ¿Continuar?`
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
    tdAcciones.appendChild(botonEliminar);
  }

  tr.append(tdTurno, tdNombre, tdDescripcion, tdInscriptos, tdCupo, tdDuracion, tdFecha, tdHora, tdLugar, tdAcciones);
  return tr;
}

function renderTalleres(talleres) {
  const cuerpo = document.querySelector('#tablaTalleres tbody');
  cuerpo.innerHTML = '';
  for (const t of talleres) cuerpo.appendChild(filaTaller(t));
}

el('botonAgregar').addEventListener('click', () => {
  const cuerpo = document.querySelector('#tablaTalleres tbody');
  cuerpo.appendChild(filaTaller({ turno: 'manana', cupo: 20, duracion_hs: 3 }, true));
});

function abrirModalEdicion(inscripcion) {
  inscripcionEditando = inscripcion;
  modalEditarInfo.textContent =
    `${inscripcion.nombre} ${inscripcion.apellido} (DNI ${inscripcion.dni}) · Turno ${ETIQUETAS_TURNO[inscripcion.turno] || inscripcion.turno}`;

  modalEditarTaller.innerHTML = '';
  const talleresDelTurno = talleresActuales.filter((t) => t.turno === inscripcion.turno);
  for (const t of talleresDelTurno) {
    const opcion = document.createElement('option');
    opcion.value = t.id;
    const lleno = t.inscriptos >= t.cupo;
    const esActual = t.id === inscripcion.taller_id;
    const etiqueta = lleno && !esActual
      ? `${t.nombre} (lleno)`
      : `${t.nombre} — ${t.cupo - t.inscriptos} cupos`;
    opcion.textContent = etiqueta;
    opcion.disabled = lleno && !esActual;
    if (esActual) opcion.selected = true;
    modalEditarTaller.appendChild(opcion);
  }

  modalEditar.hidden = false;
  modalEditar.setAttribute('aria-hidden', 'false');
}

function cerrarModalEdicion() {
  modalEditar.hidden = true;
  modalEditar.setAttribute('aria-hidden', 'true');
  inscripcionEditando = null;
}

botonCancelarEdicion.addEventListener('click', cerrarModalEdicion);

botonGuardarEdicion.addEventListener('click', async () => {
  if (!inscripcionEditando) return;
  const nuevoTaller = modalEditarTaller.value;
  if (!nuevoTaller) return;
  botonGuardarEdicion.disabled = true;
  const res = await api(`/api/admin/inscripciones/${inscripcionEditando.id}`, {
    method: 'PUT',
    body: JSON.stringify({ taller_id: nuevoTaller }),
  });
  if (!res.ok) {
    mostrarMensaje(mensajePanel, res.data.error || 'No se pudo modificar la inscripción.', 'error');
  } else {
    mostrarMensaje(mensajePanel, 'Inscripción modificada.', 'ok');
    cerrarModalEdicion();
    await cargarDatos();
  }
  botonGuardarEdicion.disabled = false;
});

function renderInscripciones(inscripciones) {
  const cuerpo = document.querySelector('#tablaInscripciones tbody');
  cuerpo.innerHTML = '';
  const enEncuentro = inscripciones.filter((i) => i.en_encuentro).length;
  const completos = inscripciones.filter((i) => i.estado_pago === 'pago_completo').length;
  const parciales = inscripciones.filter((i) => i.estado_pago === 'pago_parcial').length;
  const noPagados = inscripciones.filter((i) => i.estado_pago !== 'pago_completo' && i.estado_pago !== 'pago_parcial').length;
  resumenInscripciones.textContent =
    `Total: ${inscripciones.length} inscripción(es) · ${enEncuentro} con pagos registrados · ` +
    `${completos} completo(s) · ${parciales} parcial(es) · ${noPagados} no pagado(s).`;

  const dniFiltro = buscarDni.value.trim().replace(/\D/g, '');
  const pagoFiltro = filtroPago.value;
  const visibles = inscripciones.filter(
    (i) => (!dniFiltro || i.dni.includes(dniFiltro)) && (!pagoFiltro || i.estado_pago === pagoFiltro)
  );

  if (visibles.length === 0) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 11;
    td.textContent = dniFiltro || pagoFiltro ? 'Sin resultados para el filtro.' : 'No hay inscripciones.';
    td.style.color = 'var(--color-texto-suave)';
    tr.appendChild(td);
    cuerpo.appendChild(tr);
    return;
  }

  for (const i of visibles) {
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
    tdTaller.textContent = i.taller;

    const tdTurno = document.createElement('td');
    tdTurno.textContent = ETIQUETAS_TURNO[i.turno] || i.turno;

    const tdEncuentro = document.createElement('td');
    tdEncuentro.textContent = i.en_encuentro ? 'Sí' : 'No';
    tdEncuentro.className = i.en_encuentro ? 'encuentro-si' : 'encuentro-no';

    const tdPago = document.createElement('td');
    const selectPago = document.createElement('select');
    selectPago.className = `estado-pago ${i.estado_pago || 'no_pagado'}`;
    for (const [valor, etiqueta] of Object.entries(ETIQUETAS_PAGO)) {
      const opcion = document.createElement('option');
      opcion.value = valor;
      opcion.textContent = etiqueta;
      selectPago.appendChild(opcion);
    }
    selectPago.value = i.estado_pago || 'no_pagado';
    selectPago.addEventListener('change', async () => {
      selectPago.disabled = true;
      const res = await api(`/api/admin/inscripciones/${i.id}`, {
        method: 'PUT',
        body: JSON.stringify({ estado_pago: selectPago.value }),
      });
      if (!res.ok) {
        mostrarMensaje(mensajePanel, res.data.error || 'No se pudo cambiar el estado de pago.', 'error');
        selectPago.value = i.estado_pago || 'no_pagado';
      } else {
        mostrarMensaje(mensajePanel, `Pago de ${i.nombre} ${i.apellido} actualizado.`, 'ok');
        await cargarDatos();
      }
      selectPago.disabled = false;
    });
    tdPago.appendChild(selectPago);

    const tdFecha = document.createElement('td');
    tdFecha.textContent = formatearFecha(i.creado_en);

    const tdAccion = document.createElement('td');
    const contenedorAcciones = document.createElement('div');
    contenedorAcciones.className = 'acciones-fila';

    const botonEditar = document.createElement('button');
    botonEditar.type = 'button';
    botonEditar.className = 'boton boton-chico';
    botonEditar.textContent = 'Editar';
    botonEditar.addEventListener('click', () => abrirModalEdicion({ ...i, taller_id: i.taller_id }));
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

    tr.append(tdDni, tdNombre, tdEmail, tdTelefono, tdAlimentacion, tdTaller, tdTurno, tdEncuentro, tdPago, tdFecha, tdAccion);
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
    const sesiones = (d.sesiones || []).map((s) => `${s.taller} (${ETIQUETAS_TURNO[s.turno] || s.turno})`).join(' · ');
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

async function cargarDatos() {
  mostrarMensaje(mensajePanel, '', '');
  const esAdmin = miSesion && miSesion.rol === 'admin';
  const peticiones = [
    api('/api/admin/talleres'),
    api('/api/admin/inscripciones'),
    api('/api/admin/encuentro'),
  ];
  if (esAdmin) peticiones.push(api('/api/admin/eventos'), api('/api/admin/usuarios'));
  const [talleres, inscripciones, encuentro, eventos, usuarios] = await Promise.all(peticiones);

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
    renderEventos(eventos.data || []);
    renderUsuarios(usuarios.data || []);
  }
  mostrarPanel();
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
  miSesion = { usuario: res.data.usuario, nombre: res.data.nombre, rol: res.data.rol };
  formLogin.reset();
  await cargarDatos();
});

botonSalir.addEventListener('click', async () => {
  await api('/api/admin/logout', { method: 'POST' });
  mostrarLogin();
});

(async () => {
  const res = await api('/api/admin/perfil');
  if (res.ok) {
    miSesion = { usuario: res.data.usuario, nombre: res.data.nombre, rol: res.data.rol };
    await cargarDatos();
  } else {
    mostrarLogin();
  }
})();
