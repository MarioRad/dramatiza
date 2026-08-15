const ETIQUETAS_TURNO = { manana: 'mañana', tarde: 'tarde' };

function etiquetaDuracion(duracionHs) {
  return Number(duracionHs) === 6 ? '6hs · 2 días' : '3hs · 1 día';
}

function etiquetaCupo(t) {
  const lleno = t.inscriptos >= t.cupo;
  return lleno ? 'Lleno' : `${t.cupo - t.inscriptos} cupos`;
}

const formulario = document.getElementById('formInscripcion');
const botonEnviar = document.getElementById('botonEnviar');
const botonContinuar = document.getElementById('botonContinuar');
const mensaje = document.getElementById('mensaje');
const selectManana = document.getElementById('tallerManana');
const selectTarde = document.getElementById('tallerTarde');
const listaTalleres = document.getElementById('listaTalleres');
const inputDni = document.getElementById('dni');
const pasoDni = document.getElementById('pasoDni');
const pasoDatos = document.getElementById('pasoDatos');
const cambiarDni = document.getElementById('cambiarDni');
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
const botonInscripcionPreviaCancelar = document.getElementById('botonInscripcionPreviaCancelar');

let urlEncuentro = '';
let inscripcionPrevia = null;

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
}

function abrirModal(modal) {
  modal.hidden = false;
  modal.setAttribute('aria-hidden', 'false');
}

function volverAlPasoDni() {
  pasoDatos.hidden = true;
  pasoDni.hidden = false;
  formulario.nombre.value = '';
  formulario.apellido.value = '';
  formulario.email.value = '';
  formulario.telefono.value = '';
  formulario.alimentacion.value = 'sin_restriccion';
  formulario.tallerManana.value = '';
  formulario.tallerTarde.value = '';
  inscripcionPrevia = null;
  reiniciarTurnos();
  mostrarMensaje('', '');
  inputDni.focus();
  inputDni.select();
}

function reiniciarTurnos() {
  selectManana.disabled = false;
  selectTarde.disabled = false;
  selectManana.classList.remove('select-tomado');
  selectTarde.classList.remove('select-tomado');
}

function configurarTurnosTomados(turnosTomados) {
  for (const turno of turnosTomados) {
    const select = turno === 'manana' ? selectManana : selectTarde;
    select.disabled = true;
    select.classList.add('select-tomado');
  }
}

botonCancelar.addEventListener('click', () => {
  window.location.reload();
});

botonInscribirse.addEventListener('click', () => {
  if (urlEncuentro) {
    window.location.href = urlEncuentro;
  }
});

botonYaInscripto.addEventListener('click', () => {
  window.location.reload();
});

botonConfirmacion.addEventListener('click', () => {
  modalConfirmacion.hidden = true;
  modalConfirmacion.setAttribute('aria-hidden', 'true');
  volverAlPasoDni();
});

botonInscripcionPreviaCancelar.addEventListener('click', () => {
  window.location.reload();
});

