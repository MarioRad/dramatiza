const os = require('os');
const path = require('path');
const fs = require('fs');

function baseWritable() {
  const env = String(process.env.LOGS_DIR || '').trim();
  if (env) return path.resolve(env);
  const enVercel = process.env.VERCEL === '1' || !!process.env.AWS_LAMBDA_FUNCTION_NAME || !!process.env.VERCEL_REGION;
  return enVercel ? os.tmpdir() : path.join(__dirname, '..', 'logs');
}

function carpetaLogs(sub) {
  const base = baseWritable();
  const carpeta = sub ? path.join(base, String(sub)) : base;
  fs.mkdirSync(carpeta, { recursive: true });
  return carpeta;
}

function escribirLog(sub, archivo, contenido) {
  const carpeta = carpetaLogs(sub);
  try {
    fs.appendFileSync(path.join(carpeta, archivo), contenido);
  } catch (e) {
    /* noop */
  }
}

module.exports = {
  baseWritable,
  carpetaLogs,
  escribirLog,
};