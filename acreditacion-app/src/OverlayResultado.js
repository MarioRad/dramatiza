import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const ETIQUETAS_ALIMENTACION = {
  sin_restriccion: 'Sin restricción',
  vegano: 'VEGANO',
  sin_tacc: 'SIN TACC',
  sin_lactosa: 'SIN LACTOSA',
  otro: 'Dieta especial',
};

const COLORES = {
  ok: { fondo: '#15803d', brillo: '#4ade80' },
  duplicado: { fondo: '#b45309', brillo: '#fde047' },
  error: { fondo: '#b91c1c', brillo: '#fca5a5' },
  conexion: { fondo: '#c2410c', brillo: '#fdba74' },
};

const GLIFOS = { ok: '✓', duplicado: '⚠', error: '✕', conexion: '⚠' };

const LEYENDAS = {
  ok: 'Acreditación Confirmada',
  duplicado: 'Porción ya retirada',
  error: 'No existe el asistente en la Base de Datos',
  conexion: 'Sin conexión con el servidor',
};

const ICONO_SERVICIO = { desayuno: '☕', merienda: '🫖', otro: '🍽️' };

export function tieneRestriccionAlimentaria(alimentacion) {
  return Boolean(alimentacion) && alimentacion !== 'sin_restriccion';
}

export default function OverlayResultado({ tipo, datos, onContinuar }) {
  const color = COLORES[tipo] || COLORES.conexion;
  const servicio = datos && datos.servicio;
  const alimentacion = datos ? datos.alimentacion : '';
  const restriccion = tieneRestriccionAlimentaria(alimentacion);

  return (
    <Pressable style={[styles.fondo, { backgroundColor: color.fondo }]} onPress={onContinuar}>
      <Text style={[styles.glifo, { color: color.brillo }]}>{GLIFOS[tipo] || '⚠'}</Text>
      <Text style={styles.leyenda}>{LEYENDAS[tipo] || LEYENDAS.conexion}</Text>

      {restriccion ? (
        <View style={styles.restriccionChip}>
          <Text style={styles.restriccionTexto}>
            ⚠ {ETIQUETAS_ALIMENTACION[alimentacion] || String(alimentacion).toUpperCase()}
          </Text>
        </View>
      ) : null}

      {tipo === 'ok' && servicio ? (
        <View style={styles.servicioCaja}>
          <Text style={styles.servicioTitulo}>
            {ICONO_SERVICIO[servicio.categoria] || '🍽️'} {servicio.titulo}
          </Text>
          <Text style={styles.servicioEstado}>✓ Porción habilitada</Text>
        </View>
      ) : null}

      {tipo === 'duplicado' && servicio ? (
        <Text style={styles.duplicadoDetalle}>
          Ya registró su porción de {ICONO_SERVICIO[servicio.categoria] || ''} {servicio.titulo}. No corresponde repetir.
        </Text>
      ) : null}

      {tipo === 'ok' && datos ? (
        <ScrollView style={styles.detalle} contentContainerStyle={styles.detalleContenido} showsVerticalScrollIndicator={false}>
          <Text style={styles.nombre}>
            {[datos.apellido, datos.nombre].filter(Boolean).join(', ')}
          </Text>
          {datos.dni ? <Text style={styles.dato}>DNI {datos.dni}</Text> : null}
          {!servicio && datos.horaServidor ? (
            <Text style={styles.horaServidor}>Fuera del horario de desayuno/merienda · Hora servidor: {datos.horaServidor}</Text>
          ) : null}
          {!servicio && Array.isArray(datos.talleres) && datos.talleres.length > 0 ? (
            <>
              <Text style={styles.seccion}>Talleres:</Text>
              {datos.talleres.map((t, i) => (
                <Text key={i} style={styles.taller}>
                  • {t.taller}
                  {t.fecha ? ` — ${t.fecha}${t.hora ? ` ${t.hora}` : ''}` : ''}
                </Text>
              ))}
            </>
          ) : null}
        </ScrollView>
      ) : null}

      {tipo === 'error' && datos && datos.codigo ? (
        <Text style={styles.codigoEscaneado}>Código: {datos.codigo}</Text>
      ) : null}

      <Text style={styles.pista}>Tocá la pantalla para seguir escaneando</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fondo: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  glifo: {
    fontSize: 130,
    lineHeight: 150,
    fontWeight: 'bold',
  },
  leyenda: {
    color: '#fff',
    fontSize: 25,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 6,
  },
  restriccionChip: {
    backgroundColor: '#fde047',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 14,
    borderWidth: 2,
    borderColor: '#713f12',
  },
  restriccionTexto: {
    color: '#713f12',
    fontSize: 22,
    fontWeight: 'bold',
  },
  servicioCaja: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingHorizontal: 18,
    paddingVertical: 10,
    marginTop: 14,
    alignItems: 'center',
  },
  servicioTitulo: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
  servicioEstado: {
    color: '#fff',
    fontSize: 15,
    marginTop: 3,
  },
  duplicadoDetalle: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 320,
  },
  detalle: {
    maxHeight: 200,
    marginTop: 16,
    alignSelf: 'stretch',
  },
  detalleContenido: { alignItems: 'center' },
  nombre: {
    color: '#fff',
    fontSize: 19,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  dato: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    marginTop: 2,
  },
  horaServidor: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 6,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  seccion: {
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 10,
    fontSize: 15,
  },
  taller: {
    color: 'rgba(255,255,255,0.95)',
    fontSize: 14,
    marginTop: 3,
    textAlign: 'center',
  },
  codigoEscaneado: {
    color: 'rgba(255,255,255,0.85)',
    marginTop: 14,
    fontSize: 14,
  },
  pista: {
    position: 'absolute',
    bottom: 34,
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
  },
});
