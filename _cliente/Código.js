/**
 * TEMPLATE — Código.gs para proyectos cliente
 * ════════════════════════════════════════════════════════════════════
 * INSTRUCCIONES PARA CADA NUEVO CLIENTE:
 *
 *  1. Crear un nuevo proyecto GAS vacío para el cliente
 *  2. Copiar TODO este contenido en su Código.gs
 *  3. En ⚙️ Configuración del proyecto → Propiedades del script → agregar:
 *       SPREADSHEET_ID = <ID del Google Sheet del cliente>
 *  4. Ir a Bibliotecas → agregar SST_CORE_MASTER con la última versión
 *  5. Ejecutar inicializarProduccion() UNA SOLA VEZ para crear las hojas
 *  6. Implementar como Web App (Ejecutar como: Yo / Acceso: Cualquier usuario)
 * ════════════════════════════════════════════════════════════════════
 */

// Lee el SPREADSHEET_ID del Script Property de ESTE proyecto cliente
// (cada cliente tiene el suyo propio — nunca se mezclan entre clientes)
var _SS_ = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';

// ── Función auxiliar: inyecta el ID en la biblioteca antes de cada llamada ──
function _injectSS_() { SST_CORE_MASTER.setSpreadsheetId(_SS_); }

// ═══════════════════════════════════════════════════════
// ENTRY POINTS — Web App
// ═══════════════════════════════════════════════════════
function doGet(e)  { _injectSS_(); return SST_CORE_MASTER.doGet(e);  }
function doPost(e) { _injectSS_(); return SST_CORE_MASTER.doPost(e); }

// ═══════════════════════════════════════════════════════
// SETUP — Ejecutar UNA SOLA VEZ al crear el cliente
// ═══════════════════════════════════════════════════════
function inicializarProduccion() {
  _injectSS_();
  return SST_CORE_MASTER.inicializarBaseDeDatos();
}

// ═══════════════════════════════════════════════════════
// FUNCIONES BACKEND — Re-exportadas para google.script.run
// Cada función inyecta primero el spreadsheet del cliente.
// NO modificar la lógica aquí — toda la lógica vive en SST_CORE_MASTER.
// ═══════════════════════════════════════════════════════

function validarCredenciales(email, password)     { _injectSS_(); return SST_CORE_MASTER.validarCredenciales(email, password); }

function obtenerClientesRegistrados()             { _injectSS_(); return SST_CORE_MASTER.obtenerClientesRegistrados(); }
function obtenerListaClientesAdmin()              { _injectSS_(); return SST_CORE_MASTER.obtenerListaClientesAdmin(); }
function guardarCliente(datos)                    { _injectSS_(); return SST_CORE_MASTER.guardarCliente(datos); }
function eliminarCliente(id)                      { _injectSS_(); return SST_CORE_MASTER.eliminarCliente(id); }

function obtenerUsuariosAdmin()                   { _injectSS_(); return SST_CORE_MASTER.obtenerUsuariosAdmin(); }
function obtenerClientesParaUsuarios()            { _injectSS_(); return SST_CORE_MASTER.obtenerClientesParaUsuarios(); }
function crearUsuario(datos)                      { _injectSS_(); return SST_CORE_MASTER.crearUsuario(datos); }
function actualizarUsuario(datos)                 { _injectSS_(); return SST_CORE_MASTER.actualizarUsuario(datos); }
function eliminarUsuario(email)                   { _injectSS_(); return SST_CORE_MASTER.eliminarUsuario(email); }
function obtenerDatosUsuario(email)               { _injectSS_(); return SST_CORE_MASTER.obtenerDatosUsuario(email); }
function obtenerUsuarioActivo(email)              { _injectSS_(); return SST_CORE_MASTER.obtenerUsuarioActivo(email); }

function obtenerFormatosPorEmpresa(empresa)       { _injectSS_(); return SST_CORE_MASTER.obtenerFormatosPorEmpresa(empresa); }
function obtenerFormatosAdmin()                   { _injectSS_(); return SST_CORE_MASTER.obtenerFormatosAdmin(); }
function obtenerFormatosSST(email)                { _injectSS_(); return SST_CORE_MASTER.obtenerFormatosSST(email); }
function crearFormato(datos)                      { _injectSS_(); return SST_CORE_MASTER.crearFormato(datos); }
function actualizarFormato(datos)                 { _injectSS_(); return SST_CORE_MASTER.actualizarFormato(datos); }
function eliminarFormato(id)                      { _injectSS_(); return SST_CORE_MASTER.eliminarFormato(id); }

function guardarRegistroFormato(datos)            { _injectSS_(); return SST_CORE_MASTER.guardarRegistroFormato(datos); }
function obtenerRegistrosPendientes(email)        { _injectSS_(); return SST_CORE_MASTER.obtenerRegistrosPendientes(email); }
function cerrarRegistroFormato(datos)             { _injectSS_(); return SST_CORE_MASTER.cerrarRegistroFormato(datos); }

function obtenerFormatosPendientes(email)         { _injectSS_(); return SST_CORE_MASTER.obtenerFormatosPendientes(email); }
function guardarGestionFormato(datos)             { _injectSS_(); return SST_CORE_MASTER.guardarGestionFormato(datos); }
function cerrarFormato(datos)                     { _injectSS_(); return SST_CORE_MASTER.cerrarFormato(datos); }

function guardarHallazgo(datos)                   { _injectSS_(); return SST_CORE_MASTER.guardarHallazgo(datos); }
function obtenerGaleriaHallazgosAdmin()           { _injectSS_(); return SST_CORE_MASTER.obtenerGaleriaHallazgosAdmin(); }

function obtenerAsistenciaAdmin()                 { _injectSS_(); return SST_CORE_MASTER.obtenerAsistenciaAdmin(); }
function obtenerEstadoAsistencia(email)           { _injectSS_(); return SST_CORE_MASTER.obtenerEstadoAsistencia(email); }
function registrarIngreso(datos)                  { _injectSS_(); return SST_CORE_MASTER.registrarIngreso(datos); }

function obtenerMetricasSupervisoresSTT(params)   { _injectSS_(); return SST_CORE_MASTER.obtenerMetricasSupervisoresSTT(params); }
function obtenerReporteDesempenoSTT(params)       { _injectSS_(); return SST_CORE_MASTER.obtenerReporteDesempenoSTT(params); }

function getScriptUrl()                           { return SST_CORE_MASTER.getScriptUrl(); }
function invalidarCacheParametros()               { _injectSS_(); return SST_CORE_MASTER.invalidarCacheParametros(); }