botonInscripcionPreviaContinuar.addEventListener('click', () => {
  modalInscripcionPrevia.hidden = true;
  modalInscripcionPrevia.setAttribute('aria-hidden', 'true');
  const d = inscripcionPrevia || {};
  formulario.nombre.value = d.nombre || '';
  formulario.apellido.value = d.apellido || '';
  formulario.email.value = d.email || '';
  formulario.telefono.value = d.telefono || '';
  configurarTurnosTomados(d.turnosTomados || []);
  for (const t of d.inscripciones || []) {
    const select = t.turno === 'manana' ? selectManana : selectTarde;
    if (t.tallerId) select.value = String(t.tallerId);
  }
  mostrarPasoDatos();
  const selectLibre = (d.turnosTomados || []).includes('manana') ? selectTarde : selectManana;
  selectLibre.focus();
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
  const turno = ETIQUETAS_TURNO[t.turno] || t.turno;
  const nombre = document.createElement('div');
  nombre.className = 'nombre-taller';
  nombre.textContent = `${t.taller || t.nombre} (Turno ${turno})`;
  div.appendChild(nombre);
  const metas = [];
  const duracion = t.duracion_hs ?? t.duracionHs;
  if (duracion) metas.push(etiquetaDuracion(duracion));
  if (t.fecha) metas.push(`Fecha: ${t.fecha}`);
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
  yaInscriptoContenido.append(document.createTextNode('Tu DNI ya figura con las siguientes inscripciones a los talleres:'));
  const lista = document.createElement('div');
  lista.style.marginTop = '0.75rem';
  for (const t of data.inscripciones || []) lista.appendChild(crearTallerDetalle(t));
  yaInscriptoContenido.appendChild(lista);
  abrirModal(modalYaInscripto);
}

function mostrarModalInscripcionPrevia(data) {
  const turnoFaltante = (data.turnosTomados || []).includes('manana') ? 'tarde' : 'manana';
  inscripcionPreviaContenido.innerHTML = '';
  const p = document.createElement('p');
  p.textContent = `Ya tenés taller(es) registrados. Podés sumar uno del turno ${ETIQUETAS_TURNO[turnoFaltante]}.`;
  inscripcionPreviaContenido.appendChild(p);
  const lista = document.createElement('div');
  lista.style.marginTop = '0.75rem';
  for (const t of data.inscripciones || []) lista.appendChild(crearTallerDetalle(t));
  inscripcionPreviaContenido.appendChild(lista);
  abrirModal(modalInscripcionPrevia);
}

function mostrarModalConfirmacion(insc) {
  confirmacionContenido.innerHTML = '';
  confirmacionContenido.append(crearFila('Código único', insc.codigo));
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

  if (insc.qrDataUrl) {
    const contQr = document.createElement('div');
    contQr.className = 'qr-detalle';
    const img = document.createElement('img');
    img.src = insc.qrDataUrl;
    img.alt = 'Código QR de acreditación';
    const p = document.createElement('p');
    p.textContent = 'Mostrá este código QR al ingresar para confirmar tu asistencia.';
    contQr.append(img, p);
    confirmacionContenido.appendChild(contQr);
  }
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
    formulario.nombre.value = data.nombre || '';
    formulario.apellido.value = data.apellido || '';
    formulario.email.value = data.email || '';
    formulario.telefono.value = data.telefono || '';
    mostrarPasoDatos();
    selectManana.focus();
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

cambiarDni.addEventListener('click', (e) => {
  e.preventDefault();
  volverAlPasoDni();
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

function opcionVacia() {
  const opcion = document.createElement('option');
  opcion.value = '';
  opcion.textContent = '— Sin taller —';
  return opcion;
}

function renderLista(talleres) {
  const porTurno = { manana: [], tarde: [] };
  for (const t of talleres) porTurno[t.turno].push(t);

  listaTalleres.innerHTML = '';
  for (const turno of ['manana', 'tarde']) {
    const grupo = document.createElement('div');
    grupo.className = 'grupo-turno';
    const titulo = document.createElement('h3');
    titulo.textContent = `Turno ${ETIQUETAS_TURNO[turno]}`;
    const ul = document.createElement('ul');
    for (const t of porTurno[turno]) {
      const li = document.createElement('li');
      const contenedor = document.createElement('div');
      const nombre = document.createElement('span');
      nombre.textContent = t.nombre;
      const duracion = document.createElement('span');
      duracion.className = 'duracion-taller';
      duracion.textContent = etiquetaDuracion(t.duracion_hs);
      contenedor.append(nombre, duracion);
      const lleno = t.inscriptos >= t.cupo;
      const badge = document.createElement('span');
      badge.className = `estado-cupo${lleno ? ' lleno' : ''}`;
      badge.textContent = etiquetaCupo(t);
      li.append(contenedor, badge);
      ul.appendChild(li);
    }
    grupo.append(titulo, ul);
    listaTalleres.appendChild(grupo);
  }
}

async function cargarTalleres() {
  try {
    const res = await fetch('/api/talleres');
    if (!res.ok) throw new Error();
    const talleres = await res.json();

    for (const select of [selectManana, selectTarde]) {
      select.innerHTML = '';
      select.appendChild(opcionVacia());
    }

    for (const t of talleres) {
      const select = t.turno === 'manana' ? selectManana : selectTarde;
      const opcion = document.createElement('option');
      opcion.value = t.id;
      const lleno = t.inscriptos >= t.cupo;
      const etiqueta = lleno
        ? `${t.nombre} (lleno)`
        : `${t.nombre} — ${etiquetaDuracion(t.duracion_hs)} (${t.cupo - t.inscriptos} cupos)`;
      opcion.textContent = etiqueta;
      opcion.disabled = lleno;
      select.appendChild(opcion);
    }

    renderLista(talleres);
  } catch (e) {
    listaTalleres.innerHTML = '<p class="cargando">No se pudieron cargar los talleres.</p>';
  }
}

formulario.addEventListener('submit', async (e) => {
  e.preventDefault();
  mostrarMensaje('', '');
  botonEnviar.disabled = true;
  botonEnviar.textContent = 'Enviando…';

  const turnosTomados = inscripcionPrevia && inscripcionPrevia.turnosTomados ? inscripcionPrevia.turnosTomados : [];
  const payload = {
    nombre: formulario.nombre.value.trim(),
    apellido: formulario.apellido.value.trim(),
    dni: formulario.dni.value.trim(),
    email: formulario.email.value.trim(),
    telefono: formulario.telefono.value.trim(),
    alimentacion: formulario.alimentacion.value,
    tallerManana: turnosTomados.includes('manana') ? null : formulario.tallerManana.value || null,
    tallerTarde: turnosTomados.includes('tarde') ? null : formulario.tallerTarde.value || null,
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

    formulario.reset();
    await cargarTalleres();
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
    botonEnviar.disabled = false;
    botonEnviar.textContent = 'Inscribirme';
  }
});

cargarTalleres();
