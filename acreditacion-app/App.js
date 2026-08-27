import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import PantallaLogin from './src/PantallaLogin';
import PantallaEscanner from './src/PantallaEscanner';
import { prepararAudio } from './src/sonidos';

const CLAVE_SESION = 'acreditacion.sesion';

export default function App() {
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const guardada = await AsyncStorage.getItem(CLAVE_SESION);
        if (guardada) {
          const s = JSON.parse(guardada);
          if (s && s.servidorUrl && s.token) setSesion(s);
        }
      } catch (_) {
        /* sesión guardada corrupta: se ignora */
      } finally {
        setCargando(false);
      }
    })();
    prepararAudio();
  }, []);

  const guardarSesion = useCallback(async (nueva) => {
    setSesion(nueva);
    try {
      await AsyncStorage.setItem(CLAVE_SESION, JSON.stringify(nueva));
    } catch (_) {
      /* noop */
    }
  }, []);

  const cerrarSesion = useCallback(async () => {
    setSesion(null);
    try {
      await AsyncStorage.removeItem(CLAVE_SESION);
    } catch (_) {
      /* noop */
    }
  }, []);

  if (cargando) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#22c55e" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" />
      {sesion ? (
        <PantallaEscanner sesion={sesion} alExpirarSesion={cerrarSesion} />
      ) : (
        <PantallaLogin alIniciarSesion={guardarSesion} />
      )}
    </View>
  );
}
