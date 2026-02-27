/**
 * BACKEND.gs
 * Lógica principal para el procesamiento de datos de inspección.
 * Este archivo maneja la comunicación entre el Frontend y Google Sheets / Drive.
 */

// ══════════════════════════════════════════════════════════
// MULTI-TENANT — ID de spreadsheet por ejecución
// Cada proyecto cliente inyecta su propio SPREADSHEET_ID
// llamando a setSpreadsheetId() antes de cualquier función.
// ══════════════════════════════════════════════════════════
let _ss_ = null;
let _CLIENT_SPREADSHEET_ID_ = null;

/**
 * Inyecta el spreadsheet ID del cliente que llama a la biblioteca.
 * Llamar al inicio de cada función wrapper en el proyecto cliente.
 */
function setSpreadsheetId(id) {
  if (id && id !== _CLIENT_SPREADSHEET_ID_) {
    _CLIENT_SPREADSHEET_ID_ = id;
    _ss_ = null; // Resetear singleton para usar el nuevo ID
  }
}

function _getSpreadsheet() {
  if (!_ss_) {
    // 1. ID inyectado por el cliente via setSpreadsheetId()
    const id = _CLIENT_SPREADSHEET_ID_ || CONFIG.SPREADSHEET_ID;
    if (id) {
      _ss_ = SpreadsheetApp.openById(id);
    } else {
      try { _ss_ = SpreadsheetApp.getActiveSpreadsheet(); } catch(e) {}
    }
  }
  return _ss_;
}

/**
 * Función principal para guardar un nuevo registro de formato.
 * Reemplaza la funcionalidad de guardarInspeccion.
 * 
 * @param {Object} data Objeto enviado desde el formulario.
 * @return {Object} Respuesta estandarizada JSON.
 */
function guardarInspeccion(data) {
  return guardarRegistroFormato(data);
}

function guardarRegistroFormato(data) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); // Esperar hasta 10s para evitar duplicados en concurrencia

    const ss = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    const nombreEmpresa = data.nombreCliente || "Empresa_General";

    // 1. Generar ID bajo lock para garantizar unicidad
    const idRegistro = _generarProximoIdRegistro(data.idFormato, ss);
    const fechaHora  = new Date();

    // 2. Guardar foto inicial en Drive → ROOT/[Empresa]/Evidencia_Formatos/
    let urlFoto = "Sin foto";
    if (data.archivoBase64) {
      try {
        const params        = getParametros().data || {};
        const idCarpetaRaiz = params.DRIVE_ROOT_FOLDER_ID;
        const nombreArchivo = 'Formato_' + _sanitizeName(idRegistro) + '_' + _sanitizeName(nombreEmpresa) + '_' + _fechaParaNombre() + '.png';
        urlFoto = guardarImagenEnDrive(
          data.archivoBase64, nombreArchivo, nombreEmpresa, idCarpetaRaiz, 'Evidencia_Formatos'
        );
      } catch (eDrive) {
        Logger.log('Advertencia: no se pudo guardar foto inicial: ' + eDrive.toString());
      }
    }

    // 3. Preparar fila — orden exacto del sheet DB_INSPECCIONES:
    // A:Id_formato | B:Consecutivo | C:Descripcion_Formato | D:Fecha_Hora
    // E:Empresa_Contratista | F:Foto_Formato_URL | G:Reportado_Por | H:Estado
    // I:Foto_Firma_URL | J:Fecha_Cierre
    const nuevaFila = [
      data.idFormato,              // A: Id_formato        (ATS)
      idRegistro,                  // B: Consecutivo       (FMT-ATS-0001)
      data.descripcionRegistro || "", // C: Descripcion_Formato
      fechaHora,                   // D: Fecha_Hora
      nombreEmpresa,               // E: Empresa_Contratista
      urlFoto,                     // F: Foto_Formato_URL
      data.userCode || "",         // G: Reportado_Por     (SUP-001)
      "PENDIENTE",                 // H: Estado
      "",                          // I: Foto_Firma_URL — se rellena al cerrar
      ""                           // J: Fecha_Cierre   — se rellena al cerrar
    ];

    hoja.appendRow(nuevaFila);
    SpreadsheetApp.flush();

    return {
      status: "success",
      message: "Formato registrado correctamente con ID: " + idRegistro,
      data: { id: idRegistro }
    };

  } catch (e) {
    Logger.log("Error en guardarRegistroFormato: " + e.toString());
    return { status: "error", message: "Error al guardar el registro: " + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Wrapper para PanelGestionFormatos que mapea los nombres de campo.
 * PanelGestionFormatos envía: { idFormato, descripcionFormato, nombreEmpresa, archivoBase64, userCode }
 * guardarRegistroFormato espera: { idFormato, descripcionRegistro, nombreCliente, archivoBase64, userCode }
 */
function guardarGestionFormato(data) {
  return guardarRegistroFormato({
    idFormato:           data.idFormato,
    descripcionRegistro: data.descripcionFormato || '',
    nombreCliente:       data.nombreEmpresa || 'Empresa_General',
    archivoBase64:       data.archivoBase64,
    userCode:            data.userCode || ''
  });
}

/**
 * Genera el próximo ID correlativo para un formato específico.
 * Lee solo la columna A para mayor eficiencia.
 */
function _generarProximoIdRegistro(idFormato, ss) {
  const hoja    = ss.getSheetByName('DB_INSPECCIONES');
  const lastRow = hoja.getLastRow();
  if (lastRow < 2) return `FMT-${idFormato}-0001`;

  // Solo columna A en lugar de getDataRange() completo
  const colA     = hoja.getRange(2, 1, lastRow - 1, 1).getValues();
  let   contador = 0;
  const idStr    = String(idFormato).trim();

  for (let i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === idStr) contador++;
  }

  return `FMT-${idFormato}-${String(contador + 1).padStart(4, '0')}`;
}

/**
 * Obtiene los formatos disponibles para una empresa específica.
 */
/**
 * Obtiene los formatos disponibles para una empresa específica.
 * Schema LISTAS_FORMATOS: Id_Formato | Descripcion_Formato | Tipo_Documento | Empresa_Contratista
 * Filtra por Empresa_Contratista (col D, índice 3).
 * Si no hay empresa o la celda está vacía, retorna el formato para todos.
 */
function obtenerFormatosPorEmpresa(nombreEmpresa) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return { status: "success", data: [] };

    const data     = hoja.getDataRange().getValues();
    const formatos = [];
    const empresaBuscar = (nombreEmpresa || '').toString().trim().toLowerCase();

    for (let i = 1; i < data.length; i++) {
      const idFormato   = (data[i][0] || '').toString().trim();
      const descripcion = (data[i][1] || '').toString().trim();
      const empresa     = (data[i][3] || '').toString().trim().toLowerCase();

      if (!idFormato) continue; // Saltar filas vacías

      // Incluir si la empresa coincide O si la celda empresa está vacía (formato global)
      if (!empresa || empresa === empresaBuscar) {
        formatos.push({ id: idFormato, descripcion: descripcion });
      }
    }

    return { status: "success", data: formatos };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * Cierra un registro de formato, captura la foto de firma y actualiza la hoja.
 * @param {string} idRegistro   ID del registro a cerrar (ej: FMT-ATS-001-0001).
 * @param {string} [archivoBase64] Foto del formato firmado en base64 (opcional).
 * @return {Object} Respuesta estandarizada.
 */
function cerrarRegistroFormato(idRegistro, archivoBase64) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    const data = hoja.getDataRange().getValues();

    // Schema: A(1)=Id_formato | B(2)=Consecutivo | C(3)=Desc | D(4)=Fecha
    //         E(5)=Empresa | F(6)=Foto_URL | G(7)=Reportado_Por
    //         H(8)=Estado | I(9)=Foto_Firma_URL | J(10)=Fecha_Cierre
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === idRegistro) {  // Buscar en col B (Consecutivo = FMT-ATS-0001)
        const fila        = i + 1;
        const empresa     = data[i][4]; // E: Empresa_Contratista
        const fechaCierre = new Date();

        let urlFirma = '';
        if (archivoBase64) {
          try {
            const params        = getParametros().data || {};
            const idCarpetaRaiz = params.DRIVE_ROOT_FOLDER_ID;
            const nombreArchivo = 'Firma_' + _sanitizeName(idRegistro) + '_' + _sanitizeName(empresa) + '_' + _fechaParaNombre() + '.png';

            urlFirma = guardarImagenEnDrive(
              archivoBase64, nombreArchivo, empresa, idCarpetaRaiz, 'Evidencia_Formatos'
            );
          } catch (eDrive) {
            Logger.log('Advertencia: no se pudo guardar foto de firma: ' + eDrive.toString());
          }
        }

        // H(8)=Estado | I(9)=Foto_Firma_URL | J(10)=Fecha_Cierre
        hoja.getRange(fila, 8).setValue("CERRADO CON FIRMA");
        hoja.getRange(fila, 9).setValue(urlFirma || 'Sin foto firma');
        hoja.getRange(fila, 10).setValue(fechaCierre);
        SpreadsheetApp.flush();

        return { status: "success", message: "Registro cerrado con firma exitosamente." };
      }
    }
    return { status: "error", message: "No se encontró el registro con ID: " + idRegistro };
  } catch (e) {
    Logger.log("Error en cerrarRegistroFormato: " + e.toString());
    return { status: "error", message: e.toString() };
  }
}

/**
 * Obtiene los registros pendientes de un supervisor para una fecha específica.
 */
function obtenerRegistrosPendientes(email, fecha) {
  try {
    const ss = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    if (!hoja) return { status: "success", data: [] };
    
    const datos = hoja.getDataRange().getValues();
    const user = getUserDataFromApp(email);
    const code = user.codigo || "";
    
    const pendientes = [];
    const fechaBusqueda = fecha || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
    
    // Schema: A(0)=Id_formato | B(1)=Consecutivo | C(2)=Descripcion_Formato
    //         D(3)=Fecha_Hora | E(4)=Empresa_Contratista | F(5)=Foto_Formato_URL
    //         G(6)=Reportado_Por | H(7)=Estado | I(8)=Foto_Firma_URL | J(9)=Fecha_Cierre
    for (let i = 1; i < datos.length; i++) {
      const idFormato   = (datos[i][0] || '').toString().trim();
      const consecutivo = (datos[i][1] || '').toString().trim();
      if (!consecutivo) continue; // saltar filas vacías

      let fechaFila = '';
      try {
        fechaFila = Utilities.formatDate(datos[i][3], Session.getScriptTimeZone(), "dd/MM/yyyy");
      } catch(e) {
        fechaFila = datos[i][3] ? datos[i][3].toString() : '';
      }

      const reportadoPor = (datos[i][6] || '').toString().trim(); // G: Reportado_Por
      const estado       = (datos[i][7] || '').toString().trim(); // H: Estado

      if (reportadoPor === code && estado === "PENDIENTE") {
        pendientes.push({
          id:          consecutivo,    // FMT-ATS-0001
          formato:     idFormato,      // ATS
          descripcion: datos[i][2],    // Descripcion_Formato
          empresa:     datos[i][4],    // Empresa_Contratista
          fecha:       fechaFila
        });
      }
    }
    return { status: "success", data: pendientes };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * Devuelve el nombre de la subcarpeta de Drive correspondiente al tipo de documento del formato.
 * Consulta LISTAS_FORMATOS por Id_Formato + Empresa_Contratista.
 * Mapeo: Inspeccion→Inspecciones | Permiso→Permisos | Registro→Registros | Ejecucion→Ejecucion
 * Fallback si no se encuentra: 'FORMATOS_GESTIONADOS'.
 *
 * @param {string} idFormato      Código del formato (ej: 'ATS', 'PMA').
 * @param {string} empresa        Nombre de la empresa contratista.
 * @param {Object} ss             Instancia del Spreadsheet ya abierto.
 * @return {string} Nombre de la subcarpeta de destino.
 */
function _subcarpetaPorTipo_(idFormato, empresa, ss) {
  const MAPA = {
    'inspeccion':  'Inspecciones',
    'permiso':     'Permisos',
    'registro':    'Registros',
    'ejecucion':   'Ejecucion'
  };
  try {
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return 'FORMATOS_GESTIONADOS';
    const filas = hoja.getDataRange().getValues();
    const idBusca  = (idFormato || '').toString().trim().toUpperCase();
    const empBusca = (empresa   || '').toString().trim().toLowerCase();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim().toUpperCase() === idBusca &&
          (filas[i][3] || '').toString().trim().toLowerCase() === empBusca) {
        const tipo = (filas[i][2] || '').toString().trim().toLowerCase();
        return MAPA[tipo] || 'FORMATOS_GESTIONADOS';
      }
    }
  } catch (e) {
    Logger.log('_subcarpetaPorTipo_: ' + e.toString());
  }
  return 'FORMATOS_GESTIONADOS';
}

