# Sistema de Inscripciones a Talleres

Aplicación web para inscribir personas a talleres con cupos limitados. Hay 25 talleres repartidos en 3 días. Una persona puede inscribirse a los talleres que desee, verificando que no se superpongan en horario.

## Características

- Formulario público de registro: nombre, apellido, DNI, correo y selección de talleres.
- Control de cupos por taller con protección ante inscripciones simultáneas (transacciones con bloqueo de fila).
- Validación de superposición de horarios al inscribir.
- Panel de administración protegido con contraseña: **CRUD completo de talleres**, ver inscriptos y eliminar inscripciones.
- Base de datos MySQL **o** PostgreSQL (configurable por variables de entorno).
- Al primer arranque crea las tablas automáticamente. Los talleres se cargan desde el panel (opcionalmente, `SEED_ON_START=true` carga 10 talleres de ejemplo).

## Requisitos

- Node.js 18 o superior.
- Una base de datos MySQL o PostgreSQL ya creada (la app crea las tablas sola).

## Configuración

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` a `.env` y completar:

   ```bash
   cp .env.example .env
   ```

3. Configurar la conexión. En `.env`:

   **Opción A — MySQL** (predeterminado):

   ```
   DB_TYPE=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_USER=root
   DB_PASSWORD=mi_clave
   DB_NAME=inscripciones
   ```

   **Opción B — PostgreSQL:**

   ```
   DB_TYPE=postgres
   DATABASE_URL=postgres://usuario:clave@localhost:5432/inscripciones
   ```

   (También funcionan las variables `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.)

> **Zona horaria:** el sistema almacena los timestamps en UTC y los muestra en
> `America/Argentina/Salta` (el server formatea las fechas de notificaciones; el panel
> muestra la zona horaria del navegador). Con PostgreSQL la sesión se fuerza a `UTC`
> automáticamente, por lo que no hace falta configurar la zona en la base.

4. Definir la clave del panel de administración:

   ```
   ADMIN_PASSWORD=una-clave-segura
   ```

5. (Opcional) Si querés arrancar con 10 talleres de ejemplo en vez de cargarlos a mano:

   ```
   SEED_ON_START=true
   ```

## Puesta en marcha

```bash
npm start
```

Luego abrir:

- Formulario público: <http://localhost:3000>
- Panel de administración: <http://localhost:3000/admin.html> (ingresar con `ADMIN_PASSWORD`)

En desarrollo se puede usar `npm run dev` (reinicia automáticamente al guardar).

## Estructura del proyecto - 

```
public/            Frontend (HTML/CSS/JS plano)
  index.html       Formulario de inscripción
  admin.html       Panel de administración
src/
  server.js        Servidor Express y API
  db.js            Conexión a base de datos, esquema, semilla y consultas
.env.example       Plantilla de configuración
```

## API

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/talleres` | Lista de talleres con cupo y cantidad de inscriptos |
| POST | `/api/inscripciones` | Registra una inscripción |
| POST | `/api/admin/login` | Inicia sesión de administración |
| POST | `/api/admin/logout` | Cierra la sesión |
| GET | `/api/admin/talleres` | Lista talleres (requiere sesión) |
| POST | `/api/admin/talleres` | Crea un taller (requiere sesión) |
| PUT | `/api/admin/talleres/:id` | Actualiza nombre, descripción, fecha/hora o cupo (requiere sesión) |
| DELETE | `/api/admin/talleres/:id` | Elimina un taller y sus inscripciones (requiere sesión) |
| GET | `/api/admin/inscripciones` | Lista todas las inscripciones (requiere sesión) |
| DELETE | `/api/admin/inscripciones/:id` | Elimina una inscripción (requiere sesión) |
| GET | `/api/admin/notificaciones` | Lista las notificaciones a la app móvil (requiere sesión) |
| POST | `/api/admin/notificaciones` | Crea una notificación `{ titulo, mensaje, tipo, activa }` (requiere sesión) |
| PUT | `/api/admin/notificaciones/:id` | Edita una notificación (requiere sesión) |
| DELETE | `/api/admin/notificaciones/:id` | Elimina una notificación (requiere sesión) |

Los talleres se crean con `{ nombre, descripcion, cupo, parts: [{ fecha, hora, duracion_hs }]`. No se puede bajar el cupo por debajo de la cantidad de inscriptos actuales.

### Ejemplo de inscripción

```bash
curl -X POST http://localhost:3000/api/inscripciones \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan",
    "apellido": "Pérez",
    "dni": "30123456",
    "email": "juan@example.com",
    "tallerIds": "1,6"
  }'
```

El campo `tallerIds` es obligatorio: una lista de IDs de talleres separados por comas.

## Notas

- Los DNI se validan con 7 u 8 dígitos.
- Si un taller llega a su cupo, deja de aceptar inscripciones (respuesta `409`).
- No se puede bajar el cupo de un taller por debajo de su cantidad de inscriptos actuales.
- Los talleres de ejemplo y sus cupos iniciales (20) se pueden cambiar directamente en la base de datos o desde el panel.

## App móvil de acreditación

La app móvil (React Native/Expo) vive en **su propio repositorio** separado de este
backend. Consume esta API por HTTP (`POST /api/mobile/login` y `/api/mobile/acreditar`),
así que el backend tiene que estar accesible desde el teléfono (misma red Wi-Fi o IP pública).
Ver los endpoints en `src/server.js`.

### Endpoints móviles

| Método | Ruta | Descripción |
| --- | --- | --- |
| POST | `/api/mobile/login` | Inicia sesión (`{ username, password }`) → `{ token }` |
| POST | `/api/mobile/logout` | Cierra la sesión |
| POST | `/api/mobile/acreditar` | Escanea/acredita un QR (`{ codigo }`) |
| GET | `/api/mobile/notificaciones` | Lista las notificaciones activas creadas desde el panel → `{ notificaciones: [{ id, titulo, mensaje, tipo, creado_en }] }` |

Las notificaciones se crean desde la pestaña **Notificaciones** del panel de
administración. La app debe consultar `GET /api/mobile/notificaciones` (con el token
`Bearer` de la sesión móvil) al iniciar o periódicamente para mostrar avisos a los
operadores. Tipos disponibles: `info`, `alerta`, `urgente`, `recordatorio`.
