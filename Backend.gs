/**
 * BACKEND.gs
 * Lógica principal para el procesamiento de datos de inspección.
 * Este archivo maneja la comunicación entre el Frontend y Google Sheets / Drive.
 */

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

    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    const nombreEmpresa = data.nombreCliente || "Empresa_General";

    // 1. Generar ID bajo lock para garantizar unicidad
    const idRegistro = _generarProximoIdRegistro(data.idFormato, ss);
    const fechaHora  = new Date();

    // 2. Guardar evidencia inicial en Drive → [Empresa]/FORMATOS_GESTIONADOS/
    let urlFoto = "Sin foto";
    if (data.archivoBase64) {
      const params        = getParametros().data || {};
      const idCarpetaRaiz = params.DRIVE_ROOT_FOLDER_ID;
      const nombreArchivo = `${idRegistro}_${nombreEmpresa}_INICIAL.png`;
      urlFoto = guardarImagenEnDrive(
        data.archivoBase64, nombreArchivo, nombreEmpresa, idCarpetaRaiz, 'FORMATOS_GESTIONADOS'
      );
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
 * Genera el próximo ID correlativo para un formato específico.
 */
function _generarProximoIdRegistro(idFormato, ss) {
  const hoja = ss.getSheetByName('DB_INSPECCIONES');
  const data = hoja.getDataRange().getValues();
  let contador = 0;

  // Columna A (índice 0) = Id_formato (ej: "ATS")
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(idFormato).trim()) {
      contador++;
    }
  }

  const correlativo = (contador + 1).toString().padStart(4, '0');
  return `FMT-${idFormato}-${correlativo}`;
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
            const nombreArchivo = `${idRegistro}_${empresa}_FIRMA.png`;
            urlFirma = guardarImagenEnDrive(
              archivoBase64, nombreArchivo, empresa, idCarpetaRaiz, 'FORMATOS_GESTIONADOS'
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
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
function guardarImagenEnDrive(base64Data, nombreArchivo, nombreEmpresa, idCarpetaRaiz, subCarpeta) {
  // 1. Decodificar la imagen
  const partes = base64Data.split(',');
  const contentType = partes[0].split(':')[1].split(';')[0];
  const decodedData = Utilities.base64Decode(partes[1]);
  const blob = Utilities.newBlob(decodedData, contentType, nombreArchivo);

  // 2. Carpeta raíz
  let carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(idCarpetaRaiz);
  } catch (e) {
    Logger.log("Error al acceder a la carpeta raíz: " + e.toString());
    const iterador = DriveApp.getFoldersByName("SST_RESPALDO_EV");
    carpetaRaiz = iterador.hasNext() ? iterador.next() : DriveApp.createFolder("SST_RESPALDO_EV");
  }

  // 3. Subcarpeta por cliente
  const iterCliente = carpetaRaiz.getFoldersByName(nombreEmpresa);
  const carpetaCliente = iterCliente.hasNext()
    ? iterCliente.next()
    : carpetaRaiz.createFolder(nombreEmpresa);

  // 4. Subcarpeta adicional si se especificó (ej: FORMATOS_GESTIONADOS)
  let carpetaDestino = carpetaCliente;
  if (subCarpeta) {
    const iterSub = carpetaCliente.getFoldersByName(subCarpeta);
    carpetaDestino = iterSub.hasNext()
      ? iterSub.next()
      : carpetaCliente.createFolder(subCarpeta);
  }

  // 5. Crear archivo y dar permisos de lectura
  const archivo = carpetaDestino.createFile(blob);
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
    const ss    = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
        clientes.push({ id: id, nombre: nombre });
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
// Esquema DB_USUARIOS: A=ID_Usuario B=Email C=Nombre_Completo D=Rol
//                      E=Password F=ID_Cliente_Asociado G=Cedula
//                      H=Celular_Whatsapp I=Estado (ACTIVO/INACTIVO)
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los usuarios (sin contraseña) para el panel admin.
 */
function obtenerUsuariosAdmin() {
  try {
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'success', data: [] };

    const datos    = hoja.getDataRange().getValues();
    const usuarios = [];
    for (let i = 1; i < datos.length; i++) {
      const id = (datos[i][0] || '').toString().trim();
      if (!id) continue;
      usuarios.push({
        id:        id,
        email:     (datos[i][1] || '').toString().trim(),
        nombre:    (datos[i][2] || '').toString().trim(),
        rol:       (datos[i][3] || '').toString().trim(),
        idCliente: (datos[i][5] || '').toString().trim(),
        cedula:    (datos[i][6] || '').toString().trim(),
        celular:   (datos[i][7] || '').toString().trim(),
        estado:    (datos[i][8] || 'ACTIVO').toString().trim().toUpperCase()
      });
    }
    return { status: 'success', data: usuarios };
  } catch (e) {
    Logger.log('Error en obtenerUsuariosAdmin: ' + e.toString());
    return { status: 'error', message: e.toString() };
  }
}

/**
 * Genera el próximo ID de usuario según el prefijo del rol.
 * Ej: rol "SUP-SST" → prefijo "SUP" → "SUP-003"
 */
function _generarIdUsuario_(rol, hoja) {
  const prefijo = (rol || '').split('-')[0].toUpperCase() || 'USR';
  const datos   = hoja.getDataRange().getValues();
  let   contador = 0;
  for (let i = 1; i < datos.length; i++) {
    const id = (datos[i][0] || '').toString().trim();
    if (id.startsWith(prefijo + '-')) contador++;
  }
  return prefijo + '-' + String(contador + 1).padStart(3, '0');
}

/**
 * Crea un nuevo usuario. Valida email duplicado y genera ID automático.
 */
function crearUsuario(datos) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const emailNuevo = (datos.email || '').toString().trim().toLowerCase();
    if (!emailNuevo) return { status: 'error', message: 'El email es obligatorio.' };
    if (!datos.password) return { status: 'error', message: 'La contraseña es obligatoria.' };

    // Verificar email duplicado
    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][1] || '').toString().trim().toLowerCase() === emailNuevo) {
        return { status: 'error', message: 'Ya existe un usuario con ese email.' };
      }
    }

    const nuevoId = _generarIdUsuario_(datos.rol, hoja);
    hoja.appendRow([
      nuevoId,                                        // A: ID_Usuario
      emailNuevo,                                     // B: Email
      (datos.nombre    || '').toString().trim(),      // C: Nombre_Completo
      (datos.rol       || '').toString().trim(),      // D: Rol
      (datos.password  || '').toString(),             // E: Password
      (datos.idCliente || '').toString().trim(),      // F: ID_Cliente_Asociado
      (datos.cedula    || '').toString().trim(),      // G: Cedula
      (datos.celular   || '').toString().trim(),      // H: Celular_Whatsapp
      'ACTIVO'                                        // I: Estado
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
 * Actualiza los datos de un usuario (sin cambiar contraseña ni email).
 */
function actualizarUsuario(datos) {
  try {
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim() === datos.id) {
        const fila = i + 1;
        hoja.getRange(fila, 3).setValue((datos.nombre    || '').toString().trim()); // C
        hoja.getRange(fila, 4).setValue((datos.rol       || '').toString().trim()); // D
        hoja.getRange(fila, 6).setValue((datos.idCliente || '').toString().trim()); // F
        hoja.getRange(fila, 7).setValue((datos.cedula    || '').toString().trim()); // G
        hoja.getRange(fila, 8).setValue((datos.celular   || '').toString().trim()); // H
        hoja.getRange(fila, 9).setValue((datos.estado    || 'ACTIVO').toString().trim().toUpperCase()); // I
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
 * Resetea la contraseña de un usuario.
 */
function resetPasswordUsuario(idUsuario, newPassword) {
  try {
    if (!newPassword || newPassword.toString().length < 4) {
      return { status: 'error', message: 'La contraseña debe tener al menos 4 caracteres.' };
    }
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim() === idUsuario) {
        hoja.getRange(i + 1, 5).setValue(newPassword.toString()); // E: Password
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
 * Alterna el estado ACTIVO/INACTIVO de un usuario.
 */
function toggleEstadoUsuario(idUsuario) {
  try {
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: 'error', message: 'Hoja DB_USUARIOS no encontrada.' };

    const filas = hoja.getDataRange().getValues();
    for (let i = 1; i < filas.length; i++) {
      if ((filas[i][0] || '').toString().trim() === idUsuario) {
        const estadoActual = (filas[i][8] || 'ACTIVO').toString().trim().toUpperCase();
        const nuevoEstado  = estadoActual === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
        hoja.getRange(i + 1, 9).setValue(nuevoEstado); // I: Estado
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

// ══════════════════════════════════════════════════════════
// ADMINISTRACIÓN DE CLIENTES/EMPRESAS
// ══════════════════════════════════════════════════════════

/**
 * Devuelve todos los campos de DB_CLIENTES para el panel de administración.
 * @return {Object} Lista completa de clientes con todos sus campos.
 */
function obtenerListaClientesAdmin() {
  try {
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
        estado:    estado
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
      hoja.appendRow(fila);
      SpreadsheetApp.flush();
      return { status: 'success', message: 'Empresa creada con ID: ' + nuevoId, data: { id: nuevoId } };
    }
  } catch (e) {
    Logger.log('Error en guardarCliente: ' + e.toString());
    return { status: 'error', message: e.toString() };
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
    const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
      const ss   = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const hoja = ss.getSheetByName('DB_USUARIOS');
      if (!hoja) return { status: 'error', message: 'La hoja DB_USUARIOS no existe.' };

      // Esquema DB_USUARIOS: A=ID_Usuario B=Email C=Nombre D=Rol E=Password F=ID_Cliente G=Cedula H=Celular I=Estado
      const datos = hoja.getDataRange().getValues();
      usuarios    = [];
      for (let i = 1; i < datos.length; i++) {
        const id = (datos[i][0] || '').toString().trim();
        if (!id) continue;
        usuarios.push({
          id:        id,
          email:     (datos[i][1] || '').toString().trim().toLowerCase(),
          nombre:    datos[i][2],
          rol:       datos[i][3],
          password:  (datos[i][4] || '').toString(),
          idCliente: datos[i][5] || '',
          estado:    (datos[i][8] || 'activo').toString().toLowerCase()
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
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_ASISTENCIA');
    const user = getUserDataFromApp(data.userEmail); // Función auxiliar para validar contra DB_USUARIOS
    
    const fechaActual = new Date();
    const idAsistencia = "ASIS-" + fechaActual.getTime();
    
    // Determinar Tipo de Día
    const tipoDia = getTipoDia(fechaActual);
    
    // Guardar Foto en Drive
    let urlFoto = "Sin foto";
    if (data.archivoBase64) {
      const params = getParametros().data || {};
      const folderId = params.DRIVE_ROOT_FOLDER_ID;
      // Carpeta dedicada según requerimiento
      const nombreCarpeta = "FOTOS_REGISTRO_ASISTENCIA_SUP_STT";
      urlFoto = guardarImagenEnDrive(data.archivoBase64, `INGRESO_${user.nombre}_${fechaActual.getTime()}.png`, nombreCarpeta, folderId);
    }

    // [ID_Asis, Email, Nombre, Fecha, H_In, H_Out, Tipo, Obra, Foto_In, Foto_Out, Estado]
    const nuevaFila = [
      idAsistencia,
      user.email,
      user.nombre,
      Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), "dd/MM/yyyy"),
      Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), "HH:mm:ss"),
      "", // Hora Salida
      tipoDia,
      data.obra || "Generica",
      urlFoto,
      "", // Foto Salida
      "ACTIVO"
    ];

    hoja.appendRow(nuevaFila);
    return { status: "success", message: "Ingreso registrado correctamente.", data: { id: idAsistencia } };
  } catch (e) {
    return { status: "error", message: "Error al registrar ingreso: " + e.toString() };
  }
}

/**
 * REGISTRO DE ASISTENCIA (SALIDA)
 */
function registrarSalida(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_ASISTENCIA');
    const email = data.userEmail;
    
    const datos = hoja.getDataRange().getValues();
    let filaIndex = -1;
    
    // Buscar registro ACTIVO del usuario
    for (let i = datos.length - 1; i >= 1; i--) {
      if (datos[i][1] === email && datos[i][10] === "ACTIVO") {
        filaIndex = i + 1;
        break;
      }
    }
    
    if (filaIndex === -1) throw new Error("No se encontró un ingreso activo para cerrar.");

    const fechaActual = new Date();
    let urlFoto = "Sin foto";
    if (data.archivoBase64) {
      const params = getParametros().data || {};
      const nombreCarpeta = "FOTOS_REGISTRO_ASISTENCIA_SUP_STT";
      urlFoto = guardarImagenEnDrive(data.archivoBase64, `SALIDA_${email}_${fechaActual.getTime()}.png`, nombreCarpeta, params.DRIVE_ROOT_FOLDER_ID);
    }

    hoja.getRange(filaIndex, 6).setValue(Utilities.formatDate(fechaActual, Session.getScriptTimeZone(), "HH:mm:ss"));
    hoja.getRange(filaIndex, 10).setValue(urlFoto);
    hoja.getRange(filaIndex, 11).setValue("CERRADO");

    return { status: "success", message: "Salida registrada. ¡Buen descanso!" };
  } catch (e) {
    return { status: "error", message: "Error al registrar salida: " + e.toString() };
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
 */
function getUserDataFromApp(email) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const hoja = ss.getSheetByName('DB_USUARIOS');
  const datos = hoja.getDataRange().getValues();
  const emailLower = (email || '').toString().trim().toLowerCase();
  for (let i = 1; i < datos.length; i++) {
    if ((datos[i][0] || '').toString().trim().toLowerCase() === emailLower) {
      return {
        email:  datos[i][0],
        nombre: datos[i][1],
        codigo: (datos[i][4] || '').toString()   // ID_Cliente_Asociado → Codigo_Supervisor
      };
    }
  }
  return { email: email, nombre: "Supervisor", codigo: '' };
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
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
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
 * Obtiene los datos completos del usuario a partir de su email.
 * Usado para recuperar sesión cuando localStorage falla en el iframe de GAS.
 * @param {string} email - Email del usuario a buscar.
 */
function obtenerDatosUsuario(email) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    if (!hoja) return { status: "error", message: "Hoja DB_USUARIOS no encontrada." };

    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] === email) {
        return {
          status: "success",
          data: {
            email: datos[i][0],
            nombre: datos[i][1],
            rol: datos[i][2],
            idCliente: datos[i][4] || '',
            codigo: datos[i][4] || '' // Columna E
          }
        };
      }
    }
    return { status: "error", message: "Usuario no encontrado." };
  } catch (e) {
    return { status: "error", message: e.toString() };
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
