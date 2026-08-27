import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, Vibration } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import OverlayResultado from './OverlayResultado';
import { verificarCodigo } from './api';
import { prepararAudio, sonarBipError, sonarBipOk } from './sonidos';

const MS_REANUDAR = 2600;

export default function PantallaEscanner({ sesion, alExpirarSesion }) {
  const [permiso, pedirPermiso] = useCameraPermissions();
  const [resultado, setResultado] = useState(null);
  const [procesando, setProcesando] = useState(false);
  const [antorcha, setAntorcha] = useState(false);
  const [contadores, setContadores] = useState({ ok: 0, duplicado: 0, error: 0 });

  const bloqueadoRef = useRef(false);
  const temporizadorRef = useRef(null);

  useEffect(() => {
    prepararAudio();
    return () => {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    };
  }, []);

  const reanudar = useCallback(() => {
    if (temporizadorRef.current) {
      clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
    }
    bloqueadoRef.current = false;
    setResultado(null);
    setProcesando(false);
  }, []);

  const programarReanudacion = useCallback(() => {
    if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
    temporizadorRef.current = setTimeout(reanudar, MS_REANUDAR);
  }, [reanudar]);

  const manejarLectura = useCallback(
    async ({ data }) => {
      if (bloqueadoRef.current) return;
      bloqueadoRef.current = true;
      setProcesando(true);

      try {
        const r = await verificarCodigo(sesion, data);
        if (r.encontrado) {
          if (r.servicio && r.servicio.yaRetirado) {
            sonarBipError();
            Vibration.vibrate([0, 90, 70, 90]);
            setContadores((c) => ({ ...c, ok: c.ok + 1, duplicado: c.duplicado + 1 }));
            setResultado({ tipo: 'duplicado', datos: r });
          } else {
            sonarBipOk();
            Vibration.vibrate(120);
            setContadores((c) => ({ ...c, ok: c.ok + 1 }));
            setResultado({ tipo: 'ok', datos: r });
          }
        } else {
          sonarBipError();
          Vibration.vibrate([0, 90, 70, 90]);
          setContadores((c) => ({ ...c, error: c.error + 1 }));
          setResultado({ tipo: 'error', datos: r });
        }
      } catch (e) {
        sonarBipError();
        Vibration.vibrate([0, 90, 70, 90]);
        if (e.sesionExpirada) {
          alExpirarSesion();
          return;
        }
        setResultado({
          tipo: e.sinConexion ? 'conexion' : 'error',
          datos: null,
          mensaje: e.message,
        });
      }
      programarReanudacion();
    },
    [sesion, alExpirarSesion, programarReanudacion]
  );

  if (!permiso) {
    return <View style={styles.centro} />;
  }

  if (!permiso.granted) {
    return (
      <View style={[styles.centro, styles.fondoPermiso]}>
        <Text style={styles.permisoTexto}>Se necesita acceso a la cámara para escanear los códigos QR.</Text>
        <Pressable style={styles.botonPermiso} onPress={pedirPermiso}>
          <Text style={styles.botonPermisoTexto}>Conceder permiso</Text>
        </Pressable>
      </View>
    );
  }

  const detenido = Boolean(resultado) || procesando;

  return (
    <View style={styles.flex}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        enableTorch={antorcha}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={detenido ? undefined : manejarLectura}
      />

      {/* Marco guía */}
      {!detenido ? (
        <View style={styles.marco} pointerEvents="none">
          <View style={styles.visor} />
          <Text style={styles.ayuda}>Enfocá el código QR de la acreditación</Text>
        </View>
      ) : null}

      {/* Barra superior */}
      <View style={styles.barra}>
        <View style={{ flex: 1 }}>
          <Text style={styles.usuario}>{sesion.nombre}</Text>
          <Text style={styles.servidor}>
            ✓ {contadores.ok} · ⚠ {contadores.duplicado} · ✕ {contadores.error}
          </Text>
        </View>
        <Pressable style={styles.botonBarra} onPress={() => setAntorcha((v) => !v)}>
          <Text style={styles.botonBarraTexto}>{antorcha ? '🔆' : '🔅'}</Text>
        </Pressable>
      </View>

      {procesando && !resultado ? (
        <View style={styles.cargando} pointerEvents="none">
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.cargandoTexto}>Verificando…</Text>
        </View>
      ) : null}

      {resultado ? (
        <OverlayResultado tipo={resultado.tipo} datos={resultado.datos} onContinuar={reanudar} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#000' },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fondoPermiso: { backgroundColor: '#0f172a', padding: 30 },
  permisoTexto: { color: '#e2e8f0', fontSize: 16, textAlign: 'center' },
  botonPermiso: {
    marginTop: 20,
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 28,
  },
  botonPermisoTexto: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  marco: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  visor: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 18,
  },
  ayuda: {
    marginTop: 22,
    color: '#fff',
    fontSize: 15,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  barra: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 46,
    paddingBottom: 12,
    paddingHorizontal: 16,
    backgroundColor: 'rgba(15,23,42,0.75)',
  },
  usuario: { color: '#f8fafc', fontSize: 16, fontWeight: 'bold' },
  servidor: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  botonBarra: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonBarraTexto: { fontSize: 20 },
  cargando: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  cargandoTexto: { color: '#fff', marginTop: 12, fontSize: 16 },
});