/**
 * Procesa la cadena Base64 y guarda la imagen en una estructura de carpetas:
 * [Carpeta Raíz del Cliente Security Work] / [Nombre del Cliente Final (Ej: Argos)] / [Archivo]
 *
 * @param {String} base64Data Datos de la imagen en formato base64.
 * @param {String} nombreArchivo Nombre descriptivo para el archivo.
 * @param {String} nombreEmpresa Nombre del cliente final para la subcarpeta.
 * @param {String} idCarpetaRaiz ID de la carpeta principal de Security Work.
 * @return {String} URL pública de visualización de la imagen.
 */
/**
 * Guarda una imagen Base64 en Drive dentro de [Raíz]/[Empresa]/[subCarpeta (opcional)].
 * @param {string} base64Data   Datos base64 (data:image/...;base64,...).
 * @param {string} nombreArchivo Nombre del archivo a crear.
 * @param {string} nombreEmpresa Nombre de la empresa (subcarpeta de cliente).
 * @param {string} idCarpetaRaiz ID de la carpeta raíz en Drive.
 * @param {string} [subCarpeta] Nombre de subcarpeta adicional (ej: 'FORMATOS_GESTIONADOS').
 * @return {string} URL pública del archivo creado.
 */
/**
 * Extrae el ID de carpeta desde una URL de Google Drive o lo retorna tal cual si ya es un ID.
 * Soporta: https://drive.google.com/drive/folders/FOLDER_ID, o solo FOLDER_ID
 */
function _parseFolderId(valor) {
  if (!valor) return null;
  var str = valor.toString().trim();
  // Si contiene /folders/, extraer el ID
  var match = str.match(/folders\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  // Si no tiene slashes ni puntos, asumir que ya es un ID
  if (str.indexOf('/') === -1 && str.indexOf('.') === -1) return str;
  return str;
}

/**
 * Formatea una fecha como DD_MM_YYYY para usar en nombres de archivo.
 * @param {Date} [fecha] Fecha a formatear (por defecto: ahora).
 * @return {string} Ej: "27_02_2026"
 */
function _fechaParaNombre(fecha) {
  var d = fecha || new Date();
  var dd = ('0' + d.getDate()).slice(-2);
  var mm = ('0' + (d.getMonth() + 1)).slice(-2);
  var yyyy = d.getFullYear();
  return dd + '_' + mm + '_' + yyyy;
}

/**
 * Limpia un string para usarlo como nombre de archivo/carpeta.
 * Reemplaza espacios por _ y elimina caracteres especiales.
 * @param {string} str Texto a limpiar.
 * @return {string} Texto seguro para nombres de archivo.
 */
function _sanitizeName(str) {
  if (!str) return 'General';
  return str.toString().trim()
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_');
}

/**
 * Guarda una imagen Base64 en Drive.
 * Estructura de carpetas:
 *   - Con empresa: ROOT / [Empresa] / [subCarpeta] / archivo
 *   - Sin empresa (null/vacío): ROOT / [subCarpeta] / archivo
 *
 * @param {string} base64Data   Datos base64 (data:image/...;base64,...).
 * @param {string} nombreArchivo Nombre del archivo a crear.
 * @param {string} nombreEmpresa Nombre de la empresa (null para carpeta raíz directa).
 * @param {string} idCarpetaRaiz ID o URL de la carpeta raíz en Drive.
 * @param {string} [subCarpeta]  Subcarpeta (ej: 'Evidencia_Formatos').
 * @return {string} URL pública del archivo creado.
 */
function guardarImagenEnDrive(base64Data, nombreArchivo, nombreEmpresa, idCarpetaRaiz, subCarpeta) {
  // 1. Decodificar la imagen
  var partes = base64Data.split(',');
  var contentType = partes[0].split(':')[1].split(';')[0];
  var decodedData = Utilities.base64Decode(partes[1]);
  var blob = Utilities.newBlob(decodedData, contentType, nombreArchivo);

  // 2. Carpeta raíz (soporta URL completa o solo ID)
  var folderId = _parseFolderId(idCarpetaRaiz);
  var carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(folderId);
  } catch (e) {
    Logger.log("Error al acceder a la carpeta raíz: " + e.toString());
    var iterador = DriveApp.getFoldersByName("SST_RESPALDO_EV");
    carpetaRaiz = iterador.hasNext() ? iterador.next() : DriveApp.createFolder("SST_RESPALDO_EV");
  }

  // 3. Determinar carpeta base: con empresa → ROOT/[Empresa], sin empresa → ROOT
  var carpetaBase = carpetaRaiz;
  var empSanitized = nombreEmpresa ? _sanitizeName(nombreEmpresa) : '';
  if (empSanitized) {
    var iterCliente = carpetaRaiz.getFoldersByName(empSanitized);
    carpetaBase = iterCliente.hasNext()
      ? iterCliente.next()
      : carpetaRaiz.createFolder(empSanitized);
  }

  // 4. Subcarpeta adicional si se especificó (ej: Evidencia_Formatos)
  var carpetaDestino = carpetaBase;
  if (subCarpeta) {
    var iterSub = carpetaBase.getFoldersByName(subCarpeta);
    carpetaDestino = iterSub.hasNext()
      ? iterSub.next()
      : carpetaBase.createFolder(subCarpeta);
  }

  // 5. Crear archivo y dar permisos de lectura
  var archivo = carpetaDestino.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return archivo.getUrl();
}

/**
 * Schema DB_CLIENTES (9 columnas):
 * A(0):ID_Cliente | B(1):Nombre_Empresa | C(2):Direccion | D(3):NIT
 * E(4):Correo_Gerente | F(5):Nombre_Contacto | G(6):Celular_Whatsapp
 * H(7):Nombre_Obra | I(8):Estado
 */

/**
 * Obtiene la lista de clientes ACTIVOS para el selector de supervisores.
 * Filtra por Estado = 'ACTIVO' (también incluye registros sin estado configurado).
 * @return {Object} Respuesta con la lista de clientes activos.
 */
