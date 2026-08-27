function bloquesHorarioCliente(t) {
  const fechaStr = String(t.fecha || '').trim();
  const horaStr = String(t.hora || '').trim();
  const mFecha = fechaStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const mHora = horaStr.match(/(\d{1,2}):(\d{2})/);
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

function diasDelTallerCliente(t) {
  const m = String(t.fecha || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return [];
  const durHs = Number(t.duracion_hs) || 3;
  const numDias = durHs >= 6 ? 2 : 1;
  const base = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dias = [];
  for (let i = 0; i < numDias; i++) {
    const d = new Date(base.getTime() + i * 86400000);
    dias.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return dias;
}

function talleresSeSuperponenCliente(a, b) {
  const ba = bloquesHorarioCliente(a);
  const bb = bloquesHorarioCliente(b);
  for (const x of ba) {
    for (const y of bb) {
      if (x[0] < y[1] && y[0] < x[1]) return true;
    }
  }
  return false;
}

function buscarConflictoCliente(seleccionados) {
  for (let i = 0; i < seleccionados.length; i++) {
    for (let j = i + 1; j < seleccionados.length; j++) {
      if (talleresSeSuperponenCliente(seleccionados[i], seleccionados[j])) {
        return [seleccionados[i], seleccionados[j]];
      }
    }
  }
  return null;
}

/* ── Tabs públicos (Inscripción / Programa) ─────────────────────── */
(function () {
  const vistaInscripcion = document.getElementById('vistaInscripcion');
  const vistaPrograma = document.getElementById('vistaPrograma');
  const tabs = document.querySelectorAll('.programa-public-tab');
  let programaCargado = false;

  function cambiarVistaPublica(vista) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.vista === vista));
    vistaInscripcion.hidden = vista !== 'inscripcion';
    vistaPrograma.hidden = vista !== 'programa';
    if (vista === 'programa' && !programaCargado) {
      ProgramaUI.init({ container: '#vistaPrograma', mode: 'public' });
      ProgramaUI.cargar().then(() => { ProgramaUI.render(); programaCargado = true; });
    }
  }

  tabs.forEach(t => t.addEventListener('click', () => cambiarVistaPublica(t.dataset.vista)));
})();

function formatoFecha(fechaStr) {
  const partes = String(fechaStr || '').trim().split('-');
  if (partes.length < 3) return fechaStr || '';
  const d = partes[2].padStart(2, '0');
  const m = partes[1].padStart(2, '0');
  const a = partes[0].slice(-2);
  return `${d}/${m}/${a}`;
}

function etiquetaDuracion(duracionHs) {
  return Number(duracionHs) === 6 ? '6hs · 2 días' : '3hs · 1 día';
}

function etiquetaCupo(t) {
  const lleno = t.inscriptos >= t.cupo;
  return lleno ? 'Lleno' : `${t.cupo - t.inscriptos} cupos`;
}

