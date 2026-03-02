# GUÍA DE DESPLIEGUE Y CONFIGURACIÓN — SISTEMA SST
## App Web SST · ITELSA IA · Control de Campo
---

> **Versión:** 1.0 · Fecha: Febrero 2026
> **Uso:** Este documento describe el proceso completo para activar la App Web SST en un nuevo cliente.
> **Tiempo estimado:** 20–30 minutos por cliente.

---

# PARTE 1 — REQUISITOS PREVIOS

Antes de iniciar el despliegue para un nuevo cliente, verifique que tiene disponible:

| Elemento | Descripción |
|---|---|
| Cuenta Google de ITELSA | La misma cuenta que desplegó SST_CORE_MASTER |
| Google Sheet del cliente | Hoja de cálculo nueva o existente para este cliente |
| Carpeta en Google Drive | Carpeta raíz donde se guardarán las fotos del cliente |
| Logo del cliente | URL pública del logo (Drive, web, etc.) |
| Datos del administrador | Email y nombre del usuario ADMIN del cliente |
| SST_CORE_MASTER Script ID | `1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey` |

---

# PARTE 2 — PASO A PASO DE DESPLIEGUE

## PASO 1 · Crear el Google Sheet del cliente

1. Ir a **sheets.google.com** → Crear nueva hoja de cálculo
2. Nombrarla con el formato: `APP_WEB_SST_[NOMBRE_CLIENTE]`
   - Ejemplo: `APP_WEB_SST_SECURITY_WORK_S&M`
3. Copiar el **ID del spreadsheet** desde la URL:
   - URL ejemplo: `https://docs.google.com/spreadsheets/d/`**`1ABC...xyz`**`/edit`
   - El ID es la parte resaltada entre `/d/` y `/edit`
4. Guardar ese ID — se necesita en el Paso 4

---

## PASO 2 · Crear el proyecto Google Apps Script del cliente

1. Ir a **script.google.com** → **Nuevo proyecto**
2. Nombrar el proyecto: `SST_[NOMBRE_CLIENTE]`
   - Ejemplo: `SST_SECURITY_WORK`
3. En el editor, **eliminar todo el contenido** del archivo `Código.gs`
4. **Pegar el código completo** que aparece en la PARTE 3 de este documento
5. Guardar el proyecto (Ctrl + S)

---

## PASO 3 · Agregar la biblioteca SST_CORE_MASTER

1. En el editor de Apps Script, ir al panel izquierdo → **Bibliotecas** (ícono +)
2. En el campo "ID de script", pegar:
   ```
   1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey
   ```
3. Hacer clic en **Buscar**
4. En "Versión", seleccionar la **versión más alta disponible** (la más reciente)
   - ⚠️ NO usar "HEAD (modo de desarrollo)" en producción
5. En "Identificador", verificar que diga: `SST_CORE_MASTER`
6. Hacer clic en **Agregar**

---

## PASO 4 · Configurar la Propiedad del Script (SPREADSHEET_ID)

1. En el editor, ir a ⚙️ **Configuración del proyecto** (ícono engranaje)
2. Desplazarse hasta la sección **"Propiedades del script"**
3. Hacer clic en **"Agregar propiedad"**
4. Configurar así:

| Propiedad | Valor |
|---|---|
| `SPREADSHEET_ID` | ID copiado en el Paso 1 |

5. Hacer clic en **Guardar propiedades del script**

> ⚠️ **MUY IMPORTANTE:** Este es el ID que aísla los datos del cliente. Sin este valor, el sistema usará el spreadsheet de DEV por defecto.

---

## PASO 5 · Inicializar la base de datos (UNA SOLA VEZ)

1. En el editor de Apps Script, en la barra superior, seleccionar la función: `inicializarProduccion`
2. Hacer clic en ▶ **Ejecutar**
3. Si pide permisos de autorización → hacer clic en **"Revisar permisos"** → elegir la cuenta de ITELSA → **"Permitir"**
   - ⚠️ Debe autorizar todos los scopes solicitados (Sheets, Drive, etc.)
