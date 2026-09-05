/* ── Programa Interactivo — Renderizado + CRUD ─────────────────────── */

const ProgramaUI = (() => {
  let container = null;
  let mode = 'public';
  let bloques = [];
  let talleres = [];
  let ponentes = [];
  let capacidad = 0;
  let asistentes = 0;
  let dias = [];
  let diaActivo = 0;
  let onEdit = null;
  let onDelete = null;
  let onAdd = null;
  let renderType = 'accordion';

  function turnoDesdeHora(hora) {
    const m = String(hora || '').match(/(\d{1,2}):(\d{2})/);
    if (!m) return 'manana';
    const h = Number(m[1]);
    if (h >= 20) return 'noche';
    if (h >= 13) return 'tarde';
    return 'manana';
  }

  const CHEVRON_SVG = '<svg class="programa-chevron" viewBox="0 0 24 24"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';

  function formatoFechaCorto(fechaStr) {
    const partes = String(fechaStr).split('-');
    if (partes.length < 3) return fechaStr;
    const d = partes[2].padStart(2, '0');
    const m = partes[1].padStart(2, '0');
    const a = partes[0].slice(-2);
    return `${d}/${m}/${a}`;
  }

  function formatoDiaLabel(fechaStr, idx) {
    return `Día ${idx + 1} — ${formatoFechaCorto(fechaStr)}`;
  }

  function toggleAccordion(header) {
    header.closest('.programa-accordion').classList.toggle('open');
  }

  function toggleAll(panel) {
    const items = panel.querySelectorAll('.programa-accordion');
    const anyClosed = Array.from(items).some(i => !i.classList.contains('open'));
    items.forEach(i => {
      if (anyClosed) i.classList.add('open');
      else i.classList.remove('open');
    });
  }

  function switchDay(idx) {
    diaActivo = idx;
    container.querySelectorAll('.programa-tab-btn').forEach((btn, i) => {
      btn.classList.toggle('active', i === idx);
    });
    container.querySelectorAll('.programa-day-panel').forEach((panel, i) => {
      panel.classList.toggle('active', i === idx);
    });
  }

  function toggleDark() {
    document.body.classList.toggle('dark');
    const label = container.querySelector('.dark-label');
    if (label) label.textContent = document.body.classList.contains('dark') ? '☀️ Claro' : '🌙 Oscuro';
  }

  function renderCapacidad() {
    if (mode !== 'admin') return '';
    const disponibles = capacidad - asistentes;
    const pct = capacidad > 0 ? Math.round((asistentes / capacidad) * 100) : 0;
    const cls = pct >= 90 ? 'cap-danger' : pct >= 70 ? 'cap-warn' : 'cap-ok';
    return `
      <div class="programa-capacity-bar">
        <div class="cap-item"><span class="cap-label">Capacidad locación:</span> <span class="cap-value">${capacidad}</span></div>
        <div class="cap-item"><span class="cap-label">Asistentes inscriptos:</span> <span class="cap-value ${cls}">${asistentes}</span></div>
        <div class="cap-item"><span class="cap-label">Disponibles:</span> <span class="cap-value">${disponibles}</span></div>
      </div>`;
  }

  function fotoDisertante(disertante) {
    if (!disertante || !ponentes.length) return null;
    const d = disertante.toLowerCase();
    const dWords = d.split(/[\s,–\-\/]+/).filter(w => w.length > 2);
    let best = null;
    let bestScore = 0;
    for (const p of ponentes) {
      const n = (p.nombre || '').toLowerCase();
      if (n === d || n.includes(d) || d.includes(n)) {
        if (p.foto) return p.foto;
        best = p;
      }
      if (bestScore < 2 && dWords.length > 0) {
        const nWords = n.split(/[\s,–\-\/]+/).filter(w => w.length > 2);
        const matches = dWords.filter(w => nWords.some(nw => nw.includes(w) || w.includes(nw)));
        if (matches.length > bestScore && p.foto) {
          bestScore = matches.length;
          best = p;
        }
      }
    }
    return best && best.foto ? best.foto : null;
  }

  function renderWorkshops(bloque) {
    const fecha = bloque.dia;
    const turnoBloque = turnoDesdeHora(bloque.hora_inicio);
    const ws = talleres.filter(t => t.fecha === fecha && turnoDesdeHora(t.hora) === turnoBloque);
    if (ws.length === 0) return '<p style="color:var(--pg-text-muted);font-size:0.85rem;">No hay talleres configurados para este bloque.</p>';
    let html = '<div class="programa-workshop-grid">';
    ws.forEach((t, i) => {
      const inscriptos = Number(t.inscriptos) || 0;
      const cupo = Number(t.cupo) || 20;
      const lleno = inscriptos >= cupo;
      const duracionHs = Number(t.duracion_hs) || 3;
      const duracionEtiqueta = duracionHs === 6 ? '6hs · 2 días' : '3hs · 1 día';
      const botonInscribirse = mode === 'seleccion' && !lleno
        ? `<button type="button" class="ws-inscribir-btn" data-taller-id="${t.id}" onclick="ProgramaUI.seleccionarTaller(${t.id})">Inscribirme</button>`
        : '';
      const foto = fotoDisertante(t.disertante);
      const fotoHtml = foto ? `<img class="ws-foto" src="${escapeHtml(foto)}" alt="${escapeHtml(t.disertante || '')}">` : '';
      html += `
        <div class="programa-workshop-card${lleno ? ' ws-lleno' : ''}" data-taller-id="${t.id}">
          ${fotoHtml}
          <div class="ws-header">
            <span class="ws-duracion">${duracionEtiqueta}</span>
            ${t.pareja_id ? '<span class="ws-dias">2 días</span>' : ''}
          </div>
          <div class="ws-title">${escapeHtml(t.nombre)}</div>
          ${t.disertante ? `<div class="ws-speaker">${escapeHtml(t.disertante)}</div>` : ''}
          ${t.descripcion ? `<div class="ws-descripcion">${escapeHtml(t.descripcion)}</div>` : ''}
          <div class="ws-footer">
            <div class="ws-cupo${lleno ? ' lleno' : ''}">${lleno ? 'Lleno' : `${cupo - inscriptos} cupos`}</div>
            ${botonInscribirse}
          </div>
        </div>`;
    });
    html += '</div>';
    return html;
  }

  function ponentesDeBloque(bloque, tipo) {
    const fecha = bloque.dia;
    return ponentes.filter((p) => p.tipo === tipo && p.fecha_dia === fecha);
  }

  function renderPonencias(bloque) {
    const lista = ponentesDeBloque(bloque, 'ponencia');
    if (lista.length === 0) return '<p style="color:var(--pg-text-muted);font-size:0.85rem;">Sin ponentes confirmados.</p>';
    let html = '';
    lista.forEach((p, i) => {
      if (i > 0) html += '<hr class="programa-ponencia-divider">';
      const foto = p.foto ? `<img class="programa-ponente-foto" src="${escapeHtml(p.foto)}" alt="">` : '';
      html += `<div class="programa-ponencia-item">
        <div class="programa-ponencia-linea">
          ${foto}
          <div>
            ${p.horario ? `<span class="programa-ponencia-hora">${escapeHtml(p.horario)}</span>` : ''}
            <strong>${escapeHtml(p.titulo || p.nombre || '')}</strong><br>
            <em>${escapeHtml(p.nombre || '')}</em>
          </div>
        </div>
      </div>`;
    });
    return html;
  }

  function renderConversatorio(bloque) {
    const lista = ponentesDeBloque(bloque, 'conversatorio');
    let html = '';
    if (lista.length > 0) {
      lista.forEach((p, i) => {
        if (i > 0) html += '<hr class="programa-ponencia-divider">';
        const foto = p.foto ? `<img class="programa-ponente-foto" src="${escapeHtml(p.foto)}" alt="">` : '';
        html += `<div class="programa-ponencia-item">
          <div class="programa-ponencia-linea">
            ${foto}
            <div>
              ${p.horario ? `<span class="programa-ponencia-hora">${escapeHtml(p.horario)}</span>` : ''}
              <strong>${escapeHtml(p.nombre || '')}</strong><br>
              ${p.titulo ? `<em>${escapeHtml(p.titulo)}</em>` : ''}
            </div>
          </div>
        </div>`;
      });
    }
    if (bloque.descripcion) html += (html ? '<br>' : '') + `<p>${escapeHtml(bloque.descripcion)}</p>`;
    return html || '<p style="color:var(--pg-text-muted);font-size:0.85rem;">Sin invitados confirmados.</p>';
  }

  function renderContenido(bloque) {
    switch (bloque.tipo) {
      case 'talleres': return renderWorkshops(bloque);
      case 'ponencia': return renderPonencias(bloque);
      case 'conversatorio': return renderConversatorio(bloque);
      default: return bloque.descripcion ? `<p>${escapeHtml(bloque.descripcion)}</p>` : '';
    }
  }

  function renderSubtitulo(bloque) {
    if (bloque.tipo === 'ponencia') {
      const lista = ponentesDeBloque(bloque, 'ponencia');
      return lista.map(p => p.nombre).filter(Boolean).join(' • ');
    }
    if (bloque.tipo === 'conversatorio') {
      const lista = ponentesDeBloque(bloque, 'conversatorio');
      return lista.map(p => p.nombre).filter(Boolean).join(' • ');
    }
    if (bloque.tipo === 'talleres') {
      const fecha = bloque.dia;
      const turnoBloque = turnoDesdeHora(bloque.hora_inicio);
      const ws = talleres.filter(t => t.fecha === fecha && turnoDesdeHora(t.hora) === turnoBloque);
      return ws.length ? `${ws.length} talleres en paralelo` : '';
    }
    return '';
  }

  function renderAdminActions(bloque) {
    if (mode !== 'admin') return '';
    return `
      <div class="programa-admin-actions">
        <button class="btn-mini btn-edit" data-action="edit" data-id="${bloque.id}" title="Editar">Editar</button>
        <button class="btn-mini btn-delete" data-action="delete" data-id="${bloque.id}" title="Eliminar">Eliminar</button>
      </div>`;
  }

  function renderBloque(bloque) {
    const subtitulo = renderSubtitulo(bloque);
    const contenido = renderContenido(bloque);
    return `
      <div class="programa-accordion programa-type-${escapeHtml(bloque.tipo)}" data-bloque-id="${bloque.id}">
        <div class="programa-accordion-header" onclick="ProgramaUI.toggleAccordion(this)">
          <div class="programa-accordion-header-left">
            <span class="programa-time-badge">${bloque.icono || ''} ${escapeHtml(bloque.hora_inicio)} a ${escapeHtml(bloque.hora_fin)}</span>
            <div class="programa-item-title">${escapeHtml(bloque.titulo)}</div>
            ${subtitulo ? `<div class="programa-item-speaker">${escapeHtml(subtitulo)}</div>` : ''}
          </div>
          ${renderAdminActions(bloque)}
          ${CHEVRON_SVG}
        </div>
        <div class="programa-accordion-content">${contenido}</div>
      </div>`;
  }

  function renderPanel(dia, idx) {
    const bloquesDelDia = bloques.filter(b => b.dia === dia);
    let html = `
      <div class="programa-controls-bar">
        <span class="programa-section-title">${formatoDiaLabel(dia, idx)}</span>
        <button class="programa-action-btn" onclick="ProgramaUI.toggleAll(${idx})">Expandir / Colapsar</button>
      </div>`;
    if (bloquesDelDia.length === 0) {
      html += '<p style="color:var(--pg-text-muted);padding:20px 0;">No hay actividades programadas para este día.</p>';
    } else {
      html += bloquesDelDia.map(b => renderBloque(b)).join('');
    }
    return html;
  }

  function sumarHoras(hora, horas) {
    if (!hora) return '';
    const partes = String(hora).split(':');
    const h = Number(partes[0]) + Math.floor(horas);
    const m = Number(partes[1] || 0) + Math.round((horas % 1) * 60);
    const totalMin = h * 60 + m;
    const hh = String(Math.floor(totalMin / 60) % 24).padStart(2, '0');
    const mm = String(totalMin % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  function horariosTaller(t) {
    const duracion = Number(t.duracion_hs) || 3;
    const diaIdx = dias.indexOf(t.fecha);
    const diaLabel = diaIdx >= 0 ? `Día ${diaIdx + 1}` : t.fecha || '';
    const fin = sumarHoras(t.hora, duracion);
    return `${diaLabel} · ${t.hora || ''}–${fin}`;
  }

  function renderWorkshopTable() {
    const parejas = new Set();
    talleres.forEach(t => { if (t.pareja_id) parejas.add(t.pareja_id); });

    const sueltos = [...talleres].filter(t => !parejas.has(t.id) && !t.pareja_id);
    const groups = [];
    talleres.filter(t => parejas.has(t.id)).forEach(main => {
      const parts = talleres.filter(t => t.pareja_id === main.id);
      groups.push({ main, parts });
    });

    const items = [
      ...sueltos.map(t => ({ main: t, parts: [] })),
      ...groups,
    ];

    items.sort((a, b) => {
      const fa = a.main.fecha || '';
      const fb = b.main.fecha || '';
      if (fa !== fb) return fa < fb ? -1 : 1;
      const ha = a.main.hora || '';
      const hb = b.main.hora || '';
      if (ha !== hb) return ha < hb ? -1 : ha > hb ? 1 : 0;
      return 0;
    });

    if (!items.length) {
      return '<p style="color:var(--pg-text-muted);padding:20px 0;">No hay talleres disponibles.</p>';
    }

    const isSeleccion = mode === 'seleccion';

    const porDia = {};
    items.forEach(item => {
      const fecha = item.main.fecha || 'sin-fecha';
      if (!porDia[fecha]) porDia[fecha] = [];
      porDia[fecha].push(item);
    });

    const fechasOrdenadas = Object.keys(porDia).sort();
    let html = '';

    fechasOrdenadas.forEach((fecha, idx) => {
      const itemsDia = porDia[fecha];
      const diaIdx = dias.indexOf(fecha);
      const diaLabel = diaIdx >= 0 ? formatoDiaLabel(fecha, diaIdx) : formatoFechaCorto(fecha);

      let rows = '';
      itemsDia.forEach(item => {
        const t = item.main;
        const allParts = [t, ...item.parts];
        const inscriptos = allParts.reduce((s, p) => s + (Number(p.inscriptos) || 0), 0);
        const cupo = Math.min(...allParts.map(p => Number(p.cupo) || 20));
        const lleno = inscriptos >= cupo;
        const duracionTotal = allParts.reduce((s, p) => s + (Number(p.duracion_hs) || 3), 0);
        const horarios = allParts.map(p => horariosTaller(p)).join('<br>');
        const tallId = t.pareja_id || t.id;
        const checkbox = isSeleccion
          ? `<input type="checkbox" class="taller-checkbox" data-taller-id="${tallId}"${lleno ? ' disabled' : ''}>`
          : '';
        const disertante = t.disertante ? `<div class="taller-disertante">${escapeHtml(t.disertante)}</div>` : '';
        const disponibles = Math.max(0, cupo - inscriptos);
        const cupoHtml = lleno
          ? '<span class="cupo-lleno">Lleno</span>'
          : `${disponibles} de ${cupo}`;
        rows += `<tr data-taller-id="${tallId}" class="${lleno ? 'fila-llena' : ''}">
          <td class="taller-check">${checkbox}</td>
          <td class="taller-nombre">${escapeHtml(t.nombre)}${disertante}${item.parts.length ? ' <span class="taller-partes-badge">' + (item.parts.length + 1) + ' partes</span>' : ''}</td>
          <td class="taller-duracion">${duracionTotal} h</td>
          <td class="taller-horarios">${horarios}</td>
          <td class="taller-cupos">${cupoHtml}</td>
        </tr>`;
      });

      const abierto = fechasOrdenadas.length === 1 ? ' open' : '';
      html += `
        <div class="seleccion-dia-grupo${abierto}" data-fecha="${escapeHtml(fecha)}">
          <button type="button" class="seleccion-dia-header" onclick="ProgramaUI.toggleDiaGrupo(this)">
            <span class="seleccion-dia-label">${escapeHtml(diaLabel)}</span>
            <span class="seleccion-dia-count">${itemsDia.length} taller${itemsDia.length !== 1 ? 'es' : ''}</span>
            ${CHEVRON_SVG}
          </button>
          <div class="seleccion-dia-contenido">
            <div class="tabla-talleres-wrap"><table class="tabla-talleres">
              <thead><tr>
                <th class="th-check">${isSeleccion ? 'Seleccionar' : ''}</th>
                <th>Taller</th><th>Duración</th><th>Horarios</th><th>Cupos</th>
              </tr></thead>
              <tbody>${rows}</tbody>
            </table></div>
          </div>
        </div>`;
    });

    return html;
  }

  function render() {
    if (!container) return;
    let html = '';

    if (renderType === 'tabla') {
      html += '<div class="programa-main">';
      html += renderWorkshopTable();
      html += '</div>';
      container.innerHTML = html;
      if (mode === 'seleccion') {
        container.querySelectorAll('.taller-checkbox').forEach(cb => {
          cb.addEventListener('change', () => {
            if (typeof window.__cambioSeleccionTaller === 'function') {
              window.__cambioSeleccionTaller(cb);
            }
          });
        });
      }
      return;
    }

    if (mode === 'admin') {
      html += `
        <div class="programa-controls">
          <div class="programa-controls-left">
            <button class="programa-action-btn" id="btnAgregarBloquePrograma">+ Agregar bloque</button>
          </div>
          <div class="programa-controls-right"></div>
        </div>`;
    } else {
      html += `
        <div class="programa-controls">
          <div class="programa-controls-left"></div>
          <div class="programa-controls-right"></div>
        </div>`;
    }

    html += renderCapacidad();

    html += '<div class="programa-tabs-sticky"><div class="programa-tabs">';
    dias.forEach((dia, idx) => {
      html += `<button class="programa-tab-btn${idx === diaActivo ? ' active' : ''}" data-day-idx="${idx}" onclick="ProgramaUI.switchDay(${idx})">${formatoDiaLabel(dia, idx)}</button>`;
    });
    html += '</div></div>';

    html += '<div class="programa-main">';
    dias.forEach((dia, idx) => {
      html += `<div class="programa-day-panel${idx === diaActivo ? ' active' : ''}" data-day-idx="${idx}">${renderPanel(dia, idx)}</div>`;
    });
    html += '</div>';

    container.innerHTML = html;

    if (mode === 'admin') {
      const btnAdd = container.querySelector('#btnAgregarBloquePrograma');
      if (btnAdd && onAdd) btnAdd.addEventListener('click', onAdd);
      container.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          if (onEdit) onEdit(id);
        });
      });
      container.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = Number(btn.dataset.id);
          if (onDelete) onDelete(id);
        });
      });
    }
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  async function cargarAdmin() {
    try {
      const res = await fetch('/api/admin/programa');
      if (!res.ok) return false;
      const data = await res.json();
      bloques = data.bloques || [];
      capacidad = Number(data.capacidad) || 0;
      asistentes = Number(data.asistentes) || 0;
      const diasSet = [...new Set(bloques.map(b => b.dia))].sort();
      dias = diasSet;
      return true;
    } catch (e) {
      return false;
    }
  }

  async function cargarPublico() {
    try {
      const [progRes, diasRes, tRes, pRes] = await Promise.all([
        fetch('/api/programa'),
        fetch('/api/programa/dias'),
        fetch('/api/talleres'),
        fetch('/api/ponentes'),
      ]);
      if (!progRes.ok) return false;
      bloques = await progRes.json();
      dias = await diasRes.json();
      talleres = tRes.ok ? await tRes.json() : [];
      ponentes = pRes.ok ? await pRes.json() : [];
      return true;
    } catch (e) {
      return false;
    }
  }

  async function cargarTalleres() {
    try {
      const res = await fetch('/api/admin/talleres');
      if (res.ok) talleres = await res.json();
    } catch (e) { /* noop */ }
  }

  return {
    init(opts) {
      container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
      mode = opts.mode || 'public';
      renderType = opts.renderType || 'accordion';
      onEdit = opts.onEdit || null;
      onDelete = opts.onDelete || null;
      onAdd = opts.onAdd || null;
    },

    async cargar() {
      if (mode === 'admin') {
        const ok = await cargarAdmin();
        if (ok) await cargarTalleres();
        return ok;
      }
      return cargarPublico();
    },

    render,

    seleccionarTaller(id) {
      if (typeof window.__seleccionarTaller === 'function') {
        window.__seleccionarTaller(id);
      }
    },

    toggleDiaGrupo(header) {
      header.closest('.seleccion-dia-grupo').classList.toggle('open');
    },

    switchDay,

    toggleAccordion,

    toggleAll(idx) {
      const panel = container.querySelector(`.programa-day-panel[data-day-idx="${idx}"]`);
      if (panel) toggleAll(panel);
    },

    toggleDark,

    getBloques() { return bloques; },
    getDias() { return dias; },
    getCapacidad() { return capacidad; },
    getAsistentes() { return asistentes; },

    async eliminarBloque(id) {
      const res = await fetch(`/api/admin/programa/bloques/${id}`, { method: 'DELETE' });
      return res.ok;
    },
  };
})();