const formulario = document.getElementById('formInscripcion');
const botonContinuar = document.getElementById('botonContinuar');
const mensaje = document.getElementById('mensaje');
const hiddenTallerIds = document.getElementById('tallerIds');
const seleccionPrograma = document.getElementById('seleccionPrograma');
const inputDni = document.getElementById('dni');
const pasoDni = document.getElementById('pasoDni');
const pasoDatos = document.getElementById('pasoDatos');
const modalEncuentro = document.getElementById('modalEncuentro');
const botonInscribirse = document.getElementById('botonInscribirse');
const botonCancelar = document.getElementById('botonCancelar');
const modalYaInscripto = document.getElementById('modalYaInscripto');
const yaInscriptoContenido = document.getElementById('yaInscriptoContenido');
const botonYaInscripto = document.getElementById('botonYaInscripto');
const modalConfirmacion = document.getElementById('modalConfirmacion');
const confirmacionContenido = document.getElementById('confirmacionContenido');
const botonConfirmacion = document.getElementById('botonConfirmacion');
const modalInscripcionPrevia = document.getElementById('modalInscripcionPrevia');
const inscripcionPreviaContenido = document.getElementById('inscripcionPreviaContenido');
const botonInscripcionPreviaContinuar = document.getElementById('botonInscripcionPreviaContinuar');
const datosParticipante = document.getElementById('datosParticipante');
const seleccionTaller = document.getElementById('seleccionTaller');
const dpNombre = document.getElementById('dpNombre');
const dpApellido = document.getElementById('dpApellido');
const dpDni = document.getElementById('dpDni');
const dpEmail = document.getElementById('dpEmail');
const dpTelefono = document.getElementById('dpTelefono');
const dpAlimentacion = document.getElementById('dpAlimentacion');
const botonAceptarDatos = document.getElementById('botonAceptarDatos');
const botonCancelarDatos = document.getElementById('botonCancelarDatos');
const botonCancelarTaller = document.getElementById('botonCancelarTaller');
const accionesInscripcion = document.getElementById('accionesInscripcion');
const botonConfirmarInscripcion = document.getElementById('botonConfirmarInscripcion');
const modalSolapamiento = document.getElementById('modalSolapamiento');
const solapamientoContenido = document.getElementById('solapamientoContenido');
const botonSolapamiento = document.getElementById('botonSolapamiento');
const botonAnularInscripcion = document.getElementById('botonAnularInscripcion');
const botonReenviarConstancia = document.getElementById('botonReenviarConstancia');

let urlEncuentro = '';
let inscripcionPrevia = null;
let talleresData = [];
let programaSeleccion = false;
let pendingDni = '';
let pendingDniYaInscripto = '';

const ETIQUETAS_ALIMENTACION = {
  sin_restriccion: 'Sin restricción',
  vegano: 'Vegano',
  sin_tacc: 'Sin TACC',
  sin_lactosa: 'Sin lactosa',
  otro: 'Otro',
};

function mostrarPasoDatos() {
  pasoDni.hidden = true;
  pasoDatos.hidden = false;
  seleccionTaller.hidden = true;
  accionesInscripcion.hidden = true;
}

function mostrarDatosParticipante(d) {
  const dni = inputDni.value.trim();
  dpNombre.value = (d && d.nombre) || '';
  dpApellido.value = (d && d.apellido) || '';
  dpDni.value = dni;
  dpEmail.value = (d && d.email) || '';
  dpTelefono.value = (d && d.telefono) || '';
  dpAlimentacion.value = (d && d.alimentacion) || 'sin_restriccion';
  datosParticipante.hidden = false;
  setTimeout(() => dpNombre.focus(), 100);
}

function aceptarDatos() {
  const nombre = dpNombre.value.trim();
  const apellido = dpApellido.value.trim();
  const email = dpEmail.value.trim();
  if (nombre.length < 2) { mostrarMensaje('Ingresá un nombre válido.', 'error'); dpNombre.focus(); return; }
  if (apellido.length < 2) { mostrarMensaje('Ingresá un apellido válido.', 'error'); dpApellido.focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mostrarMensaje('Ingresá un correo electrónico válido.', 'error'); dpEmail.focus(); return; }
  mostrarMensaje('', '');
  datosParticipante.hidden = true;
  seleccionTaller.hidden = false;
  accionesInscripcion.hidden = true;
  cargarProgramaSeleccion();
}

function confirmarInscripcion() {
  if (!hiddenTallerIds.value) {
    mostrarMensaje('Seleccioná al menos un taller.', 'error');
    return;
  }
  mostrarMensaje('', '');
  formulario.requestSubmit();
}

botonAceptarDatos.addEventListener('click', aceptarDatos);
botonCancelarDatos.addEventListener('click', () => { window.location.reload(); });
botonCancelarTaller.addEventListener('click', () => {
  seleccionTaller.hidden = true;
  datosParticipante.hidden = false;
  dpNombre.focus();
});
botonConfirmarInscripcion.addEventListener('click', confirmarInscripcion);
botonCancelar.addEventListener('click', () => { window.location.href = '/index.html'; });