4. Esperar que termine — verificar en el Google Sheet que se crearon todas las hojas:
   - `PARAM_SISTEMA`
   - `DB_USUARIOS`
   - `DB_CLIENTES`
   - `DB_INSPECCIONES`
   - `DB_ASISTENCIA`
   - `DB_HALLAZGOS`
   - `LISTAS_FORMATOS`
   - `DB_ANALISIS_IA`

---

## PASO 6 · Configurar PARAM_SISTEMA

Abrir el Google Sheet del cliente → pestaña **PARAM_SISTEMA** y completar los siguientes valores:

| Parámetro (col. A) | Valor a ingresar (col. B) | Descripción |
|---|---|---|
| `COLOR_PRIMARIO` | Dejar vacío para auto-detección ó `#RRGGBB` | Color principal de la marca. Si hay logo, se extrae automáticamente con IA |
| `COLOR_ACENTO` | Dejar vacío para auto-detección ó `#RRGGBB` | Color de acento de la marca |
| `COLOR_FONDO` | `#101922` | Color de fondo (recomendado oscuro) |
| `URL_LOGO` | URL pública del logo del cliente | Logo que aparece en la app. Formatos soportados: Drive, web |
| `NOMBRE_EMPRESA` | Nombre comercial del cliente | Ej: `SECURITY WORK S&M` |
| `DRIVE_ROOT_FOLDER_ID` | URL completa de la carpeta Drive | **Crítico para fotos.** Ej: `https://drive.google.com/drive/folders/1ABC...` |
| `GEMINI_API_KEY` | API Key de Google Gemini (opcional) | Para extracción automática de colores desde el logo |
| `OPEN_AI_KEY` | API Key de OpenAI (opcional) | Para análisis IA de hallazgos |
| `CUENTA` | `ACTIVA` | Estado de la cuenta. `INACTIVA` bloquea el login de todos los usuarios |

> ⚠️ **DRIVE_ROOT_FOLDER_ID es obligatorio** para que las fotos se guarden. Sin este valor, todas las imágenes quedarán como "Sin foto".

### Cómo obtener la URL de la carpeta Drive:
1. Ir a Google Drive → crear una carpeta para el cliente (ej: `SST_EVIDENCIAS_SECURITY_WORK`)
2. Abrir la carpeta → copiar la URL completa desde el navegador
3. Verificar que la cuenta de ITELSA tiene permisos de **Editor** en esa carpeta

---

## PASO 7 · Configurar DB_CLIENTES (Obras / Proyectos)

Abrir la pestaña **DB_CLIENTES** y agregar las obras o proyectos donde trabajan los supervisores:

| Columna | Cabecera | Qué ingresar |
|---|---|---|
| A | `ID_Cliente` | Código único. Ej: `CLI-001`, `CLI-002` |
| B | `Nombre_Empresa` | Nombre de la empresa contratante. Ej: `JAS TRANSPORTE` |
| C | `Direccion` | Dirección del proyecto u obra |
| D | `NIT` | NIT de la empresa |
| E | `Correo_Gerente` | Email del gerente o contacto principal |
| F | `Nombre_Contacto` | Nombre del jefe de obra o contacto |
| G | `Celular_Whatsapp` | Celular del contacto |
| H | `Nombre_Obra` | Nombre específico de la obra (opcional) |
| I | `Estado` | `ACTIVO` (aparece en el selector) o `INACTIVO` (oculto) |

> ⚠️ Sin al menos **una fila** en DB_CLIENTES, los supervisores no podrán iniciar jornada porque el selector de obras estará vacío.

---

## PASO 8 · Configurar DB_USUARIOS (Usuarios del sistema)

Abrir la pestaña **DB_USUARIOS** y agregar los usuarios que tendrán acceso:

| Columna | Cabecera | Qué ingresar |
|---|---|---|
| A | `ID_Usuario` | Código único. Ej: `USR-001` |
| B | `Nombre_Completo` | Nombre completo del usuario |
| C | `Email` | Email de Google del usuario (con el que inicia sesión) |
| D | `Password` | Contraseña (texto plano — cambiar en primera sesión) |
| E | `ID_Cliente_Asociado` | Código del supervisor. Ej: `SUP-001`, `SUP-002` |
| F | `Rol` | `SUP-SST` (supervisor) o `ADMIN` (administrador) |
| G | `Empresa_Asociada` | Nombre de la empresa del supervisor |
| H | `Fecha_Registro` | Fecha de creación (puede dejarse en blanco) |
| I | `CUENTA` | `ACTIVA` (puede iniciar sesión) o `INACTIVA` (bloqueado) |

