import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
} from 'react-native';
import { iniciarSesion } from './api';

export default function PantallaLogin({ alIniciarSesion }) {
  const [servidor, setServidor] = useState('');
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  const ingresar = async () => {
    if (cargando) return;
    setError('');
    setCargando(true);
    try {
      const sesion = await iniciarSesion(servidor, usuario, password);
      alIniciarSesion(sesion);
    } catch (e) {
      setError(e.message || 'No se pudo iniciar sesión.');
    } finally {
      setCargando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'android' ? undefined : 'padding'}
    >
      <ScrollView contentContainerStyle={styles.contenedor}>
        <Text style={styles.logo}>✓</Text>
        <Text style={styles.titulo}>Acreditación</Text>
        <Text style={styles.subtitulo}>Encuentro Nacional Dramatiza Salta 2026</Text>

        <Text style={styles.etiqueta}>Servidor</Text>
        <TextInput
          style={styles.input}
          placeholder="http://192.168.1.10:3000"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={servidor}
          onChangeText={setServidor}
        />

        <Text style={styles.etiqueta}>Usuario</Text>
        <TextInput
          style={styles.input}
          placeholder="Usuario del panel"
          autoCapitalize="none"
          autoCorrect={false}
          value={usuario}
          onChangeText={setUsuario}
        />

        <Text style={styles.etiqueta}>Contraseña</Text>
        <TextInput
          style={styles.input}
          placeholder="••••••••"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={ingresar}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable style={[styles.boton, cargando && styles.botonDeshabilitado]} onPress={ingresar} disabled={cargando}>
          {cargando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.botonTexto}>Ingresar</Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  contenedor: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: '#0f172a',
  },
  logo: {
    fontSize: 72,
    color: '#22c55e',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  titulo: {
    fontSize: 30,
    fontWeight: 'bold',
    color: '#f8fafc',
    textAlign: 'center',
    marginTop: 8,
  },
  subtitulo: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 36,
  },
  etiqueta: {
    color: '#cbd5e1',
    fontSize: 13,
    marginBottom: 6,
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#f8fafc',
    fontSize: 16,
    marginBottom: 16,
  },
  error: {
    color: '#fca5a5',
    textAlign: 'center',
    marginBottom: 12,
  },
  boton: {
    backgroundColor: '#16a34a',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  botonDeshabilitado: { opacity: 0.7 },
  botonTexto: {
    color: '#fff',
    fontSize: 17,
    fontWeight: 'bold',
  },
});
