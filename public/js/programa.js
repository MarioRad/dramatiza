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
  let disertantesContainer = null;

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
    const a = partes[0].length === 2 ? `20${partes[0]}` : partes[0];
    return `${d}/${m}/${a}`;
  }

  function formatoDiaLabel(fechaStr, idx) {
    return `Día ${idx + 1} — ${formatoFechaCorto(fechaStr)}`;
  }

  /* ── Disertantes/Talleristas + PDF/imprimir (estilo cronograma) ─── */

  // Fallback Vercel: si la URL de Supabase falla (404), reintenta con /uploads/<basename> (bundle git)
  function fotoOnError(img) {
    if (img.dataset.fallback) { img.style.display = 'none'; console.warn('[Programa] Imagen no cargó (fallback falló):', img.src); return; }
    img.dataset.fallback = '1';
    try {
      const u = new URL(img.src, window.location.origin);
      const base = decodeURIComponent(u.pathname.split('/').pop() || '');
      if (base && !img.src.includes('/uploads/')) {
        console.warn('[Programa] Imagen Supabase falló, reintentando local /uploads/:', base);
        img.src = '/uploads/' + base;
        return;
      }
    } catch (_) {
      try { const base = decodeURIComponent(img.src.split('/').pop().split('?')[0] || ''); if (base) { img.src = '/uploads/' + base; return; } } catch (_) {}
    }
    img.style.display = 'none';
    console.warn('[Programa] Imagen no cargó:', img.src);
  }
  // Exponer para onerror inline (content seguro via escapeHtml)
  window.__fotoOnError = fotoOnError;

  const TIPOS_LABEL = { ponencia: 'Ponencia', taller: 'Taller', conversatorio: 'Conversatorio' };

  function rolPonente(p) {
    return TIPOS_LABEL[p.tipo] || p.tipo || '';
  }

  function getInitials(nombre) {
    return String(nombre || '')
      .split(/[\s–-]+/)
      .filter((w) => w.length > 0)
      .map((w) => w[0].toUpperCase())
      .slice(0, 2)
      .join('');
  }

  function horaMin(h) {
    if (!h) return null;
    const m = String(h).match(/(\d{1,2}):(\d{2})/);
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }

  function apellido(nombre) {
    const parts = String(nombre || '').split(/[\s–-]+/).filter((w) => w.length > 0);
    return parts[parts.length - 1] || nombre || '';
  }

  function sortDisertantes(lista) {
    return [...lista].sort((a, b) => {
      if ((a.dia || 1) !== (b.dia || 1)) return (a.dia || 1) - (b.dia || 1);
      const ha = horaMin(a.horario);
      const hb = horaMin(b.horario);
      if (ha !== hb) return (ha ?? Infinity) - (hb ?? Infinity);
      const ap = apellido(a.nombre).localeCompare(apellido(b.nombre), 'es');
      if (ap !== 0) return ap;
      return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es') || ((a.id || 0) - (b.id || 0));
    });
  }

  function expandirDias(lista) {
    const rows = [];
    lista.forEach((p) => {
      if (!p.dia) return;
      const base = { ...p };
      rows.push({ ...base });
      if (p.dia2) {
        rows.push({ ...base, dia: p.dia2, horario: p.horario2 || '', dia2: null, horario2: '' });
      }
    });
    return sortDisertantes(rows);
  }

  function fechaDeDia(dia) {
    const p = ponentes.find((x) => Number(x.dia) === Number(dia) && x.fecha_dia);
    return p ? String(p.fecha_dia) : '';
  }

  function fechaCortaDDMM(fechaISO) {
    const m = String(fechaISO || '').match(/(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return '';
    return `${Number(m[3])}/${Number(m[2])}`;
  }

  function lineaHoraDia(p, dia, hora) {
    const f = fechaCortaDDMM(fechaDeDia(dia));
    return `Día ${dia}${f ? ' - ' + f : ''} - ${hora} hs`;
  }

  function setHorarioLines(el, p) {
    const h1 = String(p.horario || '').trim();
    if (!p.dia2) {
      el.textContent = '\u{1F550} ' + h1 + ' hs';
      return;
    }
    const lines = ['\u{1F550} ' + lineaHoraDia(p, p.dia, h1), lineaHoraDia(p, p.dia2, String(p.horario2 || '').trim())];
    el.textContent = '';
    lines.forEach((text) => {
      const div = document.createElement('div');
      div.textContent = text;
      el.appendChild(div);
    });
  }

  function coPonentesDe(p) {
    // Para taller: buscar taller que contiene a p y devolver otros ponentes del mismo taller
    if (p.tipo === 'taller') {
      const t = talleres.find(x => Array.isArray(x.ponentes) && x.ponentes.some(y=> Number(y.id)===Number(p.id)));
      if (t && t.ponentes.length > 1) {
        return t.ponentes.filter(y=> Number(y.id) !== Number(p.id));
      }
      // fallback por disertante string
      if (t && t.disertante && t.disertante.includes('—')) {
        const partes = t.disertante.split('—').map(s=> s.trim()).filter(Boolean);
        if (partes.length > 1) return partes.filter(n=> n !== p.nombre).map(n=> ({ nombre: n }));
      }
    }
    // Para ponencia/conversatorio: buscar bloque que contiene a p y devolver otros con mismo título (co-presentación)
    if (p.tipo === 'ponencia' || p.tipo === 'conversatorio') {
      const b = bloques.find(x => Array.isArray(x.ponentes) && x.ponentes.some(y=> Number(y.id)===Number(p.id)));
      if (b && b.ponentes.length > 1) {
        // Si hay varios ponentes en el mismo bloque con mismo título que p, son co-ponentes de la misma ponencia
        const mismoTitulo = b.ponentes.filter(y=> Number(y.id) !== Number(p.id) && String(y.titulo||'').trim() === String(p.titulo||'').trim() && String(p.titulo||'').trim() !== '');
        if (mismoTitulo.length) return mismoTitulo;
        // Si no hay mismo título, mostrar otros del bloque como referencia? no
      }
    }
    return [];
  }

  function tarjetaDisertanteHtml(p) {
    const tipos = ['taller', 'ponencia', 'conversatorio'];
    const cls = tipos.includes(p.tipo) ? p.tipo : 'general';
    const horario = String(p.horario || '').trim();
    const iniciales = `<span class="programa-sd-iniciales">${escapeHtml(getInitials(p.nombre))}</span>`;
    const foto = p.foto
      ? `<img class="programa-sd-foto" src="${escapeHtml(p.foto)}" alt="${escapeHtml(p.nombre || '')}" loading="lazy" onerror="window.__fotoOnError(this)">`
      : '';
    const sello = p.dia2
      ? '<span class="programa-sd-badge"><span class="n">2</span><span class="t">días</span></span>'
      : '';
    const desc = String(p.descripcion || '').trim();
    const co = coPonentesDe(p);
    const coHtml = co.length ? `<div class="programa-sd-con">Con: ${co.map(c=> escapeHtml(c.nombre)).join(' • ')}</div>` : '';
    const coFotos = co.filter(c=> c.foto).map(c=> `<img class="programa-sd-foto programa-sd-foto-co" src="${escapeHtml(c.foto)}" alt="${escapeHtml(c.nombre)}" loading="lazy" onerror="window.__fotoOnError(this)">`).join('');
    return `
      <div class="programa-sd-card type-${cls}">
        <div class="programa-sd-card-foto">${iniciales}${foto}${coFotos}${sello}</div>
        <div class="programa-sd-card-info">
          <div class="programa-sd-nombre">${escapeHtml(p.nombre || '')}</div>
          ${coHtml}
          <div class="programa-sd-rol">${escapeHtml(rolPonente(p))}</div>
          ${horario ? `<div class="programa-sd-horario">\u{1F550} ${escapeHtml(horario)} hs</div>` : ''}
          ${p.titulo ? `<div class="programa-sd-titulo">${escapeHtml(p.titulo)}</div>` : ''}
          ${desc ? `<div class="programa-sd-desc">${escapeHtml(desc.length > 140 ? desc.slice(0, 140) + '…' : desc)}</div>` : ''}
        </div>
      </div>`;
  }

  function renderDisertantesSeccion() {
    if (mode === 'admin') return '';
    const lista = expandirDias(ponentes);
    if (lista.length === 0) return '';
    let html = '<section class="programa-sd-seccion"><div class="programa-sd-seccion-titulo">Disertantes y Talleristas</div>';
    let currentDia = null;
    let abierta = false;
    lista.forEach((p) => {
      if (p.dia !== currentDia) {
        if (abierta) html += '</div></div>';
        currentDia = p.dia;
        abierta = true;
        const f = fechaCortaDDMM(fechaDeDia(currentDia));
        html += `<div class="programa-sd-dia">
          <div class="programa-sd-dia-titulo"><span class="programa-sd-chip">Día ${currentDia}</span>${f ? `<span class="programa-sd-dia-fecha">· ${f}</span>` : ''}</div>
          <div class="programa-sd-grid">`;
      }
      html += tarjetaDisertanteHtml(p);
    });
    if (abierta) html += '</div></div>';
    html += '</section>';
    return html;
  }

  function pdfHolderEl(tipo) {
    const fuentes = [container, disertantesContainer].filter(Boolean);
    for (const fuente of fuentes) {
      const holder = fuente.querySelector(`.programa-pdf-holder[data-pdf-tipo="${tipo}"]`);
      if (holder) return holder;
    }
    return null;
  }

  function otroPdfHolder(tipo) {
    return tipo === 'programa' ? pdfHolderEl('disertantes') : pdfHolderEl('programa');
  }

  function buildProgramaPdf() {
    const holder = pdfHolderEl('programa');
    const el = holder ? holder.querySelector('.programa-pdf-area') : null;
    if (!el) return;
    if (dias.length === 0 || bloques.length === 0) { el.innerHTML = ''; return; }

    const header = `
      <div class="programa-pdf-header">
        <img class="programa-pdf-logo" src="/logo.png" alt="Encuentro Nacional de Profesores de Teatro - Dramatiza Salta 2026">
        <div class="programa-pdf-header-center">
          <div class="programa-pdf-title">Programa del Encuentro</div>
          <div class="programa-pdf-subtitle">26º Encuentro Nacional de Profesores de Teatro - Dramatiza Salta 2026</div>
        </div>
        <img class="programa-pdf-mascot" src="/personaje.png" alt="Mascota">
      </div>`;

    const diasHtml = dias.map((dia, idx) => {
      const bloquesDia = bloques
        .filter((b) => b.dia === dia)
        .sort((a, b) => {
          const o = (Number(a.orden) || 0) - (Number(b.orden) || 0);
          return o !== 0 ? o : String(a.hora_inicio || '').localeCompare(String(b.hora_inicio || ''));
        });

      const filas = bloquesDia.length
        ? bloquesDia.map((b) => {
            const sub = renderSubtitulo(b);
            const titulo = `${b.icono ? b.icono + ' ' : ''}${b.titulo}`;
            return `
              <div class="programa-pdf-bloque">
                <span class="programa-pdf-bloque-hora">${escapeHtml(b.hora_inicio)}–${escapeHtml(b.hora_fin)}</span>
                <span class="programa-pdf-bloque-info">
                  <span class="programa-pdf-bloque-titulo">${escapeHtml(titulo)}</span>
                  ${sub ? `<span class="programa-pdf-bloque-sub">${escapeHtml(sub)}</span>` : ''}
                </span>
              </div>`;
          }).join('')
        : '<div class="programa-pdf-bloque-sin">Sin actividades programadas.</div>';

      return `
        <div class="programa-pdf-dia">
          <div class="programa-pdf-dia-titulo">${escapeHtml(formatoDiaLabel(dia, idx))}</div>
          ${filas}
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="programa-pdf-page programa-pdf-page-programa">
        ${header}
        <div class="programa-pdf-dias">${diasHtml}</div>
      </div>`;
  }

  function buildPdfArea() {
    buildProgramaPdf();
    const holder = pdfHolderEl('disertantes');
    const el = holder ? holder.querySelector('.programa-pdf-area') : null;
    if (!el) return;
    const lista = expandirDias(ponentes);
    if (lista.length === 0) { el.innerHTML = ''; return; }

    const header = `
      <div class="programa-pdf-header">
        <img class="programa-pdf-logo" src="/logo.png" alt="Encuentro Nacional de Profesores de Teatro - Dramatiza Salta 2026">
        <div class="programa-pdf-header-center">
          <div class="programa-pdf-title">Disertantes y Talleristas del Encuentro</div>
          <div class="programa-pdf-subtitle">26º Encuentro Nacional de Profesores de Teatro - Dramatiza Salta 2026</div>
        </div>
        <img class="programa-pdf-mascot" src="/personaje.png" alt="Mascota">
      </div>`;
    const leyenda = `
      <div class="programa-pdf-leyenda">
        <span class="leyenda-item"><span class="leyenda-color color-taller"></span>Taller</span>
        <span class="leyenda-item"><span class="leyenda-color color-ponencia"></span>Ponencia</span>
        <span class="leyenda-item"><span class="leyenda-color color-conversatorio"></span>Conversatorio</span>
      </div>`;

    const pages = [];
    let dayCards = [];
    let currentDia = null;

    const pushDay = () => {
      if (currentDia === null) return;
      const f = fechaCortaDDMM(fechaDeDia(currentDia));
      pages.push(`
        <div class="programa-pdf-page">
          ${header}
          <div class="programa-pdf-day-title"><span class="programa-pdf-day-chip">Día ${currentDia}</span>Presentación del día ${currentDia}${f ? ` · ${f}` : ''}</div>
          <div class="programa-pdf-cards">${dayCards.join('')}</div>
          ${leyenda}
        </div>`);
    };

    lista.forEach((p) => {
      if (p.dia !== currentDia) {
        pushDay();
        currentDia = p.dia;
        dayCards = [];
      }
      const horario = String(p.horario || '').trim();
      const fotoInner = p.foto
        ? `<img class="programa-pdf-foto" src="${escapeHtml(p.foto)}" alt="">`
        : `<div class="programa-pdf-no-foto">${escapeHtml(getInitials(p.nombre))}</div>`;
      const sello = p.dia2
        ? '<span class="programa-pdf-badge"><span class="n">2</span><span class="t">días</span></span>'
        : '';
      dayCards.push(`
        <div class="programa-pdf-card type-${escapeHtml(p.tipo || 'general')}">
          <div class="programa-pdf-foto-wrap">${fotoInner}${sello}</div>
          <div class="programa-pdf-card-info">
            <div class="programa-pdf-name"></div>
            <div class="programa-pdf-role"></div>
            <div class="programa-pdf-titulo"></div>
            ${horario ? '<div class="programa-pdf-horario"></div>' : ''}
          </div>
        </div>`);
    });
    pushDay();

    el.innerHTML = pages.join('');

    el.querySelectorAll('.programa-pdf-card').forEach((card, i) => {
      const p = lista[i];
      card.querySelector('.programa-pdf-name').textContent = p.nombre || '';
      card.querySelector('.programa-pdf-role').textContent = rolPonente(p);
      card.querySelector('.programa-pdf-titulo').textContent = p.titulo || '';
      const h = card.querySelector('.programa-pdf-horario');
      if (h) setHorarioLines(h, p);
    });
  }

  async function esperarImagenes(el) {
    const imgs = [...el.querySelectorAll('img')].filter((i) => !i.complete);
    await Promise.all(imgs.map((i) => new Promise((resolve) => {
      i.addEventListener('load', resolve, { once: true });
      i.addEventListener('error', resolve, { once: true });
    })));
  }

  async function descargarPDF(tipo) {
    tipo = tipo || 'disertantes';
    const holder = pdfHolderEl(tipo);
    const root = holder ? holder.querySelector('.programa-pdf-area') : null;
    const btns = [...document.querySelectorAll('.programa-btn-pdf')];
    if (!root || !root.querySelector('.programa-pdf-page') || !window.html2canvas || !window.jspdf) {
      alert('No se pudo generar el PDF (falta la librería o no hay días). Verificá la conexión a internet.');
      return;
    }

    await esperarImagenes(root);
    if (btns.length) btns.forEach(b => { b.disabled = true; });

    const estados = [];
    const garfios = [container, disertantesContainer].filter(Boolean);
    garfios.forEach(c => estados.push({ el: c, hidden: c.hidden }));

    if (tipo === 'programa' && container) container.hidden = false;
    if (tipo === 'disertantes' && disertantesContainer) disertantesContainer.hidden = false;
    const otro = otroPdfHolder(tipo);
    const otroPrev = otro ? otro.style.display : null;
    if (otro) otro.style.display = 'none';

    document.body.classList.add('pdf-export');
    window.scrollTo(0, 0);

    try {
      const pages = [...root.querySelectorAll('.programa-pdf-page')];
      const holderRect = root.getBoundingClientRect();
      const rects = pages.map((pageEl) => pageEl.getBoundingClientRect());

      const canvas = await window.html2canvas(root, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
        x: 0,
        y: 0,
        width: holderRect.width,
        height: holderRect.height,
        windowWidth: holderRect.width + 50,
        windowHeight: holderRect.height + 300,
      });

      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageW = 210;
      const pageH = 297;
      const S = 2;
      const top0 = holderRect.top;
      const left0 = holderRect.left;

      pages.forEach((pageEl, i) => {
        const r = rects[i];
        const px = Math.max(0, Math.round((r.left - left0) * S) - 4);
        const py = Math.max(0, Math.round((r.top - top0) * S) - 4);
        const pw = Math.min(canvas.width - px, Math.round(r.width * S) + 8);
        const ph = Math.min(canvas.height - py, Math.round(r.height * S) + 8);

        const seg = document.createElement('canvas');
        seg.width = pw;
        seg.height = ph;
        seg.getContext('2d').drawImage(canvas, px, py, pw, ph, 0, 0, pw, ph);

        const imgData = seg.toDataURL('image/jpeg', 0.95);
        if (i > 0) pdf.addPage();
        const ratio = Math.min(pageW / pw, pageH / ph);
        const imgW = pw * ratio;
        const imgH = ph * ratio;
        pdf.addImage(imgData, 'JPEG', (pageW - imgW) / 2, (pageH - imgH) / 2, imgW, imgH);
      });

      const nombre = tipo === 'programa' ? 'Dramatiza_Salta_2026_Programa.pdf' : 'Dramatiza_Salta_2026.pdf';
      pdf.save(nombre);
    } catch (err) {
      alert('Error al generar el PDF: ' + err.message);
    } finally {
      document.body.classList.remove('pdf-export');
      if (otro) otro.style.display = otroPrev;
      estados.forEach((e) => { e.el.hidden = e.hidden; });
      if (btns.length) btns.forEach(b => { b.disabled = false; });
    }
  }

  function imprimirPrograma(tipo) {
    tipo = tipo || 'disertantes';
    const garfios = [container, disertantesContainer].filter(Boolean);
    const estados = garfios.map((c) => ({ el: c, hidden: c.hidden }));
    if (tipo === 'programa' && container) container.hidden = false;
    if (tipo === 'disertantes' && disertantesContainer) disertantesContainer.hidden = false;
    const otro = otroPdfHolder(tipo);
    const otroPrev = otro ? otro.style.display : null;
    if (otro) otro.style.display = 'none';
    window.print();
    if (otro) otro.style.display = otroPrev;
    estados.forEach((e) => { e.el.hidden = e.hidden; });
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

  function fotoDisertante(disertante, tallerObj) {
    // Si el taller tiene ponentes múltiples, usar la foto del primer ponente que tenga foto
    if (tallerObj && Array.isArray(tallerObj.ponentes) && tallerObj.ponentes.length) {
      const conFoto = tallerObj.ponentes.find(p => p.foto);
      if (conFoto) return conFoto.foto;
    }
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
      const esDosDias = !!t.pareja_id || talleres.some(x => x.pareja_id === t.id);
      const botonInscribirse = mode === 'seleccion' && !lleno
        ? `<button type="button" class="ws-inscribir-btn" data-taller-id="${t.id}" onclick="ProgramaUI.seleccionarTaller(${t.id})">Inscribirme</button>`
        : '';
      const foto = fotoDisertante(t.disertante, t);
      const fotoHtml = foto ? `<img class="ws-foto" src="${escapeHtml(foto)}" alt="${escapeHtml(t.disertante || '')}" loading="lazy" onerror="window.__fotoOnError(this)">` : '';
      // Si el taller tiene múltiples ponentes, mostrar nombres separados
      let speakerHtml = '';
      if (Array.isArray(t.ponentes) && t.ponentes.length > 1) {
        speakerHtml = `<div class="ws-speaker">${escapeHtml(t.ponentes.map(p=> p.nombre).join(' • '))}</div>`;
        // fotos múltiples si hay más de una
        const fotosConFoto = t.ponentes.filter(p=> p.foto);
        if (fotosConFoto.length > 1) {
          const avatars = fotosConFoto.slice(0,3).map(p=> `<img class="ws-foto ws-foto-multi" src="${escapeHtml(p.foto)}" alt="${escapeHtml(p.nombre)}" loading="lazy" onerror="window.__fotoOnError(this)">`).join('');
          // reemplazar fotoHtml por mosaico si hay varias
          // ya tenemos foto principal, añadir resto como mini
        }
      } else {
        speakerHtml = t.disertante ? `<div class="ws-speaker">${escapeHtml(t.disertante)}</div>` : '';
      }
      html += `
        <div class="programa-workshop-card${lleno ? ' ws-lleno' : ''}" data-taller-id="${t.id}">
          ${fotoHtml}
          <div class="ws-header">
            <span class="ws-duracion">${duracionEtiqueta}</span>
            ${esDosDias ? '<span class="ws-dias">2 días</span>' : ''}
          </div>
          <div class="ws-title">${escapeHtml(t.nombre)}</div>
          ${speakerHtml}
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
    // Si el bloque tiene ponentes múltiples explícitos (bloque_ponentes), usarlos filtrando por tipo
    if (bloque && Array.isArray(bloque.ponentes) && bloque.ponentes.length) {
      const filtrados = bloque.ponentes.filter(p => !tipo || p.tipo === tipo);
      if (filtrados.length) return filtrados;
      // si no filtra por tipo, devolver todos los del bloque
      return bloque.ponentes;
    }
    // Fallback histórico: filtrar por fecha y tipo
    const fecha = bloque.dia;
    return ponentes.filter((p) => p.tipo === tipo && p.fecha_dia === fecha);
  }

  function agruparPorTitulo(lista) {
    const map = new Map();
    for (const p of lista) {
      const key = String(p.titulo || '').trim() ? String(p.titulo||'').trim().toLowerCase() : `__id_${p.id}`;
      if (!map.has(key)) map.set(key, { titulo: p.titulo || p.nombre || '', horario: p.horario || '', ponentes: [] });
      map.get(key).ponentes.push(p);
    }
    return [...map.values()];
  }

  function renderPonencias(bloque) {
    const lista = ponentesDeBloque(bloque, 'ponencia');
    if (lista.length === 0) return '<p style="color:var(--pg-text-muted);font-size:0.85rem;">Sin ponentes confirmados.</p>';
    const grupos = agruparPorTitulo(lista);
    let html = '';
    grupos.forEach((g, i) => {
      if (i > 0) html += '<hr class="programa-ponencia-divider">';
      const fotos = g.ponentes.map(p=> p.foto ? `<img class="programa-ponente-foto" src="${escapeHtml(p.foto)}" alt="" loading="lazy" onerror="window.__fotoOnError(this)">` : '').join('');
      const nombres = g.ponentes.map(p=> escapeHtml(p.nombre||'')).join(' • ');
      html += `<div class="programa-ponencia-item">
        <div class="programa-ponencia-linea">
          ${fotos}
          <div>
            ${g.horario ? `<span class="programa-ponencia-hora">${escapeHtml(g.horario)}</span>` : ''}
            <strong>${escapeHtml(g.titulo || '')}</strong><br>
            <em>${nombres}</em>
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
      const grupos = agruparPorTitulo(lista);
      grupos.forEach((g, i) => {
        if (i > 0) html += '<hr class="programa-ponencia-divider">';
        const fotos = g.ponentes.map(p=> p.foto ? `<img class="programa-ponente-foto" src="${escapeHtml(p.foto)}" alt="" loading="lazy" onerror="window.__fotoOnError(this)">` : '').join('');
        const nombres = g.ponentes.map(p=> escapeHtml(p.nombre||'')).join(' • ');
        const titulo = g.ponentes[0]?.titulo || '';
        const horario = g.horario || g.ponentes[0]?.horario || '';
        html += `<div class="programa-ponencia-item">
          <div class="programa-ponencia-linea">
            ${fotos}
            <div>
              ${horario ? `<span class="programa-ponencia-hora">${escapeHtml(horario)}</span>` : ''}
              <strong>${nombres}</strong><br>
              ${titulo ? `<em>${escapeHtml(titulo)}</em>` : ''}
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
        // Para talleres multiparte la inscripción crea una fila en cada parte;
        // sumar duplicaría el recuento. Usar el máximo (o el del main) refleja
        // personas únicas y coincide con el control de cupo del backend.
        const inscriptos = Math.max(...allParts.map(p => Number(p.inscriptos) || 0));
        const cupo = Math.min(...allParts.map(p => Number(p.cupo) || 20));
        const lleno = inscriptos >= cupo;
        const duracionTotal = allParts.reduce((s, p) => s + (Number(p.duracion_hs) || 3), 0);
        const horarios = allParts.map(p => horariosTaller(p)).join('<br>');
        const tallId = t.pareja_id || t.id;
        const checkbox = isSeleccion
          ? `<input type="checkbox" class="taller-checkbox" data-taller-id="${tallId}"${lleno ? ' disabled title="No hay más cupos disponibles"' : ''}>`
          : '';
        const disertante = t.disertante ? `<div class="taller-disertante">${escapeHtml(t.disertante)}</div>` : '';
        const disponibles = Math.max(0, cupo - inscriptos);
        const cupoHtml = lleno
          ? '<span class="cupo-lleno">Lleno</span>'
          : `${disponibles} de ${cupo}`;
        rows += `<tr data-taller-id="${tallId}" class="${lleno ? 'fila-llena' : ''}"${lleno && isSeleccion ? ' title="No hay más cupos disponibles"' : ''}>
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
            if (cb.disabled) {
              cb.checked = false;
              alert('No hay más cupos disponibles');
              return;
            }
            if (typeof window.__cambioSeleccionTaller === 'function') {
              window.__cambioSeleccionTaller(cb);
            }
          });
          if (cb.disabled) {
            cb.addEventListener('click', (e) => {
              e.preventDefault();
              alert('No hay más cupos disponibles');
            });
          }
        });
        container.querySelectorAll('tr.fila-llena').forEach(tr => {
          tr.addEventListener('click', (e) => {
            const cb = tr.querySelector('.taller-checkbox');
            if (cb && cb.disabled && e.target !== cb) {
              alert('No hay más cupos disponibles');
            }
          });
          tr.style.cursor = 'not-allowed';
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
          <div class="programa-controls-left">
            <button type="button" class="programa-action-btn programa-btn-pdf" id="btnDescargarPdfPrograma" onclick="ProgramaUI.descargarPDF('programa')">⬇️ Descargar PDF</button>
            <button type="button" class="programa-action-btn" id="btnImprimirPrograma" onclick="ProgramaUI.imprimirPrograma('programa')">🖨️ Imprimir</button>
          </div>
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

    if (mode !== 'admin') {
      html += `
        <div class="programa-pdf-holder" data-pdf-tipo="programa" aria-hidden="true">
          <div class="programa-pdf-area"></div>
        </div>`;
    }

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

    if (mode !== 'admin') {
      const controlesHTML = `
        <div class="programa-controls">
          <div class="programa-controls-left">
            <button type="button" class="programa-action-btn programa-btn-pdf" onclick="ProgramaUI.descargarPDF('disertantes')">⬇️ Descargar PDF</button>
            <button type="button" class="programa-action-btn" onclick="ProgramaUI.imprimirPrograma('disertantes')">🖨️ Imprimir</button>
          </div>
          <div class="programa-controls-right"></div>
        </div>`;

      const seccionHTML = renderDisertantesSeccion() + `
        <div class="programa-pdf-holder" data-pdf-tipo="disertantes" aria-hidden="true">
          <div class="programa-pdf-area"></div>
        </div>`;

      if (disertantesContainer) {
        disertantesContainer.innerHTML = controlesHTML + seccionHTML;
      } else {
        const extra = document.createElement('div');
        extra.innerHTML = seccionHTML;
        while (extra.firstChild) container.appendChild(extra.firstChild);
      }
      buildPdfArea();
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
      disertantesContainer = opts.disertantesContainer
        ? (typeof opts.disertantesContainer === 'string' ? document.querySelector(opts.disertantesContainer) : opts.disertantesContainer)
        : null;
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

    descargarPDF,
    imprimirPrograma,

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

window.ProgramaUI = ProgramaUI;