### Roles disponibles:
- **`ADMIN`** → Accede al panel de administración (gestión de usuarios, formatos, reportes)
- **`SUP-SST`** → Accede al panel de supervisor (registro de jornada, formatos, hallazgos)

> 💡 **Recomendación:** Crear primero el usuario ADMIN del cliente para que él mismo pueda gestionar sus supervisores desde la app.

---

## PASO 9 · Configurar LISTAS_FORMATOS (Formatos disponibles)

Abrir la pestaña **LISTAS_FORMATOS** y agregar los tipos de formatos SST que usará este cliente:

| Columna | Cabecera | Qué ingresar |
|---|---|---|
| A | `Id_formato` | Código único del formato. Ej: `ATS`, `IEE`, `PERMISO` |
| B | `Nombre_Formato` | Nombre descriptivo. Ej: `Análisis de Trabajo Seguro` |
| C | `Descripcion` | Descripción breve del formato |
| D | `Empresa_Asociada` | Empresa a la que aplica (o `TODAS` para que aplique a todos) |
| E | `Estado` | `ACTIVO` o `INACTIVO` |

---

## PASO 10 · Implementar como Web App

1. En el editor de Apps Script → **Implementar** (botón azul, esquina superior derecha)
2. Seleccionar **"Nueva implementación"**
3. Hacer clic en el ícono ⚙️ junto a "Tipo" → seleccionar **"Aplicación web"**
4. Configurar así:

| Campo | Valor |
|---|---|
| Descripción | `SST [Nombre Cliente] v1.0` |
| Ejecutar como | **Yo (tu-email@gmail.com)** ← CRÍTICO |
| Quién tiene acceso | **Cualquier usuario** |

5. Hacer clic en **Implementar**
6. Si pide autorización nuevamente → **Permitir** todos los scopes
7. **Copiar la URL** que aparece al final → esta es la URL que se entrega al cliente

> ⚠️ **"Ejecutar como: Yo"** es crítico. Si se configura como "Usuario que accede", las fotos no se guardarán en Drive correctamente y habrá problemas de permisos.

---

## PASO 11 · Verificación final

Antes de entregar al cliente, verificar:

- [ ] Login con usuario ADMIN funciona correctamente
- [ ] Login con usuario SUP-SST funciona correctamente
- [ ] El selector de obras muestra los clientes configurados en DB_CLIENTES
- [ ] Se puede registrar ingreso (inicio de jornada) con foto
- [ ] La foto de ingreso aparece como URL en DB_ASISTENCIA (no "Sin foto")
- [ ] Se puede registrar al menos un formato con foto
- [ ] La foto del formato aparece como URL en DB_INSPECCIONES (no "Sin foto")
- [ ] La URL del logo del cliente aparece correctamente en la app

---

# PARTE 3 — CÓDIGO COMPLETO PARA Código.gs

> Copiar **TODO** este bloque y pegarlo en el archivo `Código.gs` del proyecto Apps Script del cliente.
> NO modificar la lógica — solo configurar el SPREADSHEET_ID en Propiedades del Script (Paso 4).

