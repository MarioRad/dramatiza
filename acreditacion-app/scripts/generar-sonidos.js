const fs = require('fs');
const path = require('path');

const FRECUENCIA_MUESTREO = 22050;

function crearWav(muestras) {
  const datos = Buffer.alloc(muestras.length * 2);
  for (let i = 0; i < muestras.length; i++) {
    const v = Math.max(-1, Math.min(1, muestras[i]));
    datos.writeInt16LE(Math.round(v * 32767), i * 2);
  }
  const cabecera = Buffer.alloc(44);
  cabecera.write('RIFF', 0);
  cabecera.writeUInt32LE(36 + datos.length, 4);
  cabecera.write('WAVE', 8);
  cabecera.write('fmt ', 12);
  cabecera.writeUInt32LE(16, 16);
  cabecera.writeUInt16LE(1, 20);
  cabecera.writeUInt16LE(1, 22);
  cabecera.writeUInt32LE(FRECUENCIA_MUESTREO, 24);
  cabecera.writeUInt32LE(FRECUENCIA_MUESTREO * 2, 28);
  cabecera.writeUInt16LE(2, 32);
  cabecera.writeUInt16LE(16, 34);
  cabecera.write('data', 36);
  cabecera.writeUInt32LE(datos.length, 40);
  return Buffer.concat([cabecera, datos]);
}

function tono({ frecuencia, duracionMs, volumen = 0.85, ataqueMs = 5, tipo = 'seno' }) {
  const n = Math.round((FRECUENCIA_MUESTREO * duracionMs) / 1000);
  const ataqueN = Math.max(1, Math.round((FRECUENCIA_MUESTREO * ataqueMs) / 1000));
  const salida = new Array(n);
  let fase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / FRECUENCIA_MUESTREO;
    const f = typeof frecuencia === 'function' ? frecuencia(t, i / n) : frecuencia;
    fase += (2 * Math.PI * f) / FRECUENCIA_MUESTREO;
    let muestra;
    if (tipo === 'cuadrada') {
      muestra = Math.sin(fase) >= 0 ? 1 : -1;
    } else {
      muestra = Math.sin(fase);
    }
    const envolventeAtaque = Math.min(1, i / ataqueN);
    const envolventeCaida = Math.pow(1 - i / n, 0.6);
    salida[i] = muestra * volumen * envolventeAtaque * envolventeCaida;
  }
  return salida;
}

function concatenar(partes) {
  return partes.reduce((acc, p) => acc.concat(p), []);
}

const beepOk = tono({ frecuencia: 1318, duracionMs: 170 });
const beepError = concatenar([
  tono({ frecuencia: 440, duracionMs: 150, tipo: 'cuadrada', volumen: 0.7 }),
  tono({ frecuencia: 220, duracionMs: 260, tipo: 'cuadrada', volumen: 0.7 }),
]);

const carpetaAssets = path.join(__dirname, '..', 'assets');
fs.writeFileSync(path.join(carpetaAssets, 'beep_ok.wav'), crearWav(beepOk));
fs.writeFileSync(path.join(carpetaAssets, 'beep_error.wav'), crearWav(beepError));
console.log('Sonidos generados en assets/: beep_ok.wav y beep_error.wav');