botonSolapamiento.addEventListener('click', () => {
  modalSolapamiento.hidden = true;
  modalSolapamiento.setAttribute('aria-hidden', 'true');
});

function abrirModal(modal) {
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function volverAlPasoDni() {
  pasoDatos.hidden = true;
  pasoDni.hidden = false;
  datosParticipante.hidden = true;
  seleccionTaller.hidden = true;
  accionesInscripcion.hidden = true;
  dpAlimentacion.value = 'sin_restriccion';
  hiddenTallerIds.value = '';
  inscripcionPrevia = null;
  programaSeleccion = false;
  mostrarMensaje('', '');
  inputDni.focus();
  inputDni.select();
}

function cambioSeleccionTaller(cbCambiado) {
  const checks = seleccionPrograma.querySelectorAll('.taller-checkbox');
  hiddenTallerIds.value = '';

  if (cbCambiado && cbCambiado.checked) {
    const seleccionadas = [];
    checks.forEach(cb => {
      if (!cb.checked) return;
      const id = Number(cb.dataset.tallerId);
      const t = talleresData.find(x => x.id === id);
      if (!t) return;
      const partes = [t];
      if (t.pareja_id) {
        const pareja = talleresData.find(x => x.id === t.pareja_id);
        if (pareja) partes.push(pareja);
      }
      const hijos = talleresData.filter(x => x.pareja_id === t.id);
      partes.push(...hijos);
      partes.forEach(p => { if (!seleccionadas.find(s => s.id === p.id)) seleccionadas.push(p); });
    });

    const conflicto = buscarConflictoCliente(seleccionadas);
    if (conflicto) {
      cbCambiado.checked = false;
      const nombreA = conflicto[0].nombre || 'Taller A';
      const nombreB = conflicto[1].nombre || 'Taller B';
      solapamientoContenido.innerHTML = '';
      const p = document.createElement('p');
      p.textContent = `Los talleres "${nombreA}" y "${nombreB}" se superponen en horario. Elegí solamente uno de ellos.`;
      solapamientoContenido.appendChild(p);
      abrirModal(modalSolapamiento);
      return;
    }
  }

  const ids = [];
  checks.forEach(cb => {
    if (!cb.checked) return;
    const id = Number(cb.dataset.tallerId);
    const t = talleresData.find(x => x.id === id);
    if (!t) return;
    const partes = [t, ...talleresData.filter(x => x.pareja_id === t.id)];
    for (const parte of partes) {
      if (!ids.includes(parte.id)) ids.push(parte.id);
    }
  });

  hiddenTallerIds.value = ids.join(',');
  accionesInscripcion.hidden = !hiddenTallerIds.value;
}

window.__cambioSeleccionTaller = cambioSeleccionTaller;

async function cargarProgramaSeleccion() {
  if (programaSeleccion) return;
  seleccionPrograma.innerHTML = '<p class="cargando">Cargando programa…</p>';
  try {
    if (!talleresData.length) await cargarTalleres();
    const container = document.createElement('div');
    seleccionPrograma.innerHTML = '';
    seleccionPrograma.appendChild(container);
    ProgramaUI.init({ container, mode: 'seleccion', renderType: 'tabla' });
    await ProgramaUI.cargar();
    ProgramaUI.render();
    programaSeleccion = true;
    deshabilitarSinCupo(container);
  } catch (e) {
    seleccionPrograma.innerHTML = '<p class="cargando">No se pudo cargar el programa.</p>';
  }
}

function deshabilitarSinCupo(container) {
  container.querySelectorAll('.taller-checkbox').forEach(cb => {
    const t = talleresData.find(x => x.id === Number(cb.dataset.tallerId));
    if (!t) return;
    if (t.inscriptos >= t.cupo) cb.disabled = true;
  });
}

botonCancelar.addEventListener('click', () => {
  window.location.href = '/index.html';
});

botonInscribirse.addEventListener('click', () => {
  if (urlEncuentro) {
    window.location.href = urlEncuentro;
  }
});

botonYaInscripto.addEventListener('click', () => {
  pendingDniYaInscripto = '';
  window.location.href = '/index.html';
});

botonReenviarConstancia.addEventListener('click', async () => {
  if (!pendingDniYaInscripto) return;
  botonReenviarConstancia.disabled = true;
  botonReenviarConstancia.textContent = 'Enviando…';
  try {
    const res = await fetch('/api/inscripciones/reenviar-constancia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: pendingDniYaInscripto }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarMensaje(data.error || 'No se pudo reenviar la constancia.', 'error');
      botonReenviarConstancia.disabled = false;
      botonReenviarConstancia.textContent = 'Reenviar Constancia';
      return;
    }
    modalYaInscripto.hidden = true;
    modalYaInscripto.setAttribute('aria-hidden', 'true');
    pendingDniYaInscripto = '';
    window.location.href = '/index.html';
  } catch (e) {
    mostrarMensaje('No se pudo conectar con el servidor. Intentá de nuevo.', 'error');
    botonReenviarConstancia.disabled = false;
    botonReenviarConstancia.textContent = 'Reenviar Constancia';
  }
});

botonConfirmacion.addEventListener('click', async () => {
  if (!pendingDni) return;
  botonConfirmacion.disabled = true;
  botonConfirmacion.textContent = 'Finalizando…';
  try {
    const res = await fetch('/api/inscripciones/finalizar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: pendingDni }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarMensaje(data.error || 'No se pudo finalizar la inscripción.', 'error');
      botonConfirmacion.disabled = false;
      botonConfirmacion.textContent = 'Finalizar';
      return;
    }
    if (data.qrDataUrl) {
      const contQr = document.createElement('div');
      contQr.className = 'qr-detalle';
      const img = document.createElement('img');
      img.src = data.qrDataUrl;
      img.alt = 'Código QR de acreditación';
      const p = document.createElement('p');
      p.textContent = 'Mostrá este código QR el día de la acreditación para confirmar tu asistencia.';
      contQr.append(img, p);
      confirmacionContenido.appendChild(contQr);
    }
    botonConfirmacion.textContent = 'Finalizado';
    botonConfirmacion.disabled = true;
    botonAnularInscripcion.hidden = true;
    pendingDni = '';
    setTimeout(() => { window.location.href = '/index.html'; }, 1500);
  } catch (e) {
    mostrarMensaje('No se pudo conectar con el servidor. Intentá de nuevo.', 'error');
    botonConfirmacion.disabled = false;
    botonConfirmacion.textContent = 'Finalizar';
  }
});

botonAnularInscripcion.addEventListener('click', async () => {
  if (!pendingDni) return;
  botonAnularInscripcion.disabled = true;
  botonAnularInscripcion.textContent = 'Anulando…';
  try {
    await fetch('/api/inscripciones/anular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dni: pendingDni }),
    });
  } catch (_) { /* noop */ }
  modalConfirmacion.hidden = true;
  modalConfirmacion.setAttribute('aria-hidden', 'true');
  inscripcionPrevia = null;
  pendingDni = '';
  pendingDniYaInscripto = '';
  sessionStorage.clear();
  window.location.href = '/index.html';
});

