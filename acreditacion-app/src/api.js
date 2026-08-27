function normalizarUrl(url) {
  let u = String(url || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = `http://${u}`;
  return u.replace(/\/+$/, '');
}

async function pedir(url, opciones = {}) {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), 10000);
  try {
    const res = await fetch(url, {
      ...opciones,
      headers: {
        'Content-Type': 'application/json',
        ...(opciones.headers || {}),
      },
      signal: controlador.signal,
    });
    let cuerpo = null;
    try {
      cuerpo = await res.json();
    } catch (_) {
      cuerpo = null;
    }
    if (!res.ok) {
      const err = new Error((cuerpo && cuerpo.error) || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return cuerpo;
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('El servidor no respondió.');
      err.sinConexion = true;
      throw err;
    }
    throw e;
  } finally {
    clearTimeout(temporizador);
  }
}

export async function iniciarSesion(servidor, usuario, password) {
  const base = normalizarUrl(servidor);
  if (!base) {
    const err = new Error('Ingresá la dirección del servidor.');
    err.validacion = true;
    throw err;
  }
  const datos = await pedir(`${base}/api/mobile/login`, {
    method: 'POST',
    body: JSON.stringify({ username: String(usuario || '').trim(), password: String(password || '') }),
  });
  return { servidorUrl: base, token: datos.token, nombre: datos.nombre || usuario };
}

export async function verificarCodigo(sesion, codigo) {
  const base = normalizarUrl(sesion.servidorUrl);
  try {
    return await pedir(`${base}/api/mobile/acreditar`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${sesion.token}` },
      body: JSON.stringify({ codigo }),
    });
  } catch (e) {
    if (e.status === 401) {
      const err = new Error('La sesión expiró. Iniciá sesión nuevamente.');
      err.sesionExpirada = true;
      throw err;
    }
    if (e instanceof TypeError || !e.status) {
      const err = new Error('Sin conexión con el servidor.');
      err.sinConexion = true;
      throw err;
    }
    throw e;
  }
}
