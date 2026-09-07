# Plan: Programa Interactivo con CRUD

## Estado actual

### Completado
- [x] DB: Tablas `programa_bloques`, `configuracion_evento` + funciones + seed (src/db.js)
- [x] API: Rutas programa, config, middleware permisos (src/server.js)
- [x] Crear `public/programa.css`: estilos light/dark del programa
- [x] Crear `public/js/programa.js`: renderizado read-only + modo admin CRUD
- [x] Tabs públicos Inscripción/Programa/Disertantes (public/index.html, inscripcion.js)
- [x] Pestaña admin "Programa del Encuentro" + modal CRUD bloques (admin.html, admin.js)
- [x] Sección Disertantes movida a su propia pestaña pública (con PDF/imprimir en ambas)

### Pendiente
- [ ] Verificar visual en navegador (tabs, acordeón, PDF/imprimir)
- [ ] `public/css/estilos.css`: estilos adicionales si hacen falta

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
- `public/js/programa.js` — CREADO — renderizado read-only + admin CRUD
- `public/index.html` — MODIFICADO — tabs Inscripción/Programa/Disertantes
- `public/js/inscripcion.js` — MODIFICADO — lógica tabs
- `public/admin.html` — MODIFICADO — pestañas Programa + modal bloque
- `public/js/admin.js` — MODIFICADO — CRUD bloques
- `public/css/estilos.css` — PENDIENTE — estilos adicionales

## Nota: campo `dia` en programa_bloques
- `programa_bloques.dia` es `VARCHAR(10)` y guarda fechas completas (`2026-10-09`), NO números de día.
- El modal admin usa `<input type="date">` y la API valida con `parseDiaFecha` (`^\d{4}-\d{2}-\d{2}$`).
