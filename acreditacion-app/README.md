# App móvil de Acreditación — Dramatiza Salta 2026

App Android en React Native (Expo) para controlar acreditaciones del encuentro escaneando
el código QR de cada asistente con la cámara y validándolo contra la base de datos de
inscriptos del backend.

## Funcionamiento

1. El operador inicia sesión con su usuario del panel (requiere permiso **Acreditación**).
2. Se abre la cámara; al leer un QR se consulta al backend.
3. Si el asistente está inscripto:
   - suena un **bip** agudo,
   - la pantalla se pone **verde** con un tilde ✓ y la leyenda **"Acreditación Confirmada"**,
   - muestra nombre, DNI y los talleres inscriptos.
4. Si no existe en la base de datos:
   - suena un **bip** grave doble,
   - la pantalla se pone **roja** con una ✕ y la leyenda **"No existe el asistente en la Base de Datos"**.
5. La pantalla vuelve sola a la cámara tras ~2,5 s (o al tocarla) para seguir escaneando.
6. Si el QR contiene texto ajeno o el servidor no responde, muestra naranja con el motivo.

El escáner acepta el payload JSON completo del QR, el código `ENC-xxxxxxxxxx` suelto o un
DNI de 7-8 dígitos. Cada verificación exitosa queda registrada en el log de eventos del panel.

Además, si el escaneo ocurre dentro del horario de un bloque de desayuno o merienda
del programa (con 20 minutos de tolerancia), la app funciona como control de comidas:

- pantalla verde con **"Porción habilitada"** la primera vez que el asistente retira,
- **aviso destacado** (chip amarillo) si tiene restricción alimentaria (vegano, sin TACC,
  sin lactosa, dieta especial),
- si el asistente ya retiró su porción, pantalla naranja con ⚠ **"Porción ya retirada"**
  y bip de error, para que no reciba una segunda porción,
- los escaneos alimentan los tabs **Acreditaciones** y **Desayunos y meriendas** del panel
  admin (cantidades por servicio con restricciones y recuento por asistente).

## Estructura

| Archivo | Descripción |
| --- | --- |
| `App.js` | Raíz: sesión persistente (AsyncStorage) y cambio login ↔ escáner |
| `src/api.js` | Cliente HTTP (`/api/mobile/login`, `/api/mobile/acreditar`) |
| `src/PantallaLogin.js` | Ingreso de servidor, usuario y contraseña |
| `src/PantallaEscanner.js` | Cámara, linterna, vibración y contadores |
| `src/OverlayResultado.js` | Overlays verde / rojo / naranja |
| `src/sonidos.js` | Reproducción de los bip (`assets/beep_ok.wav`, `beep_error.wav`) |
| `scripts/generar-sonidos.js` | Regenera los WAV de los bip |

## Requisitos

- Node.js 18+
- Backend corriendo (este mismo repositorio) accesible desde el teléfono
  (misma red Wi-Fi, IP LAN o dominio público).
- Para desarrollo: la app **Expo Go** en el teléfono.
- Para generar el APK: cuenta de Expo (EAS) o Android SDK local.

## Puesta en marcha (desarrollo)

```bash
cd acreditacion-app
npm install
npx expo start
```

Escaneá el QR que aparece en consola con Expo Go (Android). En la pantalla de login
ingresá:

- **Servidor**: `http://IP-DEL-SERVIDOR:3000`
- **Usuario / Contraseña**: un usuario creado en el panel admin con permiso de acreditación.

## Compilar el APK

Con EAS Build (recomendado):

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

O en una máquina con Android SDK configurado:

```bash
npx expo run:android --variant release
```

## Backend: endpoints utilizados

La app usa dos endpoints nuevos agregados a `src/server.js` (autenticación por token
Bearer, independiente de las cookies del panel):

- `POST /api/mobile/login` → `{ username, password }` devuelve `{ token }`.
  Exige un usuario activo con `perm_acreditacion`.
- `POST /api/mobile/acreditar` → `{ codigo }` (contenido crudo del QR) devuelve:
  `{ encontrado: true/false, nombre, apellido, dni, talleres[], coincideCodigo }`.

Se puede probar sin teléfono:

```bash
# en la raíz del repositorio
node scripts/prueba-api-movil.js
```

(usa una base simulada; valida login, token, QR válido, DNI, inexistente y logout).