botonInscripcionPreviaContinuar.addEventListener('click', () => {
  modalInscripcionPrevia.hidden = true;
  modalInscripcionPrevia.setAttribute('aria-hidden', 'true');
  const d = inscripcionPrevia || {};
  mostrarDatosParticipante(d);
  mostrarPasoDatos();
});

function crearFila(etiqueta, valor) {
  const div = document.createElement('div');
  div.className = 'fila-detalle';
  const e = document.createElement('span');
  e.className = 'etiqueta';
  e.textContent = etiqueta;
  const v = document.createElement('div');
  v.className = 'valor';
  v.textContent = valor;
  div.append(e, v);
  return div;
}

function crearTallerDetalle(t) {
  const div = document.createElement('div');
  div.className = 'taller-detalle';
  const nombre = document.createElement('div');
  nombre.className = 'nombre-taller';
  nombre.textContent = t.taller || t.nombre;
  div.appendChild(nombre);
  const metas = [];
  const duracion = t.duracion_hs ?? t.duracionHs;
  if (duracion) metas.push(etiquetaDuracion(duracion));
  if (t.fecha) metas.push(`Fecha: ${formatoFecha(t.fecha)}`);
  if (t.hora) metas.push(`Hora: ${t.hora}`);
  if (t.lugar) metas.push(`Lugar: ${t.lugar}`);
  if (metas.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent = metas.join(' · ');
    div.appendChild(meta);
  }
  return div;
}

