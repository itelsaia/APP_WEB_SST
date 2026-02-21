/**
 * BACKEND.gs
 * Lógica principal para el procesamiento de datos de inspección.
 * Este archivo maneja la comunicación entre el Frontend y Google Sheets / Drive.
 */

/**
 * Función principal para guardar una nueva inspección.
 * @param {Object} data Objeto enviado desde el formulario con los campos de inspección.
 * @return {Object} Respuesta estandarizada JSON.
 */
function guardarInspeccion(data) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    
    // 1. Manejo de la Evidencia (Imagen en Base64)
    let urlEvidencia = "Sin evidencia";
    if (data.archivoBase64) {
      // Obtener el ID de la carpeta raíz de la configuración
      const params = getParametros().data || {};
      const idCarpetaRaiz = params.DRIVE_ROOT_FOLDER_ID;
      
      // Nombre del cliente final (el de la constructora, ej: Argos SA)
      const nombreClienteFinal = data.nombreCliente || "Cliente_Desconocido";
      
      // Crear un nombre descriptivo para el archivo: [CLIENTE]_[TIPO]_[TIMESTAMP]
      const clienteLimpio = nombreClienteFinal.replace(/[^a-z0-9]/gi, '_');
      const hallazgoLimpio = (data.tipoActividad || "HALLAZGO").replace(/[^a-z0-9]/gi, '_');
      const nombreDescriptivo = `${clienteLimpio}_${hallazgoLimpio}_${new Date().getTime()}.png`;
      
      urlEvidencia = guardarImagenEnDrive(data.archivoBase64, nombreDescriptivo, nombreClienteFinal, idCarpetaRaiz);
    }
    
    // 2. Generar ID Único para el registro (Basado en timestamp + random)
    const idRegistro = "REG-" + new Date().getTime();
    const fechaHora = new Date();
    
    // 4. Preparar la fila para insertar
    // Orden Original + Codigo al final
    const nuevaFila = [
      idRegistro,
      fechaHora,
      data.userEmail || "Sistema",
      data.idCliente || "CLIENTE-GENERAL",
      data.tipoActividad,
      data.hallazgoDetalle,
      urlEvidencia,
      data.prioridadInicial,
      data.userCode || "" // Código del supervisor al final (Columna I)
    ];
    
    // 4. Insertar datos en la hoja
    hoja.appendRow(nuevaFila);
    
    // 5. [INTEGRACIÓN CON IA]
    // Llamado al módulo AI_Core.gs para analizar el hallazgo de forma asíncrona (opcional con Trigger) 
    // o directa. Para esta versión, lo ejecutamos directamente.
    try {
      const analisis = AI_CORE.analizarHallazgo(data.hallazgoDetalle, urlEvidencia);
      AI_CORE.guardarAnalisis(idRegistro, analisis);
    } catch (aiError) {
      Logger.log("Error al procesar IA: " + aiError.toString());
    }
    
    return {
      status: "success",
      message: "Inspección guardada correctamente con ID: " + idRegistro,
      data: { id: idRegistro }
    };
    
  } catch (e) {
    Logger.log("Error en guardarInspeccion: " + e.toString());
    return {
      status: "error",
      message: "No se pudo guardar el reporte: " + e.toString()
    };
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
function guardarImagenEnDrive(base64Data, nombreArchivo, nombreEmpresa, idCarpetaRaiz) {
  // 1. Decodificar la imagen
  const partes = base64Data.split(',');
  const contentType = partes[0].split(':')[1].split(';')[0];
  const decodedData = Utilities.base64Decode(partes[1]);
  const blob = Utilities.newBlob(decodedData, contentType, nombreArchivo);
  
  // 2. Obtener la carpeta RAÍZ (donde Security Work guarda todo)
  let carpetaRaiz;
  try {
    carpetaRaiz = DriveApp.getFolderById(idCarpetaRaiz);
  } catch (e) {
    Logger.log("Error al acceder a la carpeta raíz: " + e.toString());
    // Backup: crear una carpeta en la raíz de Drive si el ID falla
    const iterador = DriveApp.getFoldersByName("SST_RESPALDO_EV");
    carpetaRaiz = iterador.hasNext() ? iterador.next() : DriveApp.createFolder("SST_RESPALDO_EV");
  }
  
  // 3. Obtener o crear SUB-CARPETA por Cliente Final (ej: Argos SA)
  let carpetaCliente;
  const iteradorCliente = carpetaRaiz.getFoldersByName(nombreEmpresa);
  
  if (iteradorCliente.hasNext()) {
    carpetaCliente = iteradorCliente.next();
  } else {
    carpetaCliente = carpetaRaiz.createFolder(nombreEmpresa);
    Logger.log("Nueva subcarpeta creada para el cliente: " + nombreEmpresa);
  }
  
  // 4. Guardar archivo y dar permisos
  const archivo = carpetaCliente.createFile(blob);
  archivo.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return archivo.getUrl();
}

/**
 * Obtiene la lista de clientes registrados en DB_CLIENTES.
 * @return {Object} Respuesta con la lista de clientes.
 */
function obtenerClientesRegistrados() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_CLIENTES');
    const datos = hoja.getDataRange().getValues();
    
    // Obviamos encabezados (ID_Cliente, Nombre_Empresa, NIT, Correo_Gerente, Estado)
    const clientes = [];
    for (let i = 1; i < datos.length; i++) {
       const estado = (datos[i][4] || "").toString().toLowerCase();
       if (estado === 'activo') { // Comparación insensible a mayúsculas
         clientes.push({
           id: datos[i][0],
           nombre: datos[i][1]
         });
       }
    }
    
    return {
      status: "success",
      data: clientes
    };
  } catch (e) {
    return { status: "error", message: e.toString() };
  }
}

/**
 * Valida las credenciales del usuario contra la hoja DB_USUARIOS.
 * @param {String} email Correo del usuario.
 * @param {String} password Contraseña ingresada.
 * @return {Object} Resultado con datos del usuario o error.
 */
function validarCredenciales(email, password) {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_USUARIOS');
    
    if (!hoja) {
      return { status: "error", message: "La hoja DB_USUARIOS no existe." };
    }
    
    const datos = hoja.getDataRange().getValues();
    
    // Buscar el usuario por email (columna A)
    for (let i = 1; i < datos.length; i++) {
      const dbEmail = datos[i][0];
      const dbPass = datos[i][3]; // Columna D (Pasword)
      const dbEstado = (datos[i][5] || "").toString().toLowerCase(); // Columna F (Estado)
      
      if (dbEmail === email) {
        if (dbEstado !== 'activo') {
          return { status: "error", message: "Usuario inactivo. Contacte al administrador." };
        }
        
        if (dbPass.toString() === password.toString()) {
          // Éxito: devolver datos básicos (sin password)
          return {
            status: "success",
            data: {
              email: dbEmail,
              nombre: datos[i][1],
              rol: datos[i][2],
              idCliente: datos[i][4],
              codigo: datos[i][4] || "" // Usar Columna E (ej: SUP-001) como código
            }
          };
        } else {
          return { status: "error", message: "Contraseña incorrecta." };
        }
      }
    }
    
    return { status: "error", message: "Usuario no encontrado." };
    
  } catch (e) {
    return { status: "error", message: "Error en validación: " + e.toString() };
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
  for (let i = 1; i < datos.length; i++) {
    if (datos[i][0] === email) return { email: datos[i][0], nombre: datos[i][1] };
  }
  return { email: email, nombre: "Supervisor" };
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