```javascript
/**
 * ════════════════════════════════════════════════════════════════════════
 * Código.gs — Proyecto cliente SST
 * ════════════════════════════════════════════════════════════════════════
 *
 * PROPÓSITO:
 *   Este archivo es el único código que vive en el proyecto GAS del cliente.
 *   No contiene lógica propia — simplemente re-exporta las funciones de la
 *   biblioteca SST_CORE_MASTER inyectando el SPREADSHEET_ID correcto antes
 *   de cada llamada. Esto garantiza aislamiento total entre clientes.
 *
 * ARQUITECTURA:
 *   [Supervisor en móvil]
 *        ↓  google.script.run
 *   [Este Código.gs]  ← _injectSS_() establece el spreadsheet del cliente
 *        ↓  SST_CORE_MASTER.*
 *   [Biblioteca central ITELSA]  ← toda la lógica vive aquí
 *        ↓  _getSpreadsheet()
 *   [Google Sheet del cliente]  ← datos 100% aislados por cliente
 *
 * ANTES DE USAR:
 *   1. Agregar la biblioteca SST_CORE_MASTER (ver ID más abajo)
 *   2. Ir a ⚙️ Propiedades del script → agregar:
 *         SPREADSHEET_ID = <ID del Google Sheet de este cliente>
 *   3. Ejecutar inicializarProduccion() UNA SOLA VEZ
 *   4. Implementar como WebApp: Ejecutar como "Yo" / Acceso "Cualquier usuario"
 *
 * BIBLIOTECA:
 *   Nombre identificador : SST_CORE_MASTER
 *   Script ID            : 1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey
 *   Versión              : usar SIEMPRE la más reciente (no HEAD)
 *
 * ════════════════════════════════════════════════════════════════════════
 */

// ── Lee el SPREADSHEET_ID desde las Propiedades del Script ──────────────
// Este valor se configura en ⚙️ → Propiedades del script → SPREADSHEET_ID
// NUNCA hardcodear el ID aquí — cada cliente tiene el suyo en sus propiedades
var _SS_ = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';

// ── Inyecta el ID del spreadsheet en la biblioteca antes de cada llamada ─
// CRÍTICO: sin esta inyección, la biblioteca no sabe qué spreadsheet usar
function _injectSS_() {
  SST_CORE_MASTER.setSpreadsheetId(_SS_);
}

// ════════════════════════════════════════════════════════════════════════
// ENTRY POINTS — Punto de entrada de la Web App
// Estas dos funciones son invocadas automáticamente por Google Apps Script
// cuando alguien visita la URL de la app (doGet) o envía datos (doPost)
// ════════════════════════════════════════════════════════════════════════

function doGet(e) {
  _injectSS_(); // ← inyectar SIEMPRE antes de llamar a la biblioteca
  return SST_CORE_MASTER.doGet(e);
}

function doPost(e) {
  _injectSS_();
  return SST_CORE_MASTER.doPost(e);
}

// ════════════════════════════════════════════════════════════════════════
// SETUP — Solo ejecutar UNA VEZ al crear el cliente
// Crea todas las hojas necesarias en el spreadsheet del cliente
// ════════════════════════════════════════════════════════════════════════

/**
 * EJECUTAR UNA SOLA VEZ tras configurar SPREADSHEET_ID.
 * Crea automáticamente todas las hojas: PARAM_SISTEMA, DB_USUARIOS,
 * DB_CLIENTES, DB_INSPECCIONES, DB_ASISTENCIA, DB_HALLAZGOS, etc.
 * Si las hojas ya existen, no las sobrescribe.
 */
function inicializarProduccion() {
  _injectSS_();
  return SST_CORE_MASTER.inicializarBaseDeDatos();
}

// ════════════════════════════════════════════════════════════════════════
// AUTENTICACIÓN
// ════════════════════════════════════════════════════════════════════════

// Valida email + contraseña contra DB_USUARIOS del cliente
function validarCredenciales(email, password) {
  _injectSS_();
  return SST_CORE_MASTER.validarCredenciales(email, password);
}

// ════════════════════════════════════════════════════════════════════════
// GESTIÓN DE CLIENTES / OBRAS
// ════════════════════════════════════════════════════════════════════════

// Retorna la lista de clientes ACTIVOS para el selector de obras (supervisores)
function obtenerClientesRegistrados() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerClientesRegistrados();
}

// Retorna TODOS los clientes para el panel de administración
function obtenerListaClientesAdmin() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerListaClientesAdmin();
}

// Crea o actualiza un cliente en DB_CLIENTES
function guardarCliente(datos) {
  _injectSS_();
  return SST_CORE_MASTER.guardarCliente(datos);
}

// Elimina un cliente de DB_CLIENTES por su ID
function eliminarCliente(id) {
  _injectSS_();
  return SST_CORE_MASTER.eliminarCliente(id);
}

// ════════════════════════════════════════════════════════════════════════
// GESTIÓN DE USUARIOS
// ════════════════════════════════════════════════════════════════════════

// Retorna todos los usuarios para el panel de administración
function obtenerUsuariosAdmin() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerUsuariosAdmin();
}

// Retorna la lista de clientes para el selector de asignación de usuarios
function obtenerClientesParaUsuarios() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerClientesParaUsuarios();
}

// Crea un nuevo usuario en DB_USUARIOS
function crearUsuario(datos) {
  _injectSS_();
  return SST_CORE_MASTER.crearUsuario(datos);
}

// Actualiza los datos de un usuario existente
function actualizarUsuario(datos) {
  _injectSS_();
  return SST_CORE_MASTER.actualizarUsuario(datos);
}

// Elimina un usuario por su email
function eliminarUsuario(email) {
  _injectSS_();
  return SST_CORE_MASTER.eliminarUsuario(email);
}

// Obtiene los datos completos de un usuario por email (recuperación de sesión)
function obtenerDatosUsuario(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerDatosUsuario(email);
}

// Recupera la sesión activa del usuario (cuando localStorage del navegador falla)
function obtenerUsuarioActivo(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerUsuarioActivo(email);
}

// ════════════════════════════════════════════════════════════════════════
// GESTIÓN DE FORMATOS SST (Catálogo de tipos de formatos)
// ════════════════════════════════════════════════════════════════════════

// Retorna los formatos disponibles para una empresa específica
function obtenerFormatosPorEmpresa(empresa) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerFormatosPorEmpresa(empresa);
}

// Retorna todos los formatos para el panel de administración
function obtenerFormatosAdmin() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerFormatosAdmin();
}

// Retorna los formatos asignados a un supervisor específico
function obtenerFormatosSST(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerFormatosSST(email);
}

// Crea un nuevo tipo de formato en LISTAS_FORMATOS
function crearFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.crearFormato(datos);
}

// Actualiza un formato existente en LISTAS_FORMATOS
function actualizarFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.actualizarFormato(datos);
}

// Elimina un formato del catálogo
function eliminarFormato(id) {
  _injectSS_();
  return SST_CORE_MASTER.eliminarFormato(id);
}

// ════════════════════════════════════════════════════════════════════════
// REGISTROS DE FORMATOS / INSPECCIONES (DB_INSPECCIONES)
// Aquí se guardan las evidencias fotográficas de cada formato diligenciado
// ════════════════════════════════════════════════════════════════════════

// Guarda un nuevo registro de formato con foto en DB_INSPECCIONES y Drive
// REQUIERE: DRIVE_ROOT_FOLDER_ID configurado en PARAM_SISTEMA
function guardarRegistroFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.guardarRegistroFormato(datos);
}

// Obtiene los registros PENDIENTES de firma para un supervisor
function obtenerRegistrosPendientes(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerRegistrosPendientes(email);
}

// Cierra un registro de formato con foto de firma
// REQUIERE: DRIVE_ROOT_FOLDER_ID configurado en PARAM_SISTEMA
function cerrarRegistroFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.cerrarRegistroFormato(datos);
}

// ════════════════════════════════════════════════════════════════════════
// PANEL GESTIÓN DE FORMATOS (vista del gestor/ADMIN)
// ════════════════════════════════════════════════════════════════════════

// Obtiene los formatos pendientes para gestión del administrador
function obtenerFormatosPendientes(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerFormatosPendientes(email);
}

// Guarda la gestión realizada sobre un formato
function guardarGestionFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.guardarGestionFormato(datos);
}

// Cierra un formato gestionado
function cerrarFormato(datos) {
  _injectSS_();
  return SST_CORE_MASTER.cerrarFormato(datos);
}

// ════════════════════════════════════════════════════════════════════════
// HALLAZGOS / EVIDENCIAS DE CAMPO (DB_HALLAZGOS)
// ════════════════════════════════════════════════════════════════════════

// Guarda un nuevo hallazgo con foto en DB_HALLAZGOS y Drive
// REQUIERE: DRIVE_ROOT_FOLDER_ID configurado en PARAM_SISTEMA
function guardarHallazgo(datos) {
  _injectSS_();
  return SST_CORE_MASTER.guardarHallazgo(datos);
}

// Obtiene todos los hallazgos para la galería del administrador
function obtenerGaleriaHallazgosAdmin() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerGaleriaHallazgosAdmin();
}

// Obtiene todos los registros de formatos para la galería del administrador
function obtenerGaleriaFormatos() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerGaleriaFormatos();
}

// ════════════════════════════════════════════════════════════════════════
// CONTROL DE ASISTENCIA / JORNADAS (DB_ASISTENCIA)
// ════════════════════════════════════════════════════════════════════════

// Obtiene todos los registros de asistencia para el panel de administración
function obtenerAsistenciaAdmin() {
  _injectSS_();
  return SST_CORE_MASTER.obtenerAsistenciaAdmin();
}

// Verifica si un supervisor tiene jornada activa hoy
function obtenerEstadoAsistencia(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerEstadoAsistencia(email);
}

// Registra el INGRESO (inicio de jornada) con foto selfie en DB_ASISTENCIA
// REQUIERE: DRIVE_ROOT_FOLDER_ID configurado en PARAM_SISTEMA
function registrarIngreso(datos) {
  _injectSS_();
  return SST_CORE_MASTER.registrarIngreso(datos);
}

// Registra la SALIDA (fin de jornada) con foto selfie en DB_ASISTENCIA
// REQUIERE: DRIVE_ROOT_FOLDER_ID configurado en PARAM_SISTEMA
function registrarSalida(datos) {
  _injectSS_();
  return SST_CORE_MASTER.registrarSalida(datos);
}

// BATCH: obtiene clientes + estado de asistencia en una sola llamada al servidor
// Usado al iniciar el panel del supervisor para reducir latencia
function obtenerDatosPanelSupervisor(email) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerDatosPanelSupervisor(email);
}

// ════════════════════════════════════════════════════════════════════════
// REPORTES Y MÉTRICAS
// ════════════════════════════════════════════════════════════════════════

// Obtiene métricas de desempeño por supervisor para el panel de administración
function obtenerMetricasSupervisoresSTT(params) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerMetricasSupervisoresSTT(params);
}

// Obtiene el reporte detallado de desempeño SST
function obtenerReporteDesempenoSTT(params) {
  _injectSS_();
  return SST_CORE_MASTER.obtenerReporteDesempenoSTT(params);
}

// ════════════════════════════════════════════════════════════════════════
// UTILIDADES
// ════════════════════════════════════════════════════════════════════════

// Retorna la URL pública de esta Web App (usada para redirección al login)
// NOTA: esta función NO inyecta el spreadsheet — no lo necesita
function getScriptUrl() {
  return SST_CORE_MASTER.getScriptUrl();
}

// Invalida la caché de parámetros del sistema para que se recarguen desde Sheets
// Útil después de modificar PARAM_SISTEMA manualmente
function invalidarCacheParametros() {
  _injectSS_();
  return SST_CORE_MASTER.invalidarCacheParametros();
}
```