function mostrarModalYaInscripto(data) {
  yaInscriptoContenido.innerHTML = '';

  const nombre = data.nombre || '';
  const apellido = data.apellido || '';
  if (nombre || apellido) {
    const nombreDiv = document.createElement('div');
    nombreDiv.className = 'ya-inscripto-nombre';
    nombreDiv.textContent = `${nombre} ${apellido}`.trim();
    yaInscriptoContenido.appendChild(nombreDiv);
  }

  const intro = document.createElement('p');
  intro.textContent = 'Tu DNI ya figura con las siguientes inscripciones a los talleres:';
  yaInscriptoContenido.appendChild(intro);

  const lista = document.createElement('div');
  lista.style.marginTop = '0.75rem';
  for (const t of data.inscripciones || []) lista.appendChild(crearTallerDetalle(t));
  yaInscriptoContenido.appendChild(lista);

  pendingDniYaInscripto = inputDni.value.trim();
  abrirModal(modalYaInscripto);
}

function mostrarModalInscripcionPrevia(data) {
  inscripcionPreviaContenido.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = 'Ya tenés una inscripción previa. Podés completar la inscripción con los datos que ya tenés registrados.';
  inscripcionPreviaContenido.appendChild(p);
  const lista = document.createElement('div');
  lista.style.marginTop = '0.75rem';
  for (const t of data.inscripciones || []) lista.appendChild(crearTallerDetalle(t));
  inscripcionPreviaContenido.appendChild(lista);
  abrirModal(modalInscripcionPrevia);
}

function mostrarModalConfirmacion(insc) {
  confirmacionContenido.innerHTML = '';
  confirmacionContenido.append(crearFila('Nombre', `${insc.nombre} ${insc.apellido}`.trim()));
  confirmacionContenido.append(crearFila('DNI', insc.dni));
  confirmacionContenido.append(crearFila('Correo', insc.email));
  if (insc.telefono) confirmacionContenido.append(crearFila('Teléfono', insc.telefono));

  const tituloTalleres = document.createElement('p');
  tituloTalleres.className = 'subtitulo-modal';
  tituloTalleres.textContent = 'Tus talleres:';
  confirmacionContenido.appendChild(tituloTalleres);
  for (const t of insc.talleres || []) confirmacionContenido.appendChild(crearTallerDetalle(t));

  confirmacionContenido.append(crearFila('Alimentación', ETIQUETAS_ALIMENTACION[insc.alimentacion] || insc.alimentacion));

  pendingDni = insc.dni || '';
  botonConfirmacion.disabled = false;
  botonConfirmacion.textContent = 'Finalizar';
  botonAnularInscripcion.disabled = false;
  botonAnularInscripcion.textContent = 'Anular Inscripción';
  abrirModal(modalConfirmacion);
}