function obtenerClientesRegistrados() {
  try {
    const ss    = _getSpreadsheet();
    const hoja  = ss.getSheetByName('DB_CLIENTES');
    if (!hoja) return { status: 'success', data: [] };

    const datos    = hoja.getDataRange().getValues();
    const clientes = [];

    for (let i = 1; i < datos.length; i++) {
      const id     = (datos[i][0] || '').toString().trim();
      const nombre = (datos[i][1] || '').toString().trim();
      const estado = (datos[i][8] || 'ACTIVO').toString().trim().toUpperCase();
      // Solo empresas activas (las sin estado configurado se consideran activas)
      if (id && nombre && estado !== 'INACTIVO') {
        clientes.push({
          id:       id,
          nombre:   nombre,
          contacto: (datos[i][5] || '').toString().trim(), // F: Nombre_Contacto (Jefe de Obra)
          celular:  (datos[i][6] || '').toString().trim()  // G: Celular_Whatsapp
        });
      }
    }

    return { status: 'success', data: clientes };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN — CONTROL DE ASISTENCIA
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los registros de DB_ASISTENCIA para el panel de administración.
 * Solo lectura — no modifica ningún dato.
 * Schema DB_ASISTENCIA (11 columnas):
 * A(0):ID_Asistencia | B(1):Email_Supervisor | C(2):Nombre_Completo | D(3):Fecha
 * E(4):Hora_Entrada  | F(5):Hora_Salida      | G(6):Tipo_Dia         | H(7):Obra_Proyecto
 * I(8):Foto_Entrada_URL | J(9):Foto_Salida_URL  | K(10):Estado
 * @return {Object} Lista de registros en orden descendente (más reciente primero).
 */
function obtenerAsistenciaAdmin() {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_ASISTENCIA');
    if (!hoja) return { status: 'success', data: [] };

    const datos     = hoja.getDataRange().getValues();
    const registros = [];

    const tz = Session.getScriptTimeZone();
    const fmtFecha = (v) => {
      if (!v) return '';
      try { return Utilities.formatDate(v instanceof Date ? v : new Date(v), tz, 'dd/MM/yyyy'); }
      catch(e) { return v.toString().trim(); }
    };
    const fmtHora = (v) => {
      if (!v) return '';
      try { return Utilities.formatDate(v instanceof Date ? v : new Date(v), tz, 'HH:mm'); }
      catch(e) { return v.toString().trim(); }
    };

    for (let i = 1; i < datos.length; i++) {
      const id = (datos[i][0] || '').toString().trim();
      if (!id) continue; // Saltar filas vacías

      registros.push({
        id:          id,
        email:       (datos[i][1]  || '').toString().trim(),
        nombre:      (datos[i][2]  || '').toString().trim(),
        fecha:       fmtFecha(datos[i][3]),
        horaEntrada: fmtHora(datos[i][4]),
        horaSalida:  fmtHora(datos[i][5]),
        tipoDia:     (datos[i][6]  || '').toString().trim(),
        obra:        (datos[i][7]  || '').toString().trim(),
        fotoEntrada: (datos[i][8]  || '').toString().trim(),
        fotoSalida:  (datos[i][9]  || '').toString().trim(),
        estado:      (datos[i][10] || 'CERRADO').toString().trim().toUpperCase()
      });
    }

    // Más reciente primero
    registros.reverse();
    return { status: 'success', data: registros };
  } catch (e) {
    Logger.log('Error en obtenerAsistenciaAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN DE USUARIOS
// Schema ACTUAL DB_USUARIOS (8 columnas):
//   A(0)=Email  B(1)=Nombre_Completo  C(2)=Rol  D(3)=Password
//   E(4)=ID_Cliente_Asociado (código usuario: ADMIN-001, SUP-001…)
//   F(5)=Cedula  G(6)=Celular_Whatsapp  H(7)=Estado (ACTIVO/INACTIVO)
// Clave de búsqueda: col E (código único por usuario)
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los usuarios (sin contraseña) para el panel admin.
 */
function obtenerUsuariosAdmin() {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'success', data: [] };

    const datos    = hoja.getDataRange().getValues();
    const usuarios = [];
    for (let i = 1; i < datos.length; i++) {
      const email = (datos[i][0] || '').toString().trim();
      if (!email) continue;
      usuarios.push({
        id:      (datos[i][4] || '').toString().trim(), // col E = código usuario
        email:   email,                                  // col A
        nombre:  (datos[i][1] || '').toString().trim(), // col B
        rol:     (datos[i][2] || '').toString().trim(), // col C
        cedula:  (datos[i][5] || '').toString().trim(), // col F
        celular: (datos[i][6] || '').toString().trim(), // col G
        estado:  (datos[i][7] || 'ACTIVO').toString().trim().toUpperCase() // col H
      });
    }
    return { status: 'success', data: usuarios };
  } catch (e) {
    Logger.log('Error en obtenerUsuariosAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Genera el próximo código de usuario según el prefijo del rol.
 * Ej: rol "SUP-SST" → prefijo "SUP" → busca en col E → "SUP-003"
 */
function _generarIdUsuario_(rol, hoja) {
  const prefijo = (rol || '').split('-')[0].toUpperCase() || 'USR';
  const datos   = hoja.getDataRange().getValues();
  let   contador = 0;
  for (let i = 1; i < datos.length; i++) {
    const codigo = (datos[i][4] || '').toString().trim(); // col E
    if (codigo.startsWith(prefijo + '-')) contador++;
  }
  return prefijo + '-' + String(contador + 1).padStart(3, '0');
}

/**
 * Crea un nuevo usuario. Valida email duplicado y genera código automático en col E.
 */
function crearUsuario(datos) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const emailNuevo = (datos.email || '').toString().trim().toLowerCase();
    if (!emailNuevo) return { status: 'error', message: 'El email es obligatorio.' };
    if (!datos.password) return { status: 'error', message: 'La contraseña es obligatoria.' };

    // Verificar email duplicado (col A)
    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim().toLowerCase() === emailNuevo) {
        return { status: 'error', message: 'Ya existe un usuario con ese email.' };
      }
    }

    // Para rol CLI se usa el ID_Cliente de DB_CLIENTES; para otros se genera automáticamente
    let nuevoId;
    if (datos.rol === 'CLI' && datos.idClienteAsociado) {
      nuevoId = datos.idClienteAsociado.toString().trim();
      // Verificar que ese código de cliente no tenga ya un usuario
      for (let i = 1; i < filas.length; i++) {
        if ((filas[i][4] || '').toString().trim() === nuevoId) {
          return { status: 'error', message: 'Ya existe un usuario para el cliente ' + nuevoId + '.' };
        }
      }
    } else {
      nuevoId = _generarIdUsuario_(datos.rol, hoja);
    }
    hoja.appendRow([
      emailNuevo,                                    // A(0): Email
      (datos.nombre  || '').toString().trim(),       // B(1): Nombre_Completo
      (datos.rol     || '').toString().trim(),       // C(2): Rol
      (datos.password|| '').toString(),              // D(3): Password
      nuevoId,                                       // E(4): Código usuario (auto)
      (datos.cedula  || '').toString().trim(),       // F(5): Cedula
      (datos.celular || '').toString().trim(),       // G(6): Celular_Whatsapp
      'ACTIVO'                                       // H(7): Estado
    ]);
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove('db_usuarios_v1');
    return { status: 'success', message: 'Usuario ' + nuevoId + ' creado correctamente.', data: { id: nuevoId } };
  } catch (e) {
    Logger.log('Error en crearUsuario: ' + e.toString());
    return { status: 'error', message: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Actualiza datos de un usuario (busca por col E = código). No cambia email ni password.
 */
function actualizarUsuario(datos) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][4] || '').toString().trim() === datos.id) { // busca por col E
        const fila = i + 1;
        hoja.getRange(fila, 2).setValue((datos.nombre  || '').toString().trim()); // B: Nombre
        hoja.getRange(fila, 3).setValue((datos.rol     || '').toString().trim()); // C: Rol
        hoja.getRange(fila, 6).setValue((datos.cedula  || '').toString().trim()); // F: Cedula
        hoja.getRange(fila, 7).setValue((datos.celular || '').toString().trim()); // G: Celular
        hoja.getRange(fila, 8).setValue((datos.estado  || 'ACTIVO').toString().trim().toUpperCase()); // H: Estado
        SpreadsheetApp.flush();
        CacheService.getScriptCache().remove('db_usuarios_v1');
        return { status: 'success', message: 'Usuario actualizado correctamente.' };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado.' };
  } catch (e) {
    Logger.log('Error en actualizarUsuario: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Resetea la contraseña de un usuario (busca por col E = código).
 */
function resetPasswordUsuario(idUsuario, newPassword) {
  try {
    if (!newPassword || newPassword.toString().length < 4) {
      return { status: 'error', message: 'La contraseña debe tener al menos 4 caracteres.' };
    }
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][4] || '').toString().trim() === idUsuario) { // col E
        hoja.getRange(i + 1, 4).setValue(newPassword.toString()); // D: Password
        SpreadsheetApp.flush();
        CacheService.getScriptCache().remove('db_usuarios_v1');
        return { status: 'success', message: 'Contraseña actualizada correctamente.' };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado.' };
  } catch (e) {
    Logger.log('Error en resetPasswordUsuario: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Elimina físicamente un usuario de DB_USUARIOS (busca por col E = código).
 * No se puede deshacer. Se recomienda desactivar en lugar de eliminar.
 * @param {string} idUsuario Código del usuario (ADMIN-001, SUP-001…).
 * @return {Object} Respuesta estandarizada.
 */
function eliminarUsuario(idUsuario) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = filas.length - 1; i >= 1; i--) {  // De abajo hacia arriba para no desplazar índices
      if ((filas[i][4] || '').toString().trim() === idUsuario.toString().trim()) { // col E
        hoja.deleteRow(i + 1);
        SpreadsheetApp.flush();
        CacheService.getScriptCache().remove('db_usuarios_v1');
        return { status: 'success', message: 'Usuario ' + idUsuario + ' eliminado correctamente.' };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado: ' + idUsuario };
  } catch (e) {
    Logger.log('Error en eliminarUsuario: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Alterna el estado ACTIVO/INACTIVO de un usuario (busca por col E = código).
 */
function toggleEstadoUsuario(idUsuario) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][4] || '').toString().trim() === idUsuario) { // col E
        const estadoActual = (filas[i][7] || 'ACTIVO').toString().trim().toUpperCase(); // col H
        const nuevoEstado  = estadoActual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        hoja.getRange(i + 1, 8).setValue(nuevoEstado); // H: Estado
        SpreadsheetApp.flush();
        CacheService.getScriptCache().remove('db_usuarios_v1');
        return { status: 'success', message: 'Estado cambiado a ' + nuevoEstado + '.', data: { estado: nuevoEstado } };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado.' };
  } catch (e) {
    Logger.log('Error en toggleEstadoUsuario: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Devuelve lista reducida de DB_CLIENTES para poblar el selector de empresa
 * al crear un usuario con rol CLI. Solo expone campos necesarios para el modal.
 * Esquema DB_CLIENTES: A=ID_Cliente B=Nombre_Empresa C=Dirección D=NIT
 *                      E=Correo_Gerente F=Nombre_Contacto G=Celular_Whatsapp H=Nombre_Obra
 */
function obtenerClientesParaUsuarios() {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_CLIENTES');
    if (!hoja) return { status: 'error', message: 'Hoja DB_CLIENTES no encontrada.' };

    const datos    = hoja.getDataRange().getValues();
    const clientes = [];
    for (let i = 1; i < datos.length; i++) {
      const id = (datos[i][0] || '').toString().trim();
      if (!id) continue;
      clientes.push({
        id:       id,                                      // A: ID_Cliente (CLI-001)
        nombre:   (datos[i][1] || '').toString().trim(),  // B: Nombre_Empresa
        correo:   (datos[i][4] || '').toString().trim(),  // E: Correo_Gerente
        contacto: (datos[i][5] || '').toString().trim(),  // F: Nombre_Contacto
        celular:  (datos[i][6] || '').toString().trim()   // G: Celular_Whatsapp
      });
    }
    return { status: 'success', data: clientes };
  } catch (e) {
    Logger.log('Error en obtenerClientesParaUsuarios: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN DE LISTAS_FORMATOS
// Esquema: A(0)=Id_Formato B(1)=Descripcion_Formato
//          C(2)=Tipo_Documento D(3)=Empresa_Contratista
// Clave primaria compuesta: Id_Formato + Empresa_Contratista
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los formatos de LISTAS_FORMATOS para el panel de administración.
 */
function obtenerFormatosAdmin() {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return { status: 'error', message: 'Hoja LISTAS_FORMATOS no encontrada.' };

    const datos    = hoja.getDataRange().getValues();
    const formatos = [];
    for (let i = 1; i < datos.length; i++) {
      const id = (datos[i][0] || '').toString().trim();
      if (!id) continue;
      formatos.push({
        id:          id,
        descripcion: (datos[i][1] || '').toString().trim(), // B: Descripcion_Formato
        tipo:        (datos[i][2] || '').toString().trim(), // C: Tipo_Documento
        empresa:     (datos[i][3] || '').toString().trim()  // D: Empresa_Contratista
      });
    }
    return { status: 'success', data: formatos };
  } catch (e) {
    Logger.log('Error en obtenerFormatosAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Crea un nuevo formato en LISTAS_FORMATOS.
 * Valida que no exista la combinación Id_Formato + Empresa_Contratista.
 */
function crearFormato(datos) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return { status: 'error', message: 'Hoja LISTAS_FORMATOS no encontrada.' };

    const idNuevo = (datos.id      || '').toString().trim().toUpperCase();
    const empresa = (datos.empresa || '').toString().trim();
    if (!idNuevo) return { status: 'error', message: 'El código del formato es obligatorio.' };
    if (!empresa)  return { status: 'error', message: 'La empresa contratista es obligatoria.' };

    // Verificar duplicado (mismo código + misma empresa)
    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim().toUpperCase() === idNuevo &&
          (filas[i][3] || '').toString().trim()                === empresa) {
        return { status: 'error', message: 'Ya existe el formato ' + idNuevo + ' para ' + empresa + '.' };
      }
    }

    hoja.appendRow([
      idNuevo,                                          // A: Id_Formato
      (datos.descripcion || '').toString().trim(),      // B: Descripcion_Formato
      (datos.tipo        || '').toString().trim(),      // C: Tipo_Documento
      empresa                                           // D: Empresa_Contratista
    ]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Formato ' + idNuevo + ' creado correctamente.' };
  } catch (e) {
    Logger.log('Error en crearFormato: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Actualiza un formato de LISTAS_FORMATOS.
 * Busca la fila por datos.idOriginal + datos.empresa (claves originales).
 * Actualiza columnas A (Id_Formato), B (Descripcion) y C (Tipo_Documento).
 * La empresa (col D) nunca cambia — es la clave del cliente.
 */
function actualizarFormato(datos) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return { status: 'error', message: 'Hoja LISTAS_FORMATOS no encontrada.' };

    // Clave original para encontrar la fila
    const idOriginal = ((datos.idOriginal || datos.id) || '').toString().trim().toUpperCase();
    const empBusca   = (datos.empresa || '').toString().trim();
    // Nuevo valor del código (puede ser distinto al original si el usuario lo editó)
    const nuevoId    = (datos.id || '').toString().trim().toUpperCase();
    const filas      = hoja.getDataRange().getValues();

    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim().toUpperCase() === idOriginal &&
          (filas[i][3] || '').toString().trim()                === empBusca) {
        const fila = i + 1;
        hoja.getRange(fila, 1).setValue(nuevoId);                                      // A: Id_Formato
        hoja.getRange(fila, 2).setValue((datos.descripcion || '').toString().trim());   // B: Descripcion
        hoja.getRange(fila, 3).setValue((datos.tipo        || '').toString().trim());   // C: Tipo_Documento
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Formato actualizado correctamente.' };
      }
    }
    return { status: 'error', message: 'Formato no encontrado.' };
  } catch (e) {
    Logger.log('Error en actualizarFormato: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Elimina un formato de LISTAS_FORMATOS por clave compuesta (Id_Formato + Empresa_Contratista).
 */
function eliminarFormato(idFormato, empresa) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_FORMATOS');
    if (!hoja) return { status: 'error', message: 'Hoja LISTAS_FORMATOS no encontrada.' };

    const idBusca  = (idFormato || '').toString().trim().toUpperCase();
    const empBusca = (empresa   || '').toString().trim();
    const filas    = hoja.getDataRange().getValues();

    // Recorrer de abajo hacia arriba para no desplazar índices al eliminar
    for (let i = filas.length - 1; i >= 1; i--) {
      if ((filas[i][0] || '').toString().trim().toUpperCase() === idBusca &&
          (filas[i][3] || '').toString().trim()                === empBusca) {
        hoja.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Formato ' + idBusca + ' eliminado correctamente.' };
      }
    }
    return { status: 'error', message: 'Formato no encontrado.' };
  } catch (e) {
    Logger.log('Error en eliminarFormato: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN DE CLIENTES/EMPRESAS
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los campos de DB_CLIENTES para el panel de administración.
 * @return {Object} Lista completa de clientes con todos sus campos.
 */
function obtenerListaClientesAdmin() {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_CLIENTES');
    if (!hoja) return { status: 'success', data: [] };

    const datos    = hoja.getDataRange().getValues();
    const clientes = [];

    for (let i = 1; i < datos.length; i++) {
      const id     = (datos[i][0] || '').toString().trim();
      const nombre = (datos[i][1] || '').toString().trim();
      if (!id && !nombre) continue; // Saltar filas completamente vacías

      const estado = (datos[i][8] || '').toString().trim().toUpperCase() || 'ACTIVO';
      clientes.push({
        id:        id,
        nombre:    nombre,
        direccion: (datos[i][2] || '').toString().trim(),
        nit:       (datos[i][3] || '').toString().trim(),
        correo:    (datos[i][4] || '').toString().trim(),
        contacto:  (datos[i][5] || '').toString().trim(),
        celular:   (datos[i][6] || '').toString().trim(),
        obra:      (datos[i][7] || '').toString().trim(),
        estado:    estado,
        carpeta:   (datos[i][9] || '').toString().trim()  // J(9): URL carpeta Drive
      });
    }

    return { status: 'success', data: clientes };
  } catch (e) {
    Logger.log('Error en obtenerListaClientesAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Crea o actualiza un cliente en DB_CLIENTES.
 * Si data.id está vacío, genera un nuevo ID autoincremental.
 * @param {Object} data Campos del cliente.
 * @return {Object} Respuesta estandarizada.
 */
function guardarCliente(data) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_CLIENTES');
    if (!hoja) return { status: 'error', message: 'Hoja DB_CLIENTES no encontrada.' };

    const datos  = hoja.getDataRange().getValues();
    const estado = (data.estado || 'ACTIVO').toString().toUpperCase();
    const fila   = [
      '',                      // A: ID (se asigna abajo)
      data.nombre    || '',    // B: Nombre_Empresa
      data.direccion || '',    // C: Direccion
      data.nit       || '',    // D: NIT
      data.correo    || '',    // E: Correo_Gerente
      data.contacto  || '',    // F: Nombre_Contacto
      data.celular   || '',    // G: Celular_Whatsapp
      data.obra      || '',    // H: Nombre_Obra
      estado                   // I: Estado
    ];

    if (data.id && data.id.toString().trim() !== '') {
      // ── ACTUALIZAR registro existente ──────────────────────────────
      const idBuscar = data.id.toString().trim();
      fila[0] = idBuscar;
      for (let i = 1; i < datos.length; i++) {
        if ((datos[i][0] || '').toString().trim() === idBuscar) {
          hoja.getRange(i + 1, 1, 1, 9).setValues([fila]);
          SpreadsheetApp.flush();
          return { status: 'success', message: 'Empresa actualizada correctamente.' };
        }
      }
      return { status: 'error', message: 'No se encontró la empresa con ID: ' + idBuscar };
    } else {
      // ── CREAR nuevo registro ───────────────────────────────────────
      const nuevoId = _generarIdCliente(datos);
      fila[0] = nuevoId;

      // Crear carpeta en Google Drive con subcarpetas estándar SST
      let carpetaUrl = '';
      const rootFolderId = _obtenerRootFolderId_();
      if (rootFolderId && data.nombre) {
        carpetaUrl = _crearCarpetaCliente_(
          (data.nombre || '').toString().trim(),
          rootFolderId
        );
      }
      fila.push(carpetaUrl); // J(9): URL carpeta Drive del cliente

      hoja.appendRow(fila);
      SpreadsheetApp.flush();
      return {
        status: 'success',
        message: 'Empresa creada con ID: ' + nuevoId + (carpetaUrl ? '. Carpeta Drive generada.' : ''),
        data: { id: nuevoId, carpetaUrl: carpetaUrl }
      };
    }
  } catch (e) {
    Logger.log('Error en guardarCliente: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Lee DRIVE_ROOT_FOLDER_ID desde los parámetros del sistema (con caché).
 * Reutiliza getParametros() para aprovechar el CacheService en lugar de releer la hoja.
 */
function _obtenerRootFolderId_() {
  try {
    const params = getParametros().data || {};
    const val = (params.DRIVE_ROOT_FOLDER_ID || '').toString().trim();
    return val || null;
  } catch (e) {
    Logger.log('Error en _obtenerRootFolderId_: ' + e.toString());
    return null;
  }
}

/**
 * Crea la carpeta del cliente en Drive con subcarpetas estándar de documentación SST.
 * Es idempotente: si la carpeta ya existe, la reutiliza sin duplicar.
 * Estructura: {raíz}/{nombreEmpresa}/{Inspecciones, Permisos, Registros, Ejecucion, Asistencia}
 *
 * @param {string} nombreEmpresa  Nombre de la empresa (nombre de la carpeta).
 * @param {string} rootFolderId   ID de la carpeta raíz en Google Drive.
 * @return {string} URL de la carpeta del cliente, o '' si falla.
 */
function _crearCarpetaCliente_(nombreEmpresa, rootFolderId) {
  try {
    const carpetaRaiz   = DriveApp.getFolderById(rootFolderId);
    const iter          = carpetaRaiz.getFoldersByName(nombreEmpresa);
    const carpetaCliente = iter.hasNext()
      ? iter.next()
      : carpetaRaiz.createFolder(nombreEmpresa);

    // Subcarpetas estándar de documentación SST
    ['Inspecciones', 'Permisos', 'Registros', 'Ejecucion', 'Asistencia'].forEach(function(sub) {
      const iterSub = carpetaCliente.getFoldersByName(sub);
      if (!iterSub.hasNext()) carpetaCliente.createFolder(sub);
    });

    return carpetaCliente.getUrl();
  } catch (e) {
    Logger.log('Error en _crearCarpetaCliente_: ' + e.toString());
    return '';
  }
}

/**
 * Genera un ID correlativo tipo CLI-001 para un nuevo cliente.
 */
function _generarIdCliente(datos) {
  let maxNum = 0;
  for (let i = 1; i < datos.length; i++) {
    const id = (datos[i][0] || '').toString().trim();
    const match = id.match(/CLI-(\d+)/i);
    if (match) {
      const num = parseInt(match[1]);
      if (num > maxNum) maxNum = num;
    }
  }
  return 'CLI-' + (maxNum + 1).toString().padStart(3, '0');
}

/**
 * Elimina físicamente un cliente de DB_CLIENTES.
 * @param {string} idCliente ID del cliente a eliminar.
 * @return {Object} Respuesta estandarizada.
 */
function eliminarCliente(idCliente) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_CLIENTES');
    const datos = hoja.getDataRange().getValues();

    for (let i = 1; i < datos.length; i++) {
      if ((datos[i][0] || '').toString().trim() === idCliente.toString().trim()) {
        hoja.deleteRow(i + 1);
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Empresa eliminada correctamente.' };
      }
    }
    return { status: 'error', message: 'No se encontró la empresa con ID: ' + idCliente };
  } catch (e) {
    Logger.log('Error en eliminarCliente: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Cambia el estado (ACTIVO/INACTIVO) de un cliente.
 * Cuando se marca INACTIVO, deja de aparecer en el selector de supervisores.
 * @param {string} idCliente  ID del cliente.
 * @param {string} nuevoEstado 'ACTIVO' o 'INACTIVO'.
 * @return {Object} Respuesta estandarizada.
 */
function cambiarEstadoCliente(idCliente, nuevoEstado) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_CLIENTES');
    const datos = hoja.getDataRange().getValues();
    const estado = (nuevoEstado || 'ACTIVO').toString().toUpperCase();

    for (let i = 1; i < datos.length; i++) {
      if ((datos[i][0] || '').toString().trim() === idCliente.toString().trim()) {
        hoja.getRange(i + 1, 9).setValue(estado); // Columna I = Estado
        SpreadsheetApp.flush();
        return { status: 'success', message: 'Estado actualizado a ' + estado + '.' };
      }
    }
    return { status: 'error', message: 'No se encontró la empresa con ID: ' + idCliente };
  } catch (e) {
    Logger.log('Error en cambiarEstadoCliente: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Valida las credenciales del usuario contra la hoja DB_USUARIOS.
 * Usa CacheService para evitar leer el spreadsheet en cada intento.
 * @param {String} email Correo del usuario.
 * @param {String} password Contraseña ingresada.
 * @return {Object} Resultado con datos del usuario o error.
 */
function validarCredenciales(email, password) {
  try {
    // ── Verificar estado de la cuenta del cliente ────────────────────
    const configRes = getParametros();
    if (configRes && configRes.status === 'success' && configRes.data) {
      const cuenta = (configRes.data.CUENTA || 'ACTIVA').toString().trim().toUpperCase();
      if (cuenta === 'INACTIVA') {
        return {
          status:  'error',
          message: '⚠ ACCESO TEMPORALMENTE SUSPENDIDO\n\nEl acceso al sistema ha sido desactivado por el administrador. Comuníquese con soporte para más información.',
          codigo:  'CUENTA_INACTIVA'
        };
      }
    }

    // ── Intentar leer desde cache ────────────────────────────────────
    const cache     = CacheService.getScriptCache();
    const CACHE_KEY = 'db_usuarios_v1';
    let   usuarios  = null;

    const cached = cache.get(CACHE_KEY);
    if (cached) {
      try { usuarios = JSON.parse(cached); } catch(e) { usuarios = null; }
    }

    // ── Cache miss: leer hoja y guardar ─────────────────────────────
    if (!usuarios) {
      const ss   = _getSpreadsheet();
      const hoja = ss.getSheetByName('DB_USUARIOS');
      if (!hoja) return { status: 'error', message: 'La hoja DB_USUARIOS no existe.' };

      // Schema: A(0)=Email B(1)=Nombre C(2)=Rol D(3)=Password E(4)=Código F(5)=Cedula G(6)=Celular H(7)=Estado
      const datos = hoja.getDataRange().getValues();
      usuarios    = [];
      for (let i = 1; i < datos.length; i++) {
        const emailRow = (datos[i][0] || '').toString().trim().toLowerCase();
        if (!emailRow) continue;
        usuarios.push({
          email:     emailRow,
          nombre:    datos[i][1],
          rol:       datos[i][2],
          password:  (datos[i][3] || '').toString(),
          idCliente: datos[i][4] || '', // col E = código usuario (ADMIN-001, SUP-001…)
          estado:    (datos[i][7] || 'activo').toString().toLowerCase() // col H
        });
      }
      // Guardar por 5 minutos (300s)
      cache.put(CACHE_KEY, JSON.stringify(usuarios), 300);
    }

    // ── Buscar usuario ───────────────────────────────────────────────
    const emailLower = (email || '').toString().trim().toLowerCase();
    for (let i = 0; i < usuarios.length; i++) {
      const u = usuarios[i];
      if (u.email === emailLower) {
        if (u.estado === 'inactivo') {
          return { status: 'error', message: 'Usuario inactivo. Contacte al administrador.' };
        }
        if (u.password === password.toString()) {
          return {
            status: 'success',
            data: {
              email:     u.email,
              nombre:    u.nombre,
              rol:       u.rol,
              idCliente: u.idCliente,
              codigo:    u.idCliente || ''
            }
          };
        }
        return { status: 'error', message: 'Contraseña incorrecta.' };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado.' };

  } catch (e) {
    Logger.log('Error en validarCredenciales: ' + e.toString());
    return { status: 'error', message: 'Error en validación: ' + e.toString() };
  }
}

/**
 * Obtiene las opciones configuradas en LISTAS_SISTEMA para poblar el UI.
 * @return {Object} Objeto con arreglos clasificados por categoría.
 */
function obtenerOpcionesFormulario() {
  try {
    const ss = _getSpreadsheet();
    const hoja = ss.getSheetByName('LISTAS_SISTEMA');
    const datos = hoja.getDataRange().getValues();
    
    const opciones = {
      TIPO_ACTIVIDAD: [],
      PRIORIDAD: []
    };
    
    // Empezar en i=1 para saltar encabezados
    for (let i = 1; i < datos.length; i++) {
      const [categoria, item] = datos[i];
      if (opciones[categoria]) {
        opciones[categoria].push(item);
      }
    }
    
    return {
      status: "success",
      data: opciones
    };
  } catch (e) {
    return {
      status: "error",
      message: "Error al obtener opciones: " + e.toString()
    };
  }
}

/**
 * REGISTRO DE ASISTENCIA (INGRESO)
 * @param {Object} data Datos del ingreso (Obra, Foto Base64).
 */
function registrarIngreso(data) {
  // Lock por usuario — evita doble-ingreso si el supervisor toca el botón dos veces
  const lock = LockService.getUserLock();
  try {
    lock.waitLock(5000);

    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_ASISTENCIA');
    const user = getUserDataFromApp(data.userEmail);

    // Verificar que no exista ya un ACTIVO para este usuario hoy
    const today     = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd/MM/yyyy');
    const filasPrev = hoja.getDataRange().getValues();
    for (let i = filasPrev.length - 1; i >= 1; i--) {
      if ((filasPrev[i][1] || '') === user.email &&
          (filasPrev[i][10] || '') === 'ACTIVO' &&
          (filasPrev[i][3] || '').toString().trim() === today) {
        return { status: 'error', message: 'Ya tienes una jornada activa registrada hoy.' };
      }
    }

    const fechaActual  = new Date();
    const idAsistencia = 'ASIS-' + fechaActual.getTime();
    const tipoDia      = getTipoDia(fechaActual);

    // Guardar Foto en Drive → ROOT/Evidencia_Asistencias/
    let urlFoto = 'Sin foto';
    if (data.archivoBase64) {
      try {
        const params     = getParametros().data || {};
        const obraNombre = data.obra || 'General';
        const nombreArchivo = 'Ingreso_' + _sanitizeName(user.nombre) + '_' + _sanitizeName(obraNombre) + '_' + _fechaParaNombre() + '.png';
        urlFoto = guardarImagenEnDrive(data.archivoBase64, nombreArchivo, null, params.DRIVE_ROOT_FOLDER_ID, 'Evidencia_Asistencias');
      } catch (eDrive) {
        Logger.log('registrarIngreso Drive: ' + eDrive.toString());
      }
    }

    hoja.appendRow([
      idAsistencia,
      user.email,
      user.nombre,
      Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), 'dd/MM/yyyy'),
      Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), 'HH:mm:ss'),
      '',       // Hora Salida
      tipoDia,
      data.obra || 'Generica',
      urlFoto,
      '',       // Foto Salida
      'ACTIVO'
    ]);
    SpreadsheetApp.flush();
    return { status: 'success', message: 'Ingreso registrado correctamente.', data: { id: idAsistencia } };

  } catch (e) {
    Logger.log('Error en registrarIngreso: ' + e.toString());
    return { status: 'error', message: 'Error al registrar ingreso: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * REGISTRO DE ASISTENCIA (SALIDA)
 */
function registrarSalida(data) {
  const lock = LockService.getUserLock();
  try {
    lock.waitLock(5000);

    const ss    = _getSpreadsheet();
    const hoja  = ss.getSheetByName('DB_ASISTENCIA');
    const email = data.userEmail;

    const datos = hoja.getDataRange().getValues();
    let filaIndex = -1;

    for (let i = datos.length - 1; i >= 1; i--) {
      if (datos[i][1] === email && datos[i][10] === 'ACTIVO') {
        filaIndex = i + 1;
        break;
      }
    }

    if (filaIndex === -1) throw new Error('No se encontró un ingreso activo para cerrar.');

    const fechaActual = new Date();
    let urlFoto = 'Sin foto';
    if (data.archivoBase64) {
      try {
        const params     = getParametros().data || {};
        const nombreUser = (datos[filaIndex - 1][2] || email).toString().trim();
        const obraNombre = (datos[filaIndex - 1][7] || 'General').toString().trim();
        const nombreArchivo = 'Salida_' + _sanitizeName(nombreUser) + '_' + _sanitizeName(obraNombre) + '_' + _fechaParaNombre() + '.png';
        urlFoto = guardarImagenEnDrive(data.archivoBase64, nombreArchivo, null, params.DRIVE_ROOT_FOLDER_ID, 'Evidencia_Asistencias');
      } catch (eDrive) {
        Logger.log('registrarSalida Drive: ' + eDrive.toString());
      }
    }

    hoja.getRange(filaIndex, 6).setValue(Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), 'HH:mm:ss'));
    hoja.getRange(filaIndex, 10).setValue(urlFoto);
    hoja.getRange(filaIndex, 11).setValue('CERRADO');
    SpreadsheetApp.flush();

    return { status: 'success', message: '¡Salida registrada! Buen descanso.' };

  } catch (e) {
    Logger.log('Error en registrarSalida: ' + e.toString());
    return { status: 'error', message: 'Error al registrar salida: ' + e.toString() };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Determina si el día es Hábil, Sábado o Domingo.
 */
function getTipoDia(fecha) {
  const diaSemana = fecha.getDay(); // 0 = Domingo, 6 = Sábado
  if (diaSemana === 0) return "DOMINGO/FESTIVO";
  if (diaSemana === 6) return "SABADO";
  return "HABIL";
}

/**
 * Obtiene datos del usuario para asegurar integridad en el registro.
 * Reutiliza la caché de DB_USUARIOS (db_usuarios_v1) para evitar re-lectura.
 */
function getUserDataFromApp(email) {
  const emailLower = (email || '').toString().trim().toLowerCase();

  // ── Intentar desde caché ──────────────────────────────────────────
  const cache  = CacheService.getScriptCache();
  const cached = cache.get('db_usuarios_v1');
  if (cached) {
    try {
      const usuarios = JSON.parse(cached);
      for (let i = 0; i < usuarios.length; i++) {
        if (usuarios[i].email === emailLower) {
          return { email: usuarios[i].email, nombre: usuarios[i].nombre, codigo: usuarios[i].idCliente || '' };
        }
      }
      return { email: email, nombre: 'Supervisor', codigo: '' };
    } catch(e) { /* cache corrupto, leer de hoja */ }
  }

  // ── Cache miss: leer hoja y poblar caché para próximas llamadas ───
  const ss    = _getSpreadsheet();
  const hoja  = ss.getSheetByName('DB_USUARIOS');
  const datos = hoja ? hoja.getDataRange().getValues() : [];

  // Construir y guardar lista completa en cache (600s = 10 min)
  const listaCache = [];
  for (let i = 1; i < datos.length; i++) {
    const emailRow = (datos[i][0] || '').toString().trim().toLowerCase();
    if (emailRow) {
      listaCache.push({
        email:     emailRow,
        nombre:    datos[i][1],
        rol:       datos[i][2],
        password:  (datos[i][3] || '').toString(),
        idCliente: (datos[i][4] || '').toString(),
        estado:    (datos[i][7] || 'activo').toString().toLowerCase()
      });
    }
  }
  try { cache.put('db_usuarios_v1', JSON.stringify(listaCache), 600); } catch(ec) {}

  // Buscar el usuario solicitado en la lista recién cargada
  for (let i = 0; i < listaCache.length; i++) {
    if (listaCache[i].email === emailLower) {
      return { email: listaCache[i].email, nombre: listaCache[i].nombre, codigo: listaCache[i].idCliente || '' };
    }
  }
  return { email: email, nombre: 'Supervisor', codigo: '' };
}

/**
 * Devuelve el email del usuario logueado.
 * @return {String} Email del usuario.
 */
function getUserEmail() {
  return Session.getActiveUser().getEmail();
}

/**
 * Verifica si el supervisor tiene un ingreso activo hoy.
 */
function obtenerEstadoAsistencia(email) {
  try {
    const ss = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_ASISTENCIA');
    if (!hoja) return { status: "success", data: { activo: false } };
    
    const datos = hoja.getDataRange().getValues();
    const hoy = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

    for (let i = datos.length - 1; i >= 1; i--) {
      if (datos[i][1] === email && datos[i][3] === hoy && datos[i][10] === "ACTIVO") {
        return { 
          status: "success", 
          data: { 
            activo: true, 
            id: datos[i][0],
            obra: datos[i][7]
          } 
        };
      }
    }
    return { status: "success", data: { activo: false } };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * BATCH DE INICIALIZACIÓN DEL SUPERVISOR
 * Combina en UNA sola llamada RPC lo que antes requería 2:
 *   - obtenerClientesRegistrados() (para selector de obra e inspección)
 *   - obtenerEstadoAsistencia(email) (para detectar jornada activa)
 *
 * Reduce la latencia de inicio del panel ~50% en conexiones móviles 4G.
 *
 * @param {string} email Email del supervisor logueado.
 * @return {Object} { status, data: { clientes, asistencia } }
 */
function obtenerDatosPanelSupervisor(email) {
  try {
    // 1. Clientes (reutiliza la función existente para no duplicar lógica)
    const resClientes = obtenerClientesRegistrados();

    // 2. Estado de asistencia (reutiliza la función existente)
    const resAsistencia = obtenerEstadoAsistencia(email);

    return {
      status: 'success',
      data: {
        clientes:    resClientes.data   || [],
        asistencia:  resAsistencia.data || { activo: false }
      }
    };
  } catch (e) {
    Logger.log('Error en obtenerDatosPanelSupervisor: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene los datos completos del usuario a partir de su email.
 * Usado para recuperar sesión cuando localStorage falla en el iframe de GAS.
 * Reutiliza la caché db_usuarios_v1 para evitar re-lectura de Sheets.
 * @param {string} email - Email del usuario a buscar.
 */
function obtenerDatosUsuario(email) {
  try {
    const emailLower = (email || '').toString().trim().toLowerCase();

    // ── Intentar desde caché ────────────────────────────────────────
    const cache  = CacheService.getScriptCache();
    const cached = cache.get('db_usuarios_v1');
    if (cached) {
      try {
        const usuarios = JSON.parse(cached);
        for (let i = 0; i < usuarios.length; i++) {
          const u = usuarios[i];
          if (u.email === emailLower) {
            return { status: 'success', data: { email: u.email, nombre: u.nombre, rol: u.rol, idCliente: u.idCliente || '', codigo: u.idCliente || '' } };
          }
        }
        return { status: 'error', message: 'Usuario no encontrado.' };
      } catch(e) { /* cache corrupto */ }
    }

    // ── Cache miss: leer hoja ───────────────────────────────────────
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if ((datos[i][0] || '').toString().trim().toLowerCase() === emailLower) {
        return {
          status: 'success',
          data: {
            email:     datos[i][0],
            nombre:    datos[i][1],
            rol:       datos[i][2],
            idCliente: datos[i][4] || '',
            codigo:    datos[i][4] || '' // Columna E
          }
        };
      }
    }
    return { status: 'error', message: 'Usuario no encontrado.' };
  } catch (e) {
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene los datos del usuario actualmente autenticado en Google (fallback de sesión).
 * Se llama cuando no hay email en la URL pero sí un token de rol.
 */
function obtenerUsuarioActivo() {
  try {
    const email = Session.getActiveUser().getEmail();
    if (!email) return { status: "error", message: "No hay sesión activa de Google." };
    return obtenerDatosUsuario(email);
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════
// MÓDULO: REPORTE DE HALLAZGOS (RH)
// Schema DB_HALLAZGOS (15 cols):
//  A(0):Id_hallazgo         B(1):Fecha               C(2):Hora
//  D(3):Ubicacion           E(4):Descripcion_hallazgo F(5):Foto_URL_Hallazgo
//  G(6):Empresa_Contratista H(7):Reportado_Por        I(8):Reportado_A
//  J(9):Numero_contacto_whatssap  K(10):Gestion_Realizada  L(11):Estado
//  M(12):Fecha_cierre       N(13):Hora_cierre         O(14):Foto_URL_Cierre_hallazgo
// ══════════════════════════════════════════════════════════

/**
 * Genera un slug URL-safe desde un string:
 * quita tildes, caracteres especiales y reemplaza espacios por guiones bajos.
 */
function _slugify_(str, maxLen) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '').trim()
    .replace(/\s+/g, '_')
    .substring(0, maxLen || 30);
}

/**
 * Guarda un nuevo Reporte de Hallazgo en DB_HALLAZGOS y la foto en Drive.
 * Retorna el ID del hallazgo y la URL de cierre para construir el enlace WA.
 *
 * @param {Object} data
 *   ubicacion, descripcion, empresaContratista, reportadoPor,
 *   reportadoA, numeroContacto, fotoBase64
 * @return {Object} { status, data: { idHallazgo, urlCierre } }
 */
function guardarHallazgo(data) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_HALLAZGOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_HALLAZGOS no encontrada. Ejecute inicializarBaseDeDatos().' };

    const tz    = Session.getScriptTimeZone();
    const ahora = new Date();
    const fecha = Utilities.formatDate(ahora, tz, 'dd/MM/yyyy');
    const hora  = Utilities.formatDate(ahora, tz, 'HH:mm:ss');

    // Generar identificador único: RH-{consecutivo}-{empresa}-{descripcion}
    const totalDatos  = Math.max(hoja.getLastRow() - 1, 0);
    const consecutivo = String(totalDatos + 1).padStart(3, '0');
    const empSlug     = _slugify_(data.empresaContratista, 20);
    const descSlug    = _slugify_((data.descripcion || '').split(' ').slice(0, 3).join(' '), 30);
    const idHallazgo  = 'RH-' + consecutivo + '-' + empSlug + '-' + descSlug;

    // Guardar foto de evidencia en Drive → ROOT/[Empresa]/Evidencia_Hallazgos/
    let urlFoto = 'Sin foto';
    if (data.fotoBase64) {
      try {
        const params = getParametros().data || {};
        const empNombre = (data.empresaContratista || '').toString().trim();
        const nombreArchivo = 'Hallazgo_' + _sanitizeName(idHallazgo) + '_' + _sanitizeName(empNombre) + '_' + _fechaParaNombre() + '.png';
        urlFoto = guardarImagenEnDrive(
          data.fotoBase64,
          nombreArchivo,
          empNombre,
          params.DRIVE_ROOT_FOLDER_ID,
          'Evidencia_Hallazgos'
        );
      } catch (eDrive) {
        Logger.log('guardarHallazgo Drive: ' + eDrive.toString());
      }
    }

    // URL pública de cierre para el jefe de obra
    const urlCierre = getScriptUrl() + '?page=hallazgo&id=' + encodeURIComponent(idHallazgo);

    hoja.appendRow([
      idHallazgo,                                            // A: Id_hallazgo
      fecha,                                                 // B: Fecha
      hora,                                                  // C: Hora
      (data.ubicacion          || '').toString().trim(),     // D: Ubicacion
      (data.descripcion        || '').toString().trim(),     // E: Descripcion_hallazgo
      urlFoto,                                               // F: Foto_URL_Hallazgo
      (data.empresaContratista || '').toString().trim(),     // G: Empresa_Contratista
      (data.reportadoPor       || '').toString().trim(),     // H: Reportado_Por
      (data.reportadoA         || '').toString().trim(),     // I: Reportado_A
      (data.numeroContacto     || '').toString().trim(),     // J: Numero_contacto_whatssap
      '',          // K: Gestion_Realizada (se llena al cerrar)
      'ABIERTO',   // L: Estado
      '',          // M: Fecha_cierre
      '',          // N: Hora_cierre
      ''           // O: Foto_URL_Cierre_hallazgo
    ]);
    SpreadsheetApp.flush();

    return {
      status: 'success',
      message: 'Hallazgo ' + idHallazgo + ' reportado correctamente.',
      data: { idHallazgo: idHallazgo, urlCierre: urlCierre, urlFoto: urlFoto }
    };
  } catch (e) {
    Logger.log('Error en guardarHallazgo: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Cierra un hallazgo: actualiza Estado=CERRADO, guarda gestión y foto de cierre.
 *
 * @param {Object} data  idHallazgo, gestionRealizada, fotoBase64 (opcional)
 * @return {Object} Respuesta estandarizada.
 */
function cerrarHallazgo(data) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_HALLAZGOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_HALLAZGOS no encontrada.' };

    const filas   = hoja.getDataRange().getValues();
    const idBusca = (data.idHallazgo || '').toString().trim();

    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim() === idBusca) {
        const fila    = i + 1;
        const empresa = (filas[i][6] || '').toString().trim(); // G: Empresa
        const tz      = Session.getScriptTimeZone();
        const ahora   = new Date();

        // Guardar foto de cierre en Drive → ROOT/[Empresa]/Evidencia_Hallazgos/
        let urlFotoCierre = 'Sin foto cierre';
        if (data.fotoBase64) {
          try {
            const params = getParametros().data || {};
            const nombreArchivo = 'Hallazgo_Cierre_' + _sanitizeName(idBusca) + '_' + _sanitizeName(empresa) + '_' + _fechaParaNombre() + '.png';
            urlFotoCierre = guardarImagenEnDrive(
              data.fotoBase64,
              nombreArchivo,
              empresa,
              params.DRIVE_ROOT_FOLDER_ID,
              'Evidencia_Hallazgos'
            );
          } catch (eDrive) {
            Logger.log('cerrarHallazgo Drive: ' + eDrive.toString());
          }
        }

        // K(11), L(12), M(13), N(14), O(15) — índice de columna es fila-base 1
        hoja.getRange(fila, 11).setValue((data.gestionRealizada || '').toString().trim());
        hoja.getRange(fila, 12).setValue('CERRADO');
        hoja.getRange(fila, 13).setValue(Utilities.formatDate(ahora, tz, 'dd/MM/yyyy'));
        hoja.getRange(fila, 14).setValue(Utilities.formatDate(ahora, tz, 'HH:mm:ss'));
        hoja.getRange(fila, 15).setValue(urlFotoCierre);
        SpreadsheetApp.flush();

        return { status: 'success', message: 'Hallazgo cerrado correctamente.' };
      }
    }
    return { status: 'error', message: 'Hallazgo no encontrado: ' + idBusca };
  } catch (e) {
    Logger.log('Error en cerrarHallazgo: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene los datos de un hallazgo por su ID.
 * Usado por la vista pública de cierre (jefe de obra).
 *
 * @param {string} idHallazgo  ID del hallazgo (ej: RH-001-eurolaminados-cables_sueltos)
 * @return {Object} { status, data: { id, fecha, hora, ubicacion, descripcion, ... } }
 */
function obtenerHallazgo(idHallazgo) {
  try {
    const ss   = _getSpreadsheet();
    const hoja = ss.getSheetByName('DB_HALLAZGOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_HALLAZGOS no encontrada.' };

    const filas   = hoja.getDataRange().getValues();
    const idBusca = (idHallazgo || '').toString().trim();

    const tz = Session.getScriptTimeZone();
    // Helper: formatea celdas Date con el patrón dado; devuelve string para el resto
    function _fmtCelda_(val, fmt) {
      if (!val && val !== 0) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, fmt); } catch(_) {}
      }
      return val.toString().trim();
    }

    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim() === idBusca) {
        return {
          status: 'success',
          data: {
            id:          (filas[i][0]  || '').toString().trim(),
            fecha:       _fmtCelda_(filas[i][1], 'dd/MM/yyyy'),
            hora:        _fmtCelda_(filas[i][2], 'HH:mm:ss'),
            ubicacion:   (filas[i][3]  || '').toString().trim(),
            descripcion: (filas[i][4]  || '').toString().trim(),
            fotoUrl:     (filas[i][5]  || '').toString().trim(),
            empresa:     (filas[i][6]  || '').toString().trim(),
            reportadoPor:(filas[i][7]  || '').toString().trim(),
            reportadoA:  (filas[i][8]  || '').toString().trim(),
            estado:      (filas[i][11] || 'ABIERTO').toString().trim().toUpperCase()
          }
        };
      }
    }
    return { status: 'error', message: 'Hallazgo no encontrado: ' + idBusca };
  } catch (e) {
    Logger.log('Error en obtenerHallazgo: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene todos los hallazgos para la galería administrativa.
 * Cruza el código del supervisor con DB_USUARIOS para obtener el nombre completo.
 *
 * @return {Object} { status, data: [ { id, fecha, hora, ubicacion, descripcion,
 *                    urlFoto, urlFotoCierre, empresa, supervisor, reportadoA,
 *                    gestionRealizada, estado, fechaCierre, horaCierre } ] }
 */
function obtenerGaleriaHallazgosAdmin() {
  try {
    const ss    = _getSpreadsheet();
    const hojaH = ss.getSheetByName('DB_HALLAZGOS');
    const hojaU = ss.getSheetByName('DB_USUARIOS');
    if (!hojaH) return { status: 'error', message: 'Hoja DB_HALLAZGOS no encontrada.' };

    const filasH = hojaH.getDataRange().getValues();
    const tz     = Session.getScriptTimeZone();

    // Mapa código supervisor → nombre completo
    const mapaSuper = {};
    if (hojaU) {
      const filasU = hojaU.getDataRange().getValues();
      for (let i = 1; i < filasU.length; i++) {
        const codigo = (filasU[i][4] || '').toString().trim(); // col E: ID_Cliente_Asociado
        const nombre = (filasU[i][1] || '').toString().trim(); // col B: Nombre_Completo
        if (codigo) mapaSuper[codigo] = nombre;
      }
    }

    function _fmt_(val, fmt) {
      if (!val && val !== 0) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, fmt); } catch (_) {}
      }
      return val.toString().trim();
    }

    const hallazgos = [];
    for (let i = 1; i < filasH.length; i++) {
      const f = filasH[i];
      const id = (f[0] || '').toString().trim();
      if (!id) continue;

      const codigoSup = (f[7] || '').toString().trim();
      hallazgos.push({
        id:               id,
        fecha:            _fmt_(f[1],  'dd/MM/yyyy'),
        hora:             _fmt_(f[2],  'HH:mm'),
        ubicacion:        (f[3]  || '').toString().trim(),
        descripcion:      (f[4]  || '').toString().trim(),
        urlFoto:          (f[5]  || '').toString().trim(),
        empresa:          (f[6]  || '').toString().trim(),
        supervisor:       mapaSuper[codigoSup] || codigoSup,
        reportadoA:       (f[8]  || '').toString().trim(),
        gestionRealizada: (f[10] || '').toString().trim(),
        estado:           (f[11] || 'ABIERTO').toString().trim().toUpperCase(),
        fechaCierre:      _fmt_(f[12], 'dd/MM/yyyy'),
        horaCierre:       _fmt_(f[13], 'HH:mm'),
        urlFotoCierre:    (f[14] || '').toString().trim()
      });
    }

    // Más recientes primero (appendRow los agrega al final)
    hallazgos.reverse();

    return { status: 'success', data: hallazgos };
  } catch (e) {
    Logger.log('Error en obtenerGaleriaHallazgosAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene métricas de gestión para todos los supervisores SUP-SST.
 * Agrega datos de DB_INSPECCIONES y DB_HALLAZGOS por supervisor.
 * @return {Object} { status, data: { supervisores: [...], kpis: {...} } }
 */
function obtenerMetricasSupervisoresSTT() {
  try {
    const ss  = _getSpreadsheet();
    const tz  = Session.getScriptTimeZone();
    const hoy = new Date();

    // ── Helper: días transcurridos desde una fecha ────────────────────
    function _diasDesde_(val) {
      if (!val && val !== 0) return 0;
      var d;
      if (val instanceof Date) {
        d = val;
      } else {
        var str = val.toString().trim();
        // "dd/MM/yyyy" → "yyyy-MM-dd"
        if (str.includes('/')) {
          var parts = str.split('/');
          str = parts[2] + '-' + parts[1] + '-' + parts[0];
        }
        d = new Date(str);
      }
      return isNaN(d) ? 0 : Math.max(0, Math.floor((hoy - d) / 86400000));
    }

    // ── Helper: formatear fecha ───────────────────────────────────────
    function _fmtFecha_(val) {
      if (!val) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, 'dd/MM/yyyy'); } catch(e) {}
      }
      return val.toString().trim();
    }

    // 1. Leer todos los supervisores SUP-SST de DB_USUARIOS
    // Schema: Email(0) | Nombre_Completo(1) | Rol(2) | Password(3) | ID_Cliente_Asociado(4) | Cedula(5) | Celular_Whatsapp(6)
    var hojaUsr = ss.getSheetByName('DB_USUARIOS');
    if (!hojaUsr) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };
    var datosUsr = hojaUsr.getDataRange().getValues();

    var supervisores = [];
    for (var i = 1; i < datosUsr.length; i++) {
      if ((datosUsr[i][2] || '').toString().trim().toUpperCase() === 'SUP-SST') {
        supervisores.push({
          email:   (datosUsr[i][0] || '').toString().trim(),
          nombre:  (datosUsr[i][1] || '').toString().trim(),
          codigo:  (datosUsr[i][4] || '').toString().trim(), // ID_Cliente_Asociado = Codigo_Supervisor
          celular: (datosUsr[i][6] || '').toString().trim()
        });
      }
    }

    // 2. Leer empresas activas de DB_CLIENTES para el filtro
    // Schema: ID_Cliente(0)|Nombre_Empresa(1)|Direccion(2)|NIT(3)|Correo_Gerente(4)|Nombre_Contacto(5)|Celular_Whatsapp(6)|Nombre_Obra(7)|Estado(8)
    var hojaClientes = ss.getSheetByName('DB_CLIENTES');
    var listaEmpresas = [];
    if (hojaClientes) {
      var datosClientes = hojaClientes.getDataRange().getValues();
      for (var j = 1; j < datosClientes.length; j++) {
        var nomEmp  = (datosClientes[j][1] || '').toString().trim();
        var estadoEmp = (datosClientes[j][8] || '').toString().trim().toUpperCase();
        if (nomEmp && estadoEmp === 'ACTIVO') {
          listaEmpresas.push(nomEmp);
        }
      }
      listaEmpresas.sort();
    }

    // 3. Leer DB_INSPECCIONES de una sola vez
    // Schema: Id_formato(0)|Consecutivo(1)|Descripcion_Formato(2)|Fecha_Hora(3)|Empresa_Contratista(4)|Foto_Formato_URL(5)|Reportado_Por(6)|Estado(7)|Foto_Firma_URL(8)|Fecha_Cierre(9)
    var hojaInsp = ss.getSheetByName('DB_INSPECCIONES');
    var datosInsp = hojaInsp ? hojaInsp.getDataRange().getValues().slice(1) : [];

    // 3. Leer DB_HALLAZGOS de una sola vez
    // Schema: Id_hallazgo(0)|Fecha(1)|Hora(2)|Ubicacion(3)|Descripcion_hallazgo(4)|Foto_URL_Hallazgo(5)|Empresa_Contratista(6)|Reportado_Por(7)|Reportado_A(8)|Numero_contacto(9)|Gestion_Realizada(10)|Estado(11)|Fecha_cierre(12)|Hora_cierre(13)|Foto_URL_Cierre(14)
    var hojaHall = ss.getSheetByName('DB_HALLAZGOS');
    var datosHall = hojaHall ? hojaHall.getDataRange().getValues().slice(1) : [];

    // 4. Agregar métricas por supervisor
    var resultado = supervisores.map(function(sup) {
      // Formatos del supervisor (Reportado_Por col 6)
      var formatos = datosInsp.filter(function(r) { return (r[6]||'').toString().trim() === sup.codigo; });
      var fPend    = formatos.filter(function(r) { return (r[7]||'').toString().trim() === 'PENDIENTE'; });
      var fCerr    = formatos.filter(function(r) { return (r[7]||'').toString().trim() === 'CERRADO CON FIRMA'; });

      // Hallazgos del supervisor (Reportado_Por col 7)
      var hallazgos = datosHall.filter(function(r) { return (r[7]||'').toString().trim() === sup.codigo; });
      var hAbie     = hallazgos.filter(function(r) { return (r[11]||'').toString().trim() === 'ABIERTO'; });
      var hCerr     = hallazgos.filter(function(r) { return (r[11]||'').toString().trim() === 'CERRADO'; });

      // Obras únicas del supervisor
      var obrasSet = {};
      formatos.forEach(function(r) { var o = (r[4]||'').toString().trim(); if (o) obrasSet[o] = true; });
      hallazgos.forEach(function(r) { var o = (r[6]||'').toString().trim(); if (o) obrasSet[o] = true; });
      var obras = Object.keys(obrasSet);

      // Alertas: formatos pendientes con días de antigüedad (más antiguos primero)
      var alertasFormatos = fPend.map(function(r) {
        return {
          consecutivo: (r[1]||'').toString(),
          descripcion: (r[2]||'').toString(),
          empresa:     (r[4]||'').toString(),
          fecha:       _fmtFecha_(r[3]),
          dias:        _diasDesde_(r[3])
        };
      }).sort(function(a, b) { return b.dias - a.dias; });

      // Alertas: hallazgos abiertos con días de antigüedad
      var alertasHallazgos = hAbie.map(function(r) {
        return {
          id:          (r[0]||'').toString(),
          descripcion: (r[4]||'').toString(),
          empresa:     (r[6]||'').toString(),
          fecha:       (r[1]||'').toString(),
          dias:        _diasDesde_(r[1])
        };
      }).sort(function(a, b) { return b.dias - a.dias; });

      // Tasa de cumplimiento global: considera formatos cerrados + hallazgos cerrados
      // sobre el total de actividad (formatos + hallazgos). Si no hay actividad → 100%.
      var totalActividad  = formatos.length + hallazgos.length;
      var cerradoTotal    = fCerr.length + hCerr.length;
      var tasaGlobal      = totalActividad > 0 ? Math.round((cerradoTotal / totalActividad) * 100) : 100;

      return {
        email:   sup.email,
        nombre:  sup.nombre,
        celular: sup.celular,
        obras:   obras,
        formatos: {
          total:    formatos.length,
          pendiente: fPend.length,
          cerrado:  fCerr.length,
          tasa:     tasaGlobal
        },
        hallazgos: {
          total:    hallazgos.length,
          abiertos: hAbie.length,
          cerrados: hCerr.length
        },
        alertasFormatos:  alertasFormatos,
        alertasHallazgos: alertasHallazgos
      };
    });

    // 5. KPIs globales — tasa combinada: (formatos cerrados + hallazgos cerrados) / (formatos + hallazgos)
    var totActGlobal  = resultado.reduce(function(a, s) { return a + s.formatos.total + s.hallazgos.total; }, 0);
    var cerrGlobal    = resultado.reduce(function(a, s) { return a + s.formatos.cerrado + s.hallazgos.cerrados; }, 0);
    var kpis = {
      totalSupervisores:  resultado.length,
      formatosPendientes: resultado.reduce(function(a, s) { return a + s.formatos.pendiente; }, 0),
      hallazgosAbiertos:  resultado.reduce(function(a, s) { return a + s.hallazgos.abiertos; }, 0),
      tasaGlobal:         totActGlobal > 0 ? Math.round((cerrGlobal / totActGlobal) * 100) : 100
    };

    return { status: 'success', data: { supervisores: resultado, kpis: kpis, empresas: listaEmpresas } };

  } catch (e) {
    Logger.log('Error en obtenerMetricasSupervisoresSTT: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Obtiene reporte de desempeño por período para informe individual o ranking.
 * @param {Object} params
 *   params.fechaInicio      {string} "yyyy-MM-dd"
 *   params.fechaFin         {string} "yyyy-MM-dd"
 *   params.emailSupervisor  {string} email del supervisor (vacío = todos → ranking)
 *   params.empresa          {string} filtro opcional de empresa para el ranking
 * @return {Object} { status, data: { tipo, periodo, supervisor|ranking } }
 */
function obtenerReporteDesempenoSTT(params) {
  try {
    var ss  = _getSpreadsheet();
    var tz  = Session.getScriptTimeZone();

    // Leer logo desde PARAM_SISTEMA (clave URL_LOGO)
    var logoUrl = '';
    try {
      var hojaParam = ss.getSheetByName('PARAM_SISTEMA');
      if (hojaParam && hojaParam.getLastRow() >= 2) {
        var paramData = hojaParam.getRange(2, 1, hojaParam.getLastRow() - 1, 2).getValues();
        for (var p = 0; p < paramData.length; p++) {
          if ((paramData[p][0] || '').toString().trim() === 'URL_LOGO') {
            logoUrl = (paramData[p][1] || '').toString().trim();
            break;
          }
        }
      }
    } catch(eLogo) { Logger.log('Logo read error: ' + eLogo); }

    // Parsear fechas del período (vienen como "yyyy-MM-dd")
    var dInicio = new Date(params.fechaInicio + 'T00:00:00');
    var dFin    = new Date(params.fechaFin    + 'T23:59:59');
    if (isNaN(dInicio) || isNaN(dFin)) {
      return { status: 'error', message: 'Fechas inválidas.' };
    }

    // Helper: ¿la fecha cae dentro del período?
    function _enPeriodo_(val) {
      if (!val && val !== 0) return false;
      var d;
      if (val instanceof Date) {
        d = val;
      } else {
        var str = val.toString().trim();
        if (str.includes('/')) { var p = str.split('/'); str = p[2]+'-'+p[1]+'-'+p[0]; }
        d = new Date(str);
      }
      return !isNaN(d) && d >= dInicio && d <= dFin;
    }

    function _fmtF_(val) {
      if (!val) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, 'dd/MM/yyyy'); } catch(e) {}
      }
      return val.toString().trim();
    }

    // 1. Leer supervisores SUP-SST de DB_USUARIOS
    var hojaUsr  = ss.getSheetByName('DB_USUARIOS');
    var datosUsr = hojaUsr ? hojaUsr.getDataRange().getValues() : [];
    var todosSupMap = {}; // codigo → { email, nombre, celular, codigo }
    for (var i = 1; i < datosUsr.length; i++) {
      if ((datosUsr[i][2]||'').toString().trim().toUpperCase() === 'SUP-SST') {
        var cod = (datosUsr[i][4]||'').toString().trim();
        todosSupMap[cod] = {
          email:   (datosUsr[i][0]||'').toString().trim(),
          nombre:  (datosUsr[i][1]||'').toString().trim(),
          celular: (datosUsr[i][6]||'').toString().trim(),
          codigo:  cod
        };
      }
    }

    // 2. Leer DB_INSPECCIONES y DB_HALLAZGOS filtrados por período
    var hojaInsp  = ss.getSheetByName('DB_INSPECCIONES');
    var hojaHall  = ss.getSheetByName('DB_HALLAZGOS');
    var rawInsp   = hojaInsp ? hojaInsp.getDataRange().getValues().slice(1) : [];
    var rawHall   = hojaHall ? hojaHall.getDataRange().getValues().slice(1) : [];

    var insp = rawInsp.filter(function(r) { return _enPeriodo_(r[3]); }); // r[3]=Fecha_Hora
    var hall = rawHall.filter(function(r) { return _enPeriodo_(r[1]); }); // r[1]=Fecha (string)

    // 3. Filtrar por empresa si se indicó
    var emp = (params.empresa || '').toString().trim();
    if (emp) {
      insp = insp.filter(function(r) { return (r[4]||'').toString().trim() === emp; });
      hall = hall.filter(function(r) { return (r[6]||'').toString().trim() === emp; });
    }

    // 4. Función de métricas por código de supervisor
    function _metricas_(codigo) {
      var fmts   = insp.filter(function(r){ return (r[6]||'').toString().trim()===codigo; });
      var halls  = hall.filter(function(r){ return (r[7]||'').toString().trim()===codigo; });
      var fCerr  = fmts.filter(function(r){ return (r[7]||'').toString().trim()==='CERRADO CON FIRMA'; });
      var fPend  = fmts.filter(function(r){ return (r[7]||'').toString().trim()==='PENDIENTE'; });
      var hCerr  = halls.filter(function(r){ return (r[11]||'').toString().trim()==='CERRADO'; });
      var hAbie  = halls.filter(function(r){ return (r[11]||'').toString().trim()==='ABIERTO'; });
      var totAct = fmts.length + halls.length;
      var cerr   = fCerr.length + hCerr.length;
      var tasa   = totAct > 0 ? Math.round((cerr / totAct) * 100) : 100;

      var detFormatos = fmts.map(function(r){
        return {
          consecutivo: (r[1]||'').toString(),
          descripcion: (r[2]||'').toString(),
          empresa:     (r[4]||'').toString(),
          fecha:       _fmtF_(r[3]),
          estado:      (r[7]||'').toString()
        };
      });
      var detHallazgos = halls.map(function(r){
        return {
          id:          (r[0]||'').toString(),
          descripcion: (r[4]||'').toString(),
          empresa:     (r[6]||'').toString(),
          fecha:       _fmtF_(r[1]),
          estado:      (r[11]||'').toString()
        };
      });
      return {
        formatos:    { total:fmts.length, cerrado:fCerr.length, pendiente:fPend.length },
        hallazgos:   { total:halls.length, cerrado:hCerr.length, abiertos:hAbie.length },
        tasa:        tasa,
        detFormatos: detFormatos,
        detHallazgos: detHallazgos
      };
    }

    var periodo = {
      inicio: Utilities.formatDate(dInicio, tz, 'dd/MM/yyyy'),
      fin:    Utilities.formatDate(dFin,    tz, 'dd/MM/yyyy')
    };

    // 5a. Informe individual
    if (params.emailSupervisor) {
      var supEnc = null;
      for (var c in todosSupMap) {
        if (todosSupMap[c].email === params.emailSupervisor) { supEnc = todosSupMap[c]; break; }
      }
      if (!supEnc) return { status:'error', message:'Supervisor no encontrado.' };
      var met = _metricas_(supEnc.codigo);
      return { status:'success', data:{
        tipo:'individual', periodo:periodo, logoUrl:logoUrl,
        supervisor:{ nombre:supEnc.nombre, email:supEnc.email, celular:supEnc.celular },
        metricas: met
      }};
    }

    // 5b. Ranking global/empresa
    var ranking = [];
    for (var k in todosSupMap) {
      var s = todosSupMap[k];
      var m = _metricas_(s.codigo);
      ranking.push({
        nombre:    s.nombre,
        email:     s.email,
        celular:   s.celular,
        formatos:  m.formatos,
        hallazgos: m.hallazgos,
        tasa:      m.tasa
      });
    }
    // Ordenar: mayor tasa primero; empate → más actividad
    ranking.sort(function(a,b){
      if (b.tasa !== a.tasa) return b.tasa - a.tasa;
      return (b.formatos.total + b.hallazgos.total) - (a.formatos.total + a.hallazgos.total);
    });
    return { status:'success', data:{ tipo:'ranking', periodo:periodo, empresa:emp, ranking:ranking } };

  } catch(e) {
    Logger.log('Error en obtenerReporteDesempenoSTT: '+e.toString());
    return { status:'error', message: e.toString() };
  }
}

/**
 * Obtiene todos los hallazgos para la Galería de Evidencias del administrador.
 * Cruza el código del supervisor (Reportado_Por) con DB_USUARIOS para obtener
 * el nombre completo. Ordena por fecha descendente (más recientes primero).
 *
 * @return {Object} { status, data: { hallazgos, kpis, supervisores, empresas } }
 */
function obtenerGaleriaHallazgosAdmin() {
  try {
    var ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    var tz = Session.getScriptTimeZone();

    // 1. Mapa código de supervisor → nombre completo (desde DB_USUARIOS)
    var hojaUsr  = ss.getSheetByName('DB_USUARIOS');
    var datosUsr = hojaUsr ? hojaUsr.getDataRange().getValues() : [];
    var mapaSupNombre = {};   // { codigoSup: 'Nombre Completo' }
    for (var i = 1; i < datosUsr.length; i++) {
      var cod    = (datosUsr[i][4] || '').toString().trim();
      var nombre = (datosUsr[i][1] || '').toString().trim();
      if (cod) mapaSupNombre[cod] = nombre;
    }

    // Helper: formatear fecha (Date object o string dd/MM/yyyy)
    function _fmt(val) {
      if (!val) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, 'dd/MM/yyyy'); } catch(e) { return val.toString(); }
      }
      return val.toString().trim();
    }

    // Helper: formatear hora
    function _fmtH(val) {
      if (!val) return '';
      if (val instanceof Date) {
        try { return Utilities.formatDate(val, tz, 'HH:mm'); } catch(e) { return val.toString(); }
      }
      return val.toString().trim();
    }

    // 2. Leer DB_HALLAZGOS (sin cabecera)
    var hojaHall = ss.getSheetByName('DB_HALLAZGOS');
    var rawHall  = hojaHall ? hojaHall.getDataRange().getValues().slice(1) : [];

    var hallazgos    = [];
    var empresasSet  = {};
    var supervisorSet = {};

    for (var j = 0; j < rawHall.length; j++) {
      var r = rawHall[j];
      var id = (r[0] || '').toString().trim();
      if (!id) continue;  // omitir filas vacías

      var codSup    = (r[7]  || '').toString().trim();
      var nombreSup = mapaSupNombre[codSup] || codSup;
      var empresa   = (r[6]  || '').toString().trim();
      var estado    = (r[11] || '').toString().trim().toUpperCase() || 'ABIERTO';

      if (empresa)   empresasSet[empresa]     = true;
      if (nombreSup) supervisorSet[nombreSup] = true;

      hallazgos.push({
        id:               id,
        fecha:            _fmt(r[1]),
        hora:             _fmtH(r[2]),
        ubicacion:        (r[3]  || '').toString().trim(),
        descripcion:      (r[4]  || '').toString().trim(),
        urlFoto:          (r[5]  || '').toString().trim(),
        empresa:          empresa,
        supervisorCod:    codSup,
        supervisor:       nombreSup,
        reportadoA:       (r[8]  || '').toString().trim(),
        gestionRealizada: (r[10] || '').toString().trim(),
        estado:           estado,
        fechaCierre:      _fmt(r[12]),
        horaCierre:       _fmtH(r[13]),
        urlFotoCierre:    (r[14] || '').toString().trim()
      });
    }

    // 3. Ordenar por fecha descendente (más reciente primero)
    hallazgos.sort(function(a, b) {
      function _parseD(s) {
        if (!s) return 0;
        var p = s.split('/');
        return p.length === 3 ? parseInt(p[2] + p[1] + p[0]) : 0;
      }
      var da = _parseD(a.fecha), db = _parseD(b.fecha);
      if (db !== da) return db - da;
      return (b.hora || '') > (a.hora || '') ? 1 : -1;
    });

    // 4. KPIs globales
    var total    = hallazgos.length;
    var cerrados = hallazgos.filter(function(h){ return h.estado === 'CERRADO'; }).length;
    var abiertos = total - cerrados;
    var pcCierre = total > 0 ? Math.round((cerrados / total) * 100) : 0;

    return {
      status: 'success',
      data: {
        hallazgos:   hallazgos,
        kpis:        { total: total, abiertos: abiertos, cerrados: cerrados, pcCierre: pcCierre },
        supervisores: Object.keys(supervisorSet).sort(),
        empresas:     Object.keys(empresasSet).sort()
      }
    };

  } catch(e) {
    Logger.log('Error en obtenerGaleriaHallazgosAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

// ══════════════════════════════════════════════════════════════════════
// MIGRACIÓN: Reorganizar evidencias existentes a nueva estructura
// Ejecutar UNA VEZ desde el Editor de Apps Script → Ejecutar
// ══════════════════════════════════════════════════════════════════════

/**
 * Extrae el ID de un archivo de Google Drive desde su URL.
 * Soporta: /file/d/ID/, /open?id=ID, id=ID en query params.
 * @param {string} url URL del archivo en Drive.
 * @return {string|null} ID del archivo o null.
 */
function _extraerFileIdDeUrl(url) {
  if (!url) return null;
  var str = url.toString().trim();
  // /file/d/FILE_ID/
  var m1 = str.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id=FILE_ID o &id=FILE_ID
  var m2 = str.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // /open?id=FILE_ID
  var m3 = str.match(/open\?id=([a-zA-Z0-9_-]+)/);
  if (m3) return m3[1];
  return null;
}

/**
 * Mueve un archivo de Drive a una carpeta destino y lo renombra.
 * @param {string} fileId      ID del archivo en Drive.
 * @param {Folder} carpetaDest Carpeta destino.
 * @param {string} nuevoNombre Nuevo nombre para el archivo.
 * @return {boolean} true si se movió correctamente.
 */
function _moverYRenombrar(fileId, carpetaDest, nuevoNombre) {
  try {
    var archivo = DriveApp.getFileById(fileId);
    // Renombrar
    if (nuevoNombre) archivo.setName(nuevoNombre);
    // Mover: agregar a nueva carpeta, quitar de las anteriores
    var padresIt = archivo.getParents();
    carpetaDest.addFile(archivo);
    while (padresIt.hasNext()) {
      var padre = padresIt.next();
      if (padre.getId() !== carpetaDest.getId()) {
        padre.removeFile(archivo);
      }
    }
    return true;
  } catch (e) {
    Logger.log('_moverYRenombrar error [' + fileId + ']: ' + e.toString());
    return false;
  }
}

/**
 * Obtiene o crea una subcarpeta dentro de una carpeta padre.
 */
function _getOrCreateFolder(padre, nombre) {
  var it = padre.getFoldersByName(nombre);
  return it.hasNext() ? it.next() : padre.createFolder(nombre);
}

/**
 * Parsea una fecha en formato "dd/MM/yyyy" a un objeto Date.
 */
function _parseFechaDDMMYYYY(str) {
  if (!str) return null;
  if (str instanceof Date) return str;
  var s = str.toString().trim();
  var p = s.split('/');
  if (p.length === 3) return new Date(p[2], parseInt(p[1]) - 1, p[0]);
  return new Date(s);
}

/**
 * EJECUTAR UNA VEZ — Migra TODAS las evidencias existentes a la nueva estructura:
 *   ROOT/[Empresa]/Evidencia_Formatos/
 *   ROOT/[Empresa]/Evidencia_Hallazgos/
 *   ROOT/Evidencia_Asistencias/
 *
 * También renombra archivos con la convención: Tipo_Consecutivo_Empresa_DD_MM_YYYY
 *
 * Ejecutar desde: Editor de Apps Script → seleccionar función → ▶ Ejecutar
 * Ver resultados en: Ver → Registro de ejecución
 */
function migrarEvidenciasANuevaEstructura() {
  var ss = _getSpreadsheet();
  var params = getParametros().data || {};
  var rootId = _parseFolderId(params.DRIVE_ROOT_FOLDER_ID);

  if (!rootId) {
    Logger.log('❌ ERROR: No se encontró DRIVE_ROOT_FOLDER_ID en PARAM_SISTEMA');
    return;
  }

  var carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(rootId);
  } catch (e) {
    Logger.log('❌ ERROR: No se pudo acceder a la carpeta raíz: ' + e.toString());
    return;
  }

  var totalMovidos = 0;
  var totalErrores = 0;
  var totalOmitidos = 0;

  // ── 1. DB_INSPECCIONES (Formatos) ─────────────────────────────────
  Logger.log('═══ MIGRANDO FORMATOS (DB_INSPECCIONES) ═══');
  var hojaInsp = ss.getSheetByName('DB_INSPECCIONES');
  if (hojaInsp) {
    var datosInsp = hojaInsp.getDataRange().getValues();
    // Schema: A(0):Id_formato | B(1):Consecutivo | C(2):Descripcion | D(3):Fecha_Hora
    //         E(4):Empresa | F(5):Foto_Formato_URL | G(6):Reportado_Por | H(7):Estado
    //         I(8):Foto_Firma_URL | J(9):Fecha_Cierre
    for (var i = 1; i < datosInsp.length; i++) {
      var consecutivo = (datosInsp[i][1] || '').toString().trim();
      var empresa     = (datosInsp[i][4] || '').toString().trim();
      var fotoUrl     = (datosInsp[i][5] || '').toString().trim();
      var firmaUrl    = (datosInsp[i][8] || '').toString().trim();
      var fechaReg    = datosInsp[i][3]; // Date object o string

      if (!empresa) { totalOmitidos++; continue; }

      var carpetaEmp = _getOrCreateFolder(carpetaRaiz, _sanitizeName(empresa));
      var carpetaFmt = _getOrCreateFolder(carpetaEmp, 'Evidencia_Formatos');
      var fechaStr   = _fechaParaNombre(fechaReg instanceof Date ? fechaReg : _parseFechaDDMMYYYY(fechaReg));

      // Foto inicial del formato
      if (fotoUrl && fotoUrl !== 'Sin foto') {
        var fId = _extraerFileIdDeUrl(fotoUrl);
        if (fId) {
          var nombre = 'Formato_' + _sanitizeName(consecutivo) + '_' + _sanitizeName(empresa) + '_' + fechaStr + '.png';
          if (_moverYRenombrar(fId, carpetaFmt, nombre)) {
            totalMovidos++;
            Logger.log('  ✅ Formato: ' + nombre);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }

      // Foto de firma
      if (firmaUrl && firmaUrl !== 'Sin foto firma' && firmaUrl !== '') {
        var fIdFirma = _extraerFileIdDeUrl(firmaUrl);
        if (fIdFirma) {
          var nombreFirma = 'Firma_' + _sanitizeName(consecutivo) + '_' + _sanitizeName(empresa) + '_' + fechaStr + '.png';
          if (_moverYRenombrar(fIdFirma, carpetaFmt, nombreFirma)) {
            totalMovidos++;
            Logger.log('  ✅ Firma: ' + nombreFirma);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }
    }
  }

  // ── 2. DB_HALLAZGOS ───────────────────────────────────────────────
  Logger.log('═══ MIGRANDO HALLAZGOS (DB_HALLAZGOS) ═══');
  var hojaHall = ss.getSheetByName('DB_HALLAZGOS');
  if (hojaHall) {
    var datosHall = hojaHall.getDataRange().getValues();
    // Schema: A(0):Id_hallazgo | B(1):Fecha | C(2):Hora | ... | E(4):Descripcion
    //         F(5):Foto_URL | G(6):Empresa | ... | L(11):Estado | ... | O(14):Foto_Cierre
    for (var j = 1; j < datosHall.length; j++) {
      var idHall      = (datosHall[j][0] || '').toString().trim();
      var fechaHall   = datosHall[j][1]; // string dd/MM/yyyy
      var fotoHall    = (datosHall[j][5] || '').toString().trim();
      var empresaHall = (datosHall[j][6] || '').toString().trim();
      var fotoCierre  = (datosHall[j][14] || '').toString().trim();

      if (!empresaHall) { totalOmitidos++; continue; }

      var carpetaEmpH = _getOrCreateFolder(carpetaRaiz, _sanitizeName(empresaHall));
      var carpetaHall = _getOrCreateFolder(carpetaEmpH, 'Evidencia_Hallazgos');
      var fechaHStr   = _fechaParaNombre(_parseFechaDDMMYYYY(fechaHall));

      // Foto de evidencia del hallazgo
      if (fotoHall && fotoHall !== 'Sin foto') {
        var fIdH = _extraerFileIdDeUrl(fotoHall);
        if (fIdH) {
          var nombreH = 'Hallazgo_' + _sanitizeName(idHall) + '_' + _sanitizeName(empresaHall) + '_' + fechaHStr + '.png';
          if (_moverYRenombrar(fIdH, carpetaHall, nombreH)) {
            totalMovidos++;
            Logger.log('  ✅ Hallazgo: ' + nombreH);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }

      // Foto de cierre
      if (fotoCierre && fotoCierre !== 'Sin foto cierre' && fotoCierre !== '') {
        var fIdC = _extraerFileIdDeUrl(fotoCierre);
        if (fIdC) {
          var fechaCStr = _fechaParaNombre(_parseFechaDDMMYYYY(datosHall[j][12])) || fechaHStr;
          var nombreC = 'Hallazgo_Cierre_' + _sanitizeName(idHall) + '_' + _sanitizeName(empresaHall) + '_' + fechaCStr + '.png';
          if (_moverYRenombrar(fIdC, carpetaHall, nombreC)) {
            totalMovidos++;
            Logger.log('  ✅ Cierre: ' + nombreC);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }
    }
  }

  // ── 3. DB_ASISTENCIA ──────────────────────────────────────────────
  Logger.log('═══ MIGRANDO ASISTENCIAS (DB_ASISTENCIA) ═══');
  var hojaAsis = ss.getSheetByName('DB_ASISTENCIA');
  if (hojaAsis) {
    var datosAsis = hojaAsis.getDataRange().getValues();
    var carpetaAsist = _getOrCreateFolder(carpetaRaiz, 'Evidencia_Asistencias');
    // Schema: A(0):ID | B(1):Email | C(2):Nombre | D(3):Fecha | ... | H(7):Obra
    //         I(8):Foto_Entrada_URL | J(9):Foto_Salida_URL
    for (var k = 1; k < datosAsis.length; k++) {
      var nombreSup = (datosAsis[k][2] || '').toString().trim();
      var fechaAsis = datosAsis[k][3]; // string dd/MM/yyyy
      var obraAsis  = (datosAsis[k][7] || 'General').toString().trim();
      var fotoIn    = (datosAsis[k][8] || '').toString().trim();
      var fotoOut   = (datosAsis[k][9] || '').toString().trim();
      var fechaAStr = _fechaParaNombre(_parseFechaDDMMYYYY(fechaAsis));

      // Foto de ingreso
      if (fotoIn && fotoIn !== 'Sin foto') {
        var fIdIn = _extraerFileIdDeUrl(fotoIn);
        if (fIdIn) {
          var nombreIn = 'Ingreso_' + _sanitizeName(nombreSup) + '_' + _sanitizeName(obraAsis) + '_' + fechaAStr + '.png';
          if (_moverYRenombrar(fIdIn, carpetaAsist, nombreIn)) {
            totalMovidos++;
            Logger.log('  ✅ Ingreso: ' + nombreIn);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }

      // Foto de salida
      if (fotoOut && fotoOut !== 'Sin foto') {
        var fIdOut = _extraerFileIdDeUrl(fotoOut);
        if (fIdOut) {
          var nombreOut = 'Salida_' + _sanitizeName(nombreSup) + '_' + _sanitizeName(obraAsis) + '_' + fechaAStr + '.png';
          if (_moverYRenombrar(fIdOut, carpetaAsist, nombreOut)) {
            totalMovidos++;
            Logger.log('  ✅ Salida: ' + nombreOut);
          } else { totalErrores++; }
        } else { totalOmitidos++; }
      }
    }
  }

  // ── RESUMEN ───────────────────────────────────────────────────────
  Logger.log('');
  Logger.log('══════════════════════════════════════════');
  Logger.log('  MIGRACIÓN COMPLETADA');
  Logger.log('  ✅ Movidos y renombrados: ' + totalMovidos);
  Logger.log('  ⚠️ Omitidos (sin URL válida): ' + totalOmitidos);
  Logger.log('  ❌ Errores: ' + totalErrores);
  Logger.log('══════════════════════════════════════════');
}