---

# PARTE 4 — REFERENCIA RÁPIDA DE PARAM_SISTEMA

> Esta tabla es la referencia completa de todos los parámetros que se pueden configurar en la hoja PARAM_SISTEMA del spreadsheet del cliente.

| Parámetro | Obligatorio | Ejemplo de valor | Descripción |
|---|---|---|---|
| `COLOR_PRIMARIO` | No (auto) | `#C5A048` | Color principal de la interfaz. Se extrae del logo automáticamente si se deja vacío y hay GEMINI_API_KEY |
| `COLOR_ACENTO` | No (auto) | `#D4AF37` | Color secundario. También se extrae del logo |
| `COLOR_FONDO` | Recomendado | `#101922` | Color de fondo oscuro de la app |
| `URL_LOGO` | Recomendado | URL de Drive o web | Logo que aparece en la interfaz. Formatos: `/file/d/ID/view`, `/open?id=ID`, URL directa |
| `NOMBRE_EMPRESA` | Sí | `SECURITY WORK S&M` | Nombre del cliente que aparece en la app |
| `DRIVE_ROOT_FOLDER_ID` | **Sí** | `https://drive.google.com/drive/folders/1ABC...` | **Carpeta raíz para TODAS las fotos del cliente. Sin esto las fotos no se guardan.** |
| `GEMINI_API_KEY` | No | `AIzaSy...` | API Key de Google Gemini. Necesaria para extracción automática de colores del logo |
| `OPEN_AI_KEY` | No | `sk-...` | API Key de OpenAI. Usada para análisis IA de hallazgos (funcionalidad premium) |
| `CUENTA` | **Sí** | `ACTIVA` | `ACTIVA` = todos los usuarios pueden iniciar sesión. `INACTIVA` = acceso bloqueado para todos |

