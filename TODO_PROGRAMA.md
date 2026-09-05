# Plan: Programa Interactivo con CRUD

## Estado actual

### Completado
- [x] DB: Tablas `programa_bloques`, `configuracion_evento` + funciones + seed (src/db.js)
- [x] API: Rutas programa, config, middleware permisos (src/server.js)
- [x] Crear `public/programa.css`: estilos light/dark del programa

### Pendiente
- [ ] Crear `public/js/programa.js`: renderizado read-only + modo admin CRUD
- [ ] Modificar `public/index.html` + `public/js/inscripcion.js`: tabs Inscripción/Programa
- [ ] Modificar `public/admin.html` + `public/js/admin.js`: pestañas Programa + Permisos + CRUD bloques
- [ ] Modificar `public/css/estilos.css`: estilos adicionales para nuevas pestañas

## Resumen del sistema

### Modelo de datos (3 tablas nuevas en src/db.js)
- `programa_bloques`: bloques del programa (dia, hora_inicio, hora_fin, tipo, titulo, descripcion, icono, orden, datos JSON)
- `configuracion_evento`: config global (clave/valor) — capacidad_locacion, perm_*
- Seed: 20 talleres reales + ~22 bloques del programa + config por defecto

### API Routes (en src/server.js)
**Públicas:**
- GET /api/programa — bloques del programa
- GET /api/programa/dias — fechas únicas

**Admin (requireAuth):**
- GET /api/admin/programa — bloques + stats capacidad + asistentes
- POST /api/admin/programa/bloques — crear bloque
- PUT /api/admin/programa/bloques/:id — actualizar bloque
- DELETE /api/admin/programa/bloques/:id — eliminar bloque
- GET /api/admin/config — config del evento
- PUT /api/admin/config — actualizar config/permisos

**Permisos (requirePermiso):** talleres, inscripciones, encuentro, acreditacion — admin siempre tiene acceso

### Permisos globales (configuracion_evento)
- perm_inscripciones, perm_talleres, perm_programa, perm_encuentro, perm_acreditacion
- Admin activa/desactiva desde pestaña "Permisos" en admin
- Admin siempre tiene acceso total

### Accesos
| Operación | Admin | Operador | Sin login |
|-----------|:---:|:---:|:---:|
| Ver programa | ✅ | ✅ | ✅ |
| Ver capacidad/asistencia | ✅ | ✅ | ❌ |
| CRUD programa (bloques) | ✅ | ❌ | ❌ |
| CRUD talleres | ✅ | según permiso | ❌ |
| Inscripciones | ✅ | según permiso | ❌ |
| Importar encuentro | ✅ | según permiso | ❌ |
| Permisos | ✅ | ❌ | ❌ |

### Estructura de archivos
- `public/programa.css` — CREADO — estilos light/dark compartidos
- `public/js/programa.js` — PENDIENTE — renderizado read-only + admin CRUD
- `public/index.html` — PENDIENTE — tabs Inscripción/Programa
- `public/js/inscripcion.js` — PENDIENTE — lógica tabs
- `public/admin.html` — PENDIENTE — pestañas Programa + Permisos
- `public/js/admin.js` — PENDIENTE — CRUD bloques + gestión permisos
- `public/css/estilos.css` — PENDIENTE — estilos adicionales
