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

/* ── Tabs públicos (Inscripción / Programa / Disertantes) ────────── */
(function () {
  const vistaInscripcion = document.getElementById('vistaInscripcion');
  const vistaPrograma = document.getElementById('vistaPrograma');
  const vistaDisertantes = document.getElementById('vistaDisertantes');
  const tabs = document.querySelectorAll('.programa-public-tab');
  let programaCargado = false;

  function cambiarVistaPublica(vista) {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.vista === vista));
    vistaInscripcion.hidden = vista !== 'inscripcion';
    vistaPrograma.hidden = vista !== 'programa';
    vistaDisertantes.hidden = vista !== 'disertantes';
    if ((vista === 'programa' || vista === 'disertantes') && !programaCargado) {
      ProgramaUI.init({ container: '#vistaPrograma', disertantesContainer: '#vistaDisertantes', mode: 'public' });
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
  const a = partes[0].length === 2 ? `20${partes[0]}` : partes[0];
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
botonSolapamiento.addEventListener('click', () => {
  modalSolapamiento.hidden = true;
  modalSolapamiento.setAttribute('aria-hidden', 'true');
});

// ── Encuentro nativo (reemplaza Google Forms) — estilo Google Forms + alias + comprobante ──
const formEncuentro = document.getElementById('formEncuentro');
const encuentroMensaje = document.getElementById('encuentroMensaje');
const encDni = document.getElementById('encDni');
const encNombre = document.getElementById('encNombre');
const encApellido = document.getElementById('encApellido');
const encEmail = document.getElementById('encEmail');
const encTelefono = document.getElementById('encTelefono');
const encFechaNacimiento = document.getElementById('encFechaNacimiento');
const encProvincia = document.getElementById('encProvincia');
const encCiudad = document.getElementById('encCiudad');
const encOcupacion = document.getElementById('encOcupacion');
const encOpcionPago = document.getElementById('encOpcionPago');
const encComprobante = document.getElementById('encComprobante');
const encComprobanteInfo = document.getElementById('encComprobanteInfo');
const encOpcionesPagoLista = document.getElementById('encOpcionesPagoLista');
const encAliasValor = document.getElementById('encAliasValor');
const encAliasLeyenda = document.getElementById('encAliasLeyenda');
const encTransferenciaTitulo = document.getElementById('encTransferenciaTitulo');
const encTransferenciaDesc = document.getElementById('encTransferenciaDesc');
const btnCopiarAlias = document.getElementById('btnCopiarAlias');
const botonCancelarEncuentro = document.getElementById('botonCancelarEncuentro');
const botonEnviarEncuentro = document.getElementById('botonEnviarEncuentro');
const encuentroDniInfo = document.getElementById('encuentroDniInfo');

let encuentroConfig = null;
async function cargarEncuentroConfig() {
  if (encuentroConfig) return encuentroConfig;
  try {
    const res = await fetch('/api/encuentro/config');
    if (!res.ok) throw new Error();
    encuentroConfig = await res.json();
    if (encAliasValor) encAliasValor.textContent = encuentroConfig.alias || '—';
    if (encAliasLeyenda) encAliasLeyenda.textContent = encuentroConfig.leyenda || '';
    if (encTransferenciaTitulo) encTransferenciaTitulo.textContent = encuentroConfig.titulo || 'Datos para la transferencia';
    if (encTransferenciaDesc) encTransferenciaDesc.textContent = encuentroConfig.descripcion || '';
    // opciones pago como radios estilo Google Forms
    if (encOpcionesPagoLista) {
      encOpcionesPagoLista.innerHTML = '';
      const opts = Array.isArray(encuentroConfig.opcionesPago) ? encuentroConfig.opcionesPago : [];
      opts.forEach((opt, i) => {
        const label = document.createElement('label');
        label.className = 'gforms-radio';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'encOpcionPagoRadio';
        radio.value = opt;
        radio.required = true;
        radio.addEventListener('change', () => { encOpcionPago.value = radio.value; });
        const span = document.createElement('span');
        span.textContent = opt;
        label.append(radio, span);
        encOpcionesPagoLista.appendChild(label);
      });
      // opción "Otro" ya incluida si viene en env; si no, agregar
      if (!opts.some(o => /otro/i.test(o))) {
        const label = document.createElement('label');
        label.className = 'gforms-radio';
        const radio = document.createElement('input');
        radio.type = 'radio'; radio.name = 'encOpcionPagoRadio'; radio.value = 'Otro';
        radio.addEventListener('change', () => { encOpcionPago.value = radio.value; });
        const span = document.createElement('span'); span.textContent = 'Otro';
        label.append(radio, span);
        encOpcionesPagoLista.appendChild(label);
      }
    }
  } catch (_) {
    if (encOpcionesPagoLista && !encOpcionesPagoLista.querySelector('input')) {
      encOpcionesPagoLista.innerHTML = '<p class="ayuda-campo">No se pudieron cargar las opciones de pago.</p>';
    }
  }
  return encuentroConfig;
}
cargarEncuentroConfig();

if (btnCopiarAlias) btnCopiarAlias.addEventListener('click', async () => {
  const alias = encAliasValor ? encAliasValor.textContent.trim() : '';
  if (!alias || alias === '—') return;
  try { await navigator.clipboard.writeText(alias); btnCopiarAlias.textContent = '¡Copiado!'; setTimeout(() => btnCopiarAlias.textContent = 'Copiar', 1500); } catch (_) { /* noop */ }
});
if (encComprobante) encComprobante.addEventListener('change', () => {
  const f = encComprobante.files && encComprobante.files[0];
  if (!f) { encComprobanteInfo.textContent = ''; return; }
  if (f.size > 8*1024*1024) { encComprobanteInfo.textContent = 'Archivo demasiado grande (máx 8 MB).'; encComprobante.value = ''; return; }
  encComprobanteInfo.textContent = `${f.name} — ${(f.size/1024).toFixed(0)} KB`;
});

function mostrarEncuentroMensaje(texto, tipo) {
  if (!texto) { encuentroMensaje.style.display = 'none'; encuentroMensaje.textContent = ''; encuentroMensaje.className = 'mensaje'; return; }
  encuentroMensaje.textContent = texto;
  encuentroMensaje.className = `mensaje visible ${tipo || ''}`;
  encuentroMensaje.style.display = 'block';
}

async function abrirModalEncuentro(dni) {
  encDni.value = dni;
  encuentroDniInfo.textContent = `DNI: ${dni}`;
  mostrarEncuentroMensaje('', '');
  botonEnviarEncuentro.disabled = false;
  botonEnviarEncuentro.textContent = 'Enviar inscripción';
  await cargarEncuentroConfig();
  abrirModal(modalEncuentro);
  setTimeout(() => encApellido.focus(), 120);
}

botonCancelarEncuentro.addEventListener('click', () => {
  modalEncuentro.hidden = true;
  modalEncuentro.setAttribute('aria-hidden', 'true');
  mostrarMensaje('Inscripción al encuentro cancelada. Podés intentar con otro DNI.', 'error');
});

botonEnviarEncuentro.addEventListener('click', async () => {
  const dni = encDni.value.trim();
  const nombre = encNombre.value.trim();
  const apellido = encApellido.value.trim();
  const email = encEmail.value.trim();
  const telefono = encTelefono.value.trim();
  const telefonoLimpio = telefono.replace(/\D/g,'');
  const ocupacion = encOcupacion.value.trim();
  const opcionPago = encOpcionPago.value.trim();
  if (apellido.length < 2) { mostrarEncuentroMensaje('Ingresá un apellido válido.', 'error'); encApellido.focus(); return; }
  if (nombre.length < 2) { mostrarEncuentroMensaje('Ingresá un nombre válido.', 'error'); encNombre.focus(); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { mostrarEncuentroMensaje('Ingresá un correo electrónico válido.', 'error'); encEmail.focus(); return; }
  if (!telefonoLimpio || telefonoLimpio.length < 8) { mostrarEncuentroMensaje('Ingresá un teléfono/celular válido (obligatorio).', 'error'); encTelefono.focus(); return; }
  if (!ocupacion || !['Docente','Estudiante'].includes(ocupacion)) { mostrarEncuentroMensaje('Seleccioná una ocupación (Docente o Estudiante).', 'error'); encOcupacion.focus(); return; }
  if (!opcionPago) { mostrarEncuentroMensaje('Seleccioná una opción de pago.', 'error'); encOpcionesPagoLista.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  mostrarEncuentroMensaje('', '');
  botonEnviarEncuentro.disabled = true;
  botonEnviarEncuentro.textContent = 'Enviando…';
  try {
    const fd = new FormData();
    fd.append('dni', dni);
    fd.append('nombre', nombre);
    fd.append('apellido', apellido);
    fd.append('email', email);
    fd.append('telefono', telefono);
    fd.append('fecha_nacimiento', encFechaNacimiento.value.trim());
    fd.append('provincia', encProvincia.value.trim());
    fd.append('ciudad', encCiudad.value.trim());
    fd.append('ocupacion', encOcupacion.value.trim());
    fd.append('opcion_pago', opcionPago);
    if (encComprobante.files && encComprobante.files[0]) fd.append('comprobante', encComprobante.files[0]);
    const res = await fetch('/api/encuentro', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      mostrarEncuentroMensaje(data.error || 'No se pudo inscribir al encuentro.', 'error');
      botonEnviarEncuentro.disabled = false;
      botonEnviarEncuentro.textContent = 'Enviar inscripción';
      return;
    }
    modalEncuentro.hidden = true;
    modalEncuentro.setAttribute('aria-hidden', 'true');
    formEncuentro.reset();
    if (encOpcionesPagoLista) encOpcionesPagoLista.querySelectorAll('input[type=radio]').forEach(r => r.checked = false);
    encOpcionPago.value = '';
    if (encComprobanteInfo) encComprobanteInfo.textContent = '';
    mostrarMensaje('¡Inscripción al encuentro registrada! Ahora completá tus datos para los talleres.', 'ok');
    const datos = data.persona || { dni, nombre, apellido, email, telefono };
    mostrarDatosParticipante(datos);
    mostrarPasoDatos();
  } catch (e) {
    mostrarEncuentroMensaje('No se pudo conectar con el servidor. Intentá de nuevo.', 'error');
    botonEnviarEncuentro.disabled = false;
    botonEnviarEncuentro.textContent = 'Enviar inscripción';
  }
});

formEncuentro.addEventListener('submit', (e) => { e.preventDefault(); botonEnviarEncuentro.click(); });

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
    const idCambiado = Number(cbCambiado.dataset.tallerId);
    const tCambiado = talleresData.find(x => x.id === idCambiado);
    if (tCambiado && tCambiado.inscriptos >= tCambiado.cupo) {
      cbCambiado.checked = false;
      alert('No hay más cupos disponibles');
      return;
    }
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
    if (t.inscriptos >= t.cupo) {
      cb.disabled = true;
      cb.title = 'No hay más cupos disponibles';
      cb.closest('tr')?.setAttribute('title', 'No hay más cupos disponibles');
      cb.addEventListener('click', (e) => {
        e.preventDefault();
        alert('No hay más cupos disponibles');
      });
    }
  });
  container.querySelectorAll('tr.fila-llena').forEach(tr => {
    if (!tr.querySelector('.taller-checkbox:disabled')) return;
    tr.addEventListener('click', (e) => {
      const cb = tr.querySelector('.taller-checkbox');
      if (cb && cb.disabled && e.target !== cb) {
        alert('No hay más cupos disponibles');
      }
    });
    tr.style.cursor = 'not-allowed';
  });
}



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
      abrirModalEncuentro(dni);
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
      const msg = data.error || 'Ocurrió un error al registrarte.';
      mostrarMensaje(msg, 'error');
      if (String(msg).toLowerCase().includes('cupo') || String(msg).toLowerCase().includes('no hay más cupos')) {
        alert('No hay más cupos disponibles');
      }
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