---

# PARTE 5 — ESTRUCTURA DE CARPETAS EN GOOGLE DRIVE

Cuando se configura `DRIVE_ROOT_FOLDER_ID`, el sistema crea automáticamente la siguiente estructura al guardar las primeras fotos:

```
📁 [Carpeta raíz — DRIVE_ROOT_FOLDER_ID]
├── 📁 CONTROL_ASISTENCIAS
│   ├── 📷 JuanPerez_28022026_0800_ENTRADA.png
│   ├── 📷 JuanPerez_28022026_1730_SALIDA.png
│   └── ...
└── 📁 BD_CLIENTES
    ├── 📁 JAS_TRANSPORTE
    │   ├── 📁 FORMATOS
    │   │   ├── 📷 JAS_TRANSPORTE_28022026_0930_ATS.png
    │   │   └── ...
    │   └── 📁 DE_HALLAZGOS
    │       ├── 📷 JAS_TRANSPORTE_28022026_1100_CableExpuesto.png
    │       └── ...
    └── 📁 Eurolaminados
        └── ...
```

---

# PARTE 6 — SOLUCIÓN DE PROBLEMAS COMUNES

| Síntoma | Causa más probable | Solución |
|---|---|---|
| Modal de inicio de jornada no carga | Cold start de GAS (primera vez del día) | Esperar 10-15 segundos. Es normal en el primer uso |
| Selector "Obra / Proyecto" vacío | DB_CLIENTES está vacío o sin filas ACTIVO | Agregar al menos una fila en DB_CLIENTES con Estado = ACTIVO |
| Todas las fotos quedan "Sin foto" | DRIVE_ROOT_FOLDER_ID vacío O Drive no autorizado | Configurar DRIVE_ROOT_FOLDER_ID en PARAM_SISTEMA y re-autorizar la app |
| Login falla con usuario correcto | CUENTA = INACTIVA en PARAM_SISTEMA | Cambiar CUENTA a ACTIVA en PARAM_SISTEMA |
| Cambios en PARAM_SISTEMA no se reflejan | Cache activo (30 min TTL) | Ejecutar `invalidarCacheParametros()` desde el editor o editar la celda de PARAM_SISTEMA |
| App muestra datos del cliente equivocado | SPREADSHEET_ID no configurado en Script Properties | Verificar en ⚙️ → Propiedades del script → SPREADSHEET_ID |
| Error al compartir la app | Web App desplegada como "Usuario que accede" | Re-desplegar como "Yo (cuenta ITELSA)" |

---

# PARTE 7 — CHECKLIST DE ENTREGA AL CLIENTE

Al finalizar el despliegue, entregar al cliente:

- [ ] **URL de la Web App** (formato: `https://script.google.com/macros/s/.../exec`)
- [ ] **Credenciales del ADMIN:** email y contraseña temporal
- [ ] **Credenciales de supervisores:** email y contraseña por cada supervisor
- [ ] **Instrucciones de primer uso:** cambiar contraseña, tomar foto de prueba
- [ ] **Contacto de soporte:** email/WhatsApp de ITELSA para incidencias

---

*Documento generado por ITELSA IA · Sistema SST Control de Campo*
*Para actualizar este documento contactar al equipo técnico de ITELSA*
