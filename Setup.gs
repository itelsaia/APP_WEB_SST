/**
 * SETUP.gs
 * Ejecutar la función 'inicializarBaseDeDatos' una sola vez para configurar el entorno.
 * Este script crea las hojas y los encabezados requeridos por el PRD.
 */

function inicializarBaseDeDatos() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  const hojasRequeridas = [
    { 
      nombre: 'PARAM_SISTEMA', 
      encabezados: ['Parametro', 'Valor', 'Descripcion'] 
    },
    { 
      nombre: 'DB_CLIENTES', 
      encabezados: ['ID_Cliente', 'Nombre_Empresa', 'NIT', 'Correo_Gerente', 'Estado'] 
    },
    { 
      nombre: 'DB_USUARIOS', 
      encabezados: ['Email', 'Nombre_Completo', 'Rol', 'Password', 'ID_Cliente_Asociado', 'Estado'] 
    },
    { 
      nombre: 'DB_INSPECCIONES', 
      encabezados: ['ID_Registro', 'Fecha_Hora', 'Email_Supervisor', 'ID_Cliente', 'Tipo_Actividad', 'Hallazgo_Detalle', 'URL_Evidencia', 'Prioridad_Inicial'] 
    },
    { 
      nombre: 'DB_ANALISIS_IA', 
      encabezados: ['ID_Registro_Padre', 'Diagnostico_IA', 'Plan_Accion_Recomendado', 'Nivel_Riesgo_IA'] 
    },
    { 
      nombre: 'LISTAS_SISTEMA', 
      encabezados: ['Categoria', 'Item'] 
    },
    { 
      nombre: 'DB_ASISTENCIA', 
      encabezados: ['ID_Asistencia', 'Email_Supervisor', 'Nombre_Completo', 'Fecha', 'Hora_Entrada', 'Hora_Salida', 'Tipo_Dia', 'Obra_Proyecto', 'Foto_Entrada_URL', 'Foto_Salida_URL', 'Estado'] 
    }
  ];

  hojasRequeridas.forEach(configHoja => {
    let hoja = ss.getSheetByName(configHoja.nombre);
    
    if (!hoja) {
      hoja = ss.insertSheet(configHoja.nombre);
      Logger.log('Hoja creada: ' + configHoja.nombre);
    } else {
      Logger.log('La hoja ya existe: ' + configHoja.nombre);
    }

    // Configurar encabezados si la hoja está vacía
    if (hoja.getLastRow() === 0) {
      hoja.getRange(1, 1, 1, configHoja.encabezados.length).setValues([configHoja.encabezados]);
      hoja.setFrozenRows(1); // Congelar fila superior
      Logger.log('Encabezados insertados en: ' + configHoja.nombre);
    }
  });

  // Insertar valores por defecto en PARAM_SISTEMA si está vacía
  const hojaParam = ss.getSheetByName('PARAM_SISTEMA');
  if (hojaParam.getLastRow() <= 1) {
    const valoresIniciales = [
      ['COLOR_PRIMARIO', '#1E3A8A', 'Color principal de la marca (Hex)'],
      ['COLOR_ACENTO', '#F59E0B', 'Color de acento o alertas (Hex)'],
      ['URL_LOGO', 'https://via.placeholder.com/150', 'URL del logo de la empresa'],
      ['NOMBRE_EMPRESA', 'SECURITY WORK S&M', 'Nombre de la empresa que adquirio el desarrollo'],
      ['DRIVE_ROOT_FOLDER_ID', '1dWgNKvEm4rtV7bpLNn7ymN667rbC0NPd', 'ID de la carpeta raiz para evidencias de clientes'],
      ['GEMINI_API_KEY', 'TU_API_KEY_AQUI', 'Clave de API para el servicio de IA'],
      ['OPEN_AI_KEY', 'TU_API_KEY_AQUI', 'Clave de API para el servicio de IA']
    ];
    hojaParam.getRange(2, 1, valoresIniciales.length, 3).setValues(valoresIniciales);
    Logger.log('Valores de marca iniciales insertados.');
  }

  // Insertar opciones iniciales en LISTAS_SISTEMA para el formulario
  const hojaListas = ss.getSheetByName('LISTAS_SISTEMA');
  if (hojaListas.getLastRow() <= 1) {
    const opcionesIniciales = [
      ['TIPO_ACTIVIDAD', 'Inspección de EPP'],
      ['TIPO_ACTIVIDAD', 'Condiciones de Orden y Aseo'],
      ['TIPO_ACTIVIDAD', 'Trabajo en Alturas'],
      ['TIPO_ACTIVIDAD', 'Riesgo Eléctrico'],
      ['PRIORIDAD', 'Baja'],
      ['PRIORIDAD', 'Media'],
      ['PRIORIDAD', 'Alta'],
      ['PRIORIDAD', 'Inmediata']
    ];
    hojaListas.getRange(2, 1, opcionesIniciales.length, 2).setValues(opcionesIniciales);
    Logger.log('Opciones de listas iniciales insertadas.');
  }

  Logger.log('Inicialización completada correctamente.');
}