async function verificarDni() {
  const dni = inputDni.value.trim();
  if (!/^\d{7,8}$/.test(dni)) {
    mostrarMensaje('Ingresá un DNI válido (7 u 8 dígitos).', 'error');
    inputDni.focus();
    return;
  }
  mostrarMensaje('', '');
  botonContinuar.disabled = true;
  botonContinuar.textContent = 'Verificando…';
  try {
    const res = await fetch(`/api/encuentro/${encodeURIComponent(dni)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    if (data.inscripto) {
      inscripcionPrevia = data;
      if (!data.puedeInscribirse) {
        mostrarModalYaInscripto(data);
        return;
      }
      mostrarModalInscripcionPrevia(data);
      return;
    }
    if (!data.encontrado) {
      urlEncuentro = data.urlEncuentro || '';
      abrirModal(modalEncuentro);
      return;
    }
    mostrarDatosParticipante(data);
    mostrarPasoDatos();
  } catch (e) {
    mostrarMensaje('No se pudo verificar el DNI. Intentá de nuevo.', 'error');
  } finally {
    botonContinuar.disabled = false;
    botonContinuar.textContent = 'Continuar';
  }
}

botonContinuar.addEventListener('click', verificarDni);

inputDni.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    verificarDni();
  }
});

function mostrarMensaje(texto, tipo) {
  mensaje.textContent = texto || '';
  mensaje.className = `mensaje visible ${tipo || ''}`;
}

function mostrarMensajeConAviso(texto, tipo, aviso) {
  mensaje.textContent = '';
  mensaje.className = `mensaje visible ${tipo || ''}`;
  mensaje.append(document.createTextNode(texto ? texto + ' ' : ''));
  if (aviso && aviso.url) {
    const enlace = document.createElement('a');
    enlace.href = aviso.url;
    enlace.target = '_blank';
    enlace.rel = 'noopener';
    enlace.textContent = aviso.accion || 'Inscribite al encuentro';
    mensaje.appendChild(enlace);
  }
}

async function cargarTalleres() {
  try {
    const res = await fetch('/api/talleres');
    if (!res.ok) throw new Error();
    talleresData = await res.json();
  } catch (e) { /* noop */ }
}

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje('', '');
  botonConfirmarInscripcion.disabled = true;
  botonConfirmarInscripcion.textContent = 'Enviando…';

  const payload = {
    nombre: dpNombre.value.trim(),
    apellido: dpApellido.value.trim(),
    dni: dpDni.value.trim(),
    email: dpEmail.value.trim(),
    telefono: dpTelefono.value.trim(),
    alimentacion: dpAlimentacion.value,
    tallerIds: hiddenTallerIds.value || null,
  };

  try {
    const res = await fetch('/api/inscripciones', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      mostrarMensaje(data.error || 'Ocurrió un error al registrarte.', 'error');
      return;
    }

    hiddenTallerIds.value = '';
    programaSeleccion = false;
    accionesInscripcion.hidden = true;
    seleccionTaller.hidden = true;
    if (data.inscripcion) {
      mostrarModalConfirmacion(data.inscripcion);
      if (data.aviso && data.aviso.url) {
        const nota = document.createElement('p');
        nota.className = 'nota-aviso';
        const enlace = document.createElement('a');
        enlace.href = data.aviso.url;
        enlace.target = '_blank';
        enlace.rel = 'noopener';
        enlace.textContent = data.aviso.accion || 'Completá tu inscripción al encuentro';
        nota.append('Importante: ', enlace);
        confirmacionContenido.appendChild(nota);
      }
    } else {
      mostrarMensajeConAviso(data.mensaje || 'Inscripción registrada con éxito.', 'ok', data.aviso);
    }
  } catch (e) {
    mostrarMensaje('No se pudo conectar con el servidor. Intentá de nuevo.', 'error');
  } finally {
    botonConfirmarInscripcion.disabled = false;
    botonConfirmarInscripcion.textContent = 'Confirmar inscripción';
  }
});

cargarTalleres();
