const crypto = require('crypto');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function verificarFirma(payload, firma) {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload);
  const expected = `sha256=${hmac.digest('hex')}`;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(firma || ''));
  } catch {
    return false;
  }
}

function ejecutarDeploy() {
  const script = path.join(__dirname, '..', 'scripts', 'deploy.sh');
  const logPath = path.join(__dirname, '..', 'logs', 'deploy.log');

  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  fs.appendFileSync(logPath, `\n--- Deploy iniciado: ${new Date().toISOString()} ---\n`);

  const child = spawn('bash', [script], {
    stdio: 'ignore',
    detached: true,
    env: { ...process.env, PROJECT_DIR: path.join(__dirname, '..') },
  });
  child.unref();

  console.log('[Webhook] Deploy lanzado, reiniciando servidor...');

  setTimeout(() => process.exit(0), 500);
}

function construirMensajePush(data) {
  const rama = (data.ref || '').replace('refs/heads/', '');
  const commits = data.commits || [];
  const autor = data.pusher?.name || data.sender?.login || 'desconocido';
  const repo = data.repository?.full_name || 'desconocido';

  const lineas = [
    `Push a ${repo} rama ${rama}`,
    `Autor: ${autor}`,
    `Commits: ${commits.length}`,
  ];
  for (const c of commits.slice(0, 5)) {
    lineas.push(`  - ${c.message?.split('\n')[0] || '(sin mensaje)'} (${c.author?.name || ''})`);
  }
  if (commits.length > 5) lineas.push(`  ... y ${commits.length - 5} más`);
  return lineas.join('\n');
}

function manejarWebhook(req, res) {
  if (String(process.env.GITHUB_WEBHOOK_ENABLED || '').toLowerCase() !== 'true') {
    return res.status(503).json({ error: 'Webhook deshabilitado.' });
  }

  const firma = req.headers['x-hub-signature-256'];
  const evento = req.headers['x-github-event'];
  const delivery = req.headers['x-github-delivery'];

  if (!verificarFirma(JSON.stringify(req.body), firma)) {
    console.error(`[Webhook] Firma inválida (delivery: ${delivery})`);
    return res.status(401).json({ error: 'Firma inválida.' });
  }

  console.log(`[Webhook] Evento: ${evento} (delivery: ${delivery})`);

  if (evento === 'push') {
    const data = req.body;
    const rama = (data.ref || '').replace('refs/heads/', '');
    const branch = (process.env.DEPLOY_BRANCH || 'main').trim();

    if (rama !== branch) {
      return res.json({ ok: true, mensaje: `Push a rama ${rama}, se ignora (deploy solo en ${branch}).` });
    }

    const mensaje = construirMensajePush(data);
    console.log(`[Webhook] Push a ${rama}:\n${mensaje}`);

    res.json({ ok: true, mensaje: 'Deploy en curso.' });

    ejecutarDeploy();
    return;
  }

  res.json({ ok: true, mensaje: `Evento ${evento} recibido.` });
}

module.exports = { manejarWebhook, verificarFirma };
