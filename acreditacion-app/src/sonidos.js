import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let preparado = false;
let jugadorOk = null;
let jugadorError = null;

export async function prepararAudio() {
  if (preparado) return;
  preparado = true;
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      interruptionMode: 'mixWithOthers',
    });
  } catch (_) {
    /* seguir sin configuración de audio */
  }
  jugadorOk = createAudioPlayer(require('../assets/beep_ok.wav'));
  jugadorError = createAudioPlayer(require('../assets/beep_error.wav'));
}

function sonar(jugador) {
  if (!jugador) return;
  try {
    jugador.pause();
    jugador.seekTo(0).catch(() => {});
    jugador.play();
  } catch (_) {
    /* noop */
  }
}

export function sonarBipOk() {
  sonar(jugadorOk);
}

export function sonarBipError() {
  sonar(jugadorError);
}
