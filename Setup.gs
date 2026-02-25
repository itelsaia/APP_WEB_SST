/**
 * SETUP.gs
 * Ejecutar 'inicializarBaseDeDatos' una sola vez para configurar el entorno.
 * Incluye extracción automática de identidad de marca desde el logo via Gemini Vision.
 */

// ═══════════════════════════════════════════════════════════
// COLORES POR DEFECTO (Identidad Black & Gold)
// ═══════════════════════════════════════════════════════════
const DEFAULTS_MARCA = {
  COLOR_PRIMARIO: '#C5A048',  // Dorado
  COLOR_ACENTO:   '#D4AF37',  // Oro viejo
  COLOR_FONDO:    '#101922'   // Negro/Oscuro
};

const PLACEHOLDER_LOGO = 'placeholder';

// ═══════════════════════════════════════════════════════════
// EXTRACCIÓN AUTOMÁTICA DE MARCA CON GEMINI VISION
// ═══════════════════════════════════════════════════════════

/**
 * Analiza el logo con Gemini Vision y extrae colores dominantes de marca.
 * Guarda el resultado en PARAM_SISTEMA para no repetir la llamada.
 * Si falla o no hay URL, aplica los colores dorados por defecto.
 *
 * @param {string} urlLogo - URL pública del logo de la empresa
 * @param {string} geminiKey - API key de Gemini
 * @returns {{ COLOR_PRIMARIO: string, COLOR_ACENTO: string }}
 */
function extraerIdentidadDeMarca(urlLogo, geminiKey) {
  // Si no hay URL válida, retornar defaults inmediatamente
  if (!urlLogo || urlLogo.indexOf(PLACEHOLDER_LOGO) !== -1 || urlLogo.trim() === '') {
    Logger.log('[MARCA] Sin URL de logo válida. Usando colores por defecto.');
    return DEFAULTS_MARCA;
  }

  if (!geminiKey || geminiKey === 'TU_API_KEY_AQUI') {
    Logger.log('[MARCA] Sin API key de Gemini. Usando colores por defecto.');
    return DEFAULTS_MARCA;
  }

  try {
    Logger.log('[MARCA] Analizando logo con Gemini Vision: ' + urlLogo);

    const prompt = `Analiza esta imagen de logo de empresa. Identifica los 2 colores más representativos de la identidad de marca (colores primario y acento). Responde ÚNICAMENTE con un JSON válido con este formato exacto, sin texto adicional:
{"COLOR_PRIMARIO":"#RRGGBB","COLOR_ACENTO":"#RRGGBB"}
No incluyas texto antes ni después del JSON. Solo el JSON.`;

    const payload = {
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: _detectMimeType(urlLogo), data: _fetchImageAsBase64(urlLogo) } }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 64,
        topP: 1,
        topK: 1
      }
    };

    const response = UrlFetchApp.fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey,
      {
        method: 'POST',
        contentType: 'application/json',
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      }
    );

    const result = JSON.parse(response.getContentText());

    if (result.error) {
      Logger.log('[MARCA] Error Gemini: ' + JSON.stringify(result.error));
      return DEFAULTS_MARCA;
    }

    const rawText = result.candidates[0].content.parts[0].text.trim();
    Logger.log('[MARCA] Respuesta Gemini: ' + rawText);

    // Extraer JSON de la respuesta (por si Gemini agrega algo extra)
    const jsonMatch = rawText.match(/\{[^}]+\}/);
    if (!jsonMatch) {
      Logger.log('[MARCA] No se encontró JSON en la respuesta. Usando defaults.');
      return DEFAULTS_MARCA;
    }

    const colores = JSON.parse(jsonMatch[0]);

    // Validar que sean hex válidos
    const hexRegex = /^#[0-9A-Fa-f]{6}$/;
    if (!hexRegex.test(colores.COLOR_PRIMARIO) || !hexRegex.test(colores.COLOR_ACENTO)) {
      Logger.log('[MARCA] Colores inválidos recibidos. Usando defaults.');
      return DEFAULTS_MARCA;
    }

    Logger.log('[MARCA] ✅ Identidad extraída — Primario: ' + colores.COLOR_PRIMARIO + ' | Acento: ' + colores.COLOR_ACENTO);
    return {
      COLOR_PRIMARIO: colores.COLOR_PRIMARIO,
      COLOR_ACENTO:   colores.COLOR_ACENTO,
      COLOR_FONDO:    DEFAULTS_MARCA.COLOR_FONDO
    };

  } catch (e) {
    Logger.log('[MARCA] Error al extraer identidad: ' + e.toString());
    return DEFAULTS_MARCA;
  }
}

/**
 * Descarga una imagen desde una URL y la devuelve en Base64.
 */
function _fetchImageAsBase64(url) {
  try {
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    const blob = response.getBlob();
    return Utilities.base64Encode(blob.getBytes());
  } catch (e) {
    Logger.log('[MARCA] Error descargando imagen: ' + e);
    throw e;
  }
}

/**
 * Detecta el MIME type de la imagen según la URL.
 */
function _detectMimeType(url) {
  const lower = url.toLowerCase();
  if (lower.includes('.png'))  return 'image/png';
  if (lower.includes('.webp')) return 'image/webp';
  if (lower.includes('.gif'))  return 'image/gif';
  return 'image/jpeg'; // Default más común
}

// ═══════════════════════════════════════════════════════════
// NORMALIZACIÓN DE URL DE IMAGEN (Google Drive → URL directa)
// ═══════════════════════════════════════════════════════════

/**
 * Convierte cualquier URL de Google Drive o imagen pública
 * a una URL directa apta para usar en <img src="...">
 *
 * Formatos soportados:
 *   - drive.google.com/file/d/FILE_ID/view         → URL directa
 *   - drive.google.com/open?id=FILE_ID             → URL directa
 *   - drive.google.com/uc?id=FILE_ID               → URL directa
 *   - lh3.googleusercontent.com/d/FILE_ID          → sin cambio (ya es directa)
 *   - cualquier https:// válido                     → sin cambio
 *   - vacío / placeholder                           → retorna ''
 *
 * @param {string} url - URL original del logo
 * @returns {string} URL directa de imagen, o '' si no es válida
 */
function normalizarUrlImagen(url) {
  if (!url || url.trim() === '' || url.indexOf('placeholder') !== -1 || url === 'TU_URL_AQUI') {
    return '';
  }

  url = url.trim();

  // ── Formato: drive.google.com/file/d/FILE_ID/view[?...]
  var matchFile = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFile) {
    return 'https://drive.google.com/uc?export=view&id=' + matchFile[1];
  }

  // ── Formato: drive.google.com/open?id=FILE_ID
  var matchOpen = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/);
  if (matchOpen) {
    return 'https://drive.google.com/uc?export=view&id=' + matchOpen[1];
  }

  // ── Formato: drive.google.com/uc?id=FILE_ID (sin export)
  var matchUc = url.match(/drive\.google\.com\/uc\?(?:.*&)?id=([a-zA-Z0-9_-]+)/);
  if (matchUc) {
    return 'https://drive.google.com/uc?export=view&id=' + matchUc[1];
  }

  // ── Formato: lh3.googleusercontent.com/d/FILE_ID (ya es directo)
  if (url.indexOf('lh3.googleusercontent.com') !== -1) {
    return url;
  }

  // ── Cualquier URL https válida (imágenes externas)
  if (url.indexOf('https://') === 0 || url.indexOf('http://') === 0) {
    return url;
  }

  // URL no reconocida
  Logger.log('[LOGO] URL no reconocida: ' + url);
  return '';
}

// ═══════════════════════════════════════════════════════════
// FUNCIÓN PÚBLICA: Leer + aplicar identidad de marca
// ═══════════════════════════════════════════════════════════

/**
 * Lee PARAM_SISTEMA y aplica extracción de marca si corresponde.
 * Guarda los colores extraídos de vuelta en la hoja para no repetir la llamada.
 * @returns {Object} Parámetros de configuración con colores de marca siempre presentes
 */
function getParametros() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('PARAM_SISTEMA');

    if (!hoja || hoja.getLastRow() < 2) {
      return { status: 'success', data: DEFAULTS_MARCA };
    }

    const data = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
    const params = {};
    data.forEach(function(row) {
      if (row[0]) params[row[0].toString().trim()] = row[1];
    });

    // Garantizar valores de fondo siempre presentes
    if (!params.COLOR_FONDO) params.COLOR_FONDO = DEFAULTS_MARCA.COLOR_FONDO;

    // ───── LÓGICA DE EXTRACCIÓN AUTOMÁTICA ─────
    const coloresVacios = !params.COLOR_PRIMARIO || params.COLOR_PRIMARIO === '';
    const logoValido    = params.URL_LOGO && 
                          params.URL_LOGO.indexOf(PLACEHOLDER_LOGO) === -1 && 
                          params.URL_LOGO.trim() !== '';
    const geminiKey     = params.GEMINI_API_KEY || '';

    if (coloresVacios && logoValido) {
      Logger.log('[MARCA] Colores no configurados. Iniciando extracción automática...');
      const identidad = extraerIdentidadDeMarca(params.URL_LOGO, geminiKey);

      // Guardar en la hoja para no repetir la llamada
      _actualizarColorEnHoja(hoja, 'COLOR_PRIMARIO', identidad.COLOR_PRIMARIO);
      _actualizarColorEnHoja(hoja, 'COLOR_ACENTO',   identidad.COLOR_ACENTO);

      params.COLOR_PRIMARIO = identidad.COLOR_PRIMARIO;
      params.COLOR_ACENTO   = identidad.COLOR_ACENTO;
    }

    // Si aún no hay colores (ni logo, ni vacío), usar defaults dorados
    if (!params.COLOR_PRIMARIO) params.COLOR_PRIMARIO = DEFAULTS_MARCA.COLOR_PRIMARIO;
    if (!params.COLOR_ACENTO)   params.COLOR_ACENTO   = DEFAULTS_MARCA.COLOR_ACENTO;

    return { status: 'success', data: params };

  } catch (e) {
    Logger.log('[getParametros] Error: ' + e);
    return { status: 'success', data: DEFAULTS_MARCA };
  }
}

/**
 * Actualiza un parámetro en la hoja PARAM_SISTEMA.
 */
function _actualizarColorEnHoja(hoja, parametro, valor) {
  try {
    const data = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < data.length; i++) {
      if (data[i][0] === parametro) {
        hoja.getRange(i + 2, 2).setValue(valor);
        Logger.log('[MARCA] Guardado en hoja — ' + parametro + ': ' + valor);
        return;
      }
    }
    // Si el parámetro no existe, crearlo
    hoja.appendRow([parametro, valor, 'Auto-extraído por Gemini Vision']);
    Logger.log('[MARCA] Creado en hoja — ' + parametro + ': ' + valor);
  } catch (e) {
    Logger.log('[MARCA] Error guardando en hoja: ' + e);
  }
}

// ═══════════════════════════════════════════════════════════
// FORZAR RE-EXTRACCIÓN (función manual para ejecutar en GAS)
// ═══════════════════════════════════════════════════════════

/**
 * Ejecuta esta función manualmente desde el editor de GAS
 * para forzar una nueva extracción de colores desde el logo actual.
 */
function forzarExtraccionDeMarca() {
  const ss  = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const hoja = ss.getSheetByName('PARAM_SISTEMA');
  const data = hoja.getRange(2, 1, hoja.getLastRow() - 1, 2).getValues();
  const params = {};
  data.forEach(function(row) { if (row[0]) params[row[0]] = row[1]; });

  const identidad = extraerIdentidadDeMarca(params.URL_LOGO, params.GEMINI_API_KEY);
  _actualizarColorEnHoja(hoja, 'COLOR_PRIMARIO', identidad.COLOR_PRIMARIO);
  _actualizarColorEnHoja(hoja, 'COLOR_ACENTO',   identidad.COLOR_ACENTO);

  SpreadsheetApp.getUi().alert(
    '✅ Identidad de Marca Actualizada\n\n' +
    '🎨 COLOR_PRIMARIO → ' + identidad.COLOR_PRIMARIO + '\n' +
    '✨ COLOR_ACENTO   → ' + identidad.COLOR_ACENTO
  );
}

// ═══════════════════════════════════════════════════════════
// INICIALIZACIÓN DE BASE DE DATOS
// ═══════════════════════════════════════════════════════════

function inicializarBaseDeDatos() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  
  const hojasRequeridas = [
    { nombre: 'PARAM_SISTEMA',    encabezados: ['Parametro', 'Valor', 'Descripcion'] },
    { nombre: 'DB_CLIENTES',      encabezados: ['ID_Cliente', 'Nombre_Empresa', 'Direccion', 'NIT', 'Correo_Gerente', 'Nombre_Contacto', 'Celular_Whatsapp', 'Nombre_Obra', 'Estado'] },
    { nombre: 'DB_USUARIOS',      encabezados: ['Email', 'Nombre_Completo', 'Rol', 'Password', 'ID_Cliente_Asociado', 'Cedula', 'Celular_Whatsapp'] },
    { nombre: 'LISTAS_FORMATOS',  encabezados: ['ID_Formato', 'Descripcion', 'Empresa_Contratista', 'Estado'] },
    { nombre: 'DB_INSPECCIONES',  encabezados: ['Id_formato', 'Consecutivo', 'Descripcion_Formato', 'Fecha_Hora', 'Empresa_Contratista', 'Foto_Formato_URL', 'Reportado_Por', 'Estado', 'Foto_Firma_URL', 'Fecha_Cierre'] },
    { nombre: 'DB_ANALISIS_IA',   encabezados: ['ID_Registro_Padre', 'Diagnostico_IA', 'Plan_Accion_Recomendado', 'Nivel_Riesgo_IA'] },
    { nombre: 'LISTAS_SISTEMA',   encabezados: ['Categoria', 'Item'] },
    { nombre: 'DB_ASISTENCIA',    encabezados: ['ID_Asistencia', 'Email_Supervisor', 'Nombre_Completo', 'Fecha', 'Hora_Entrada', 'Hora_Salida', 'Tipo_Dia', 'Obra_Proyecto', 'Foto_Entrada_URL', 'Foto_Salida_URL', 'Estado'] },
    { nombre: 'DB_HALLAZGOS',     encabezados: ['Id_hallazgo', 'Fecha', 'Hora', 'Ubicacion', 'Descripcion_hallazgo', 'Foto_URL_Hallazgo', 'Empresa_Contratista', 'Reportado_Por', 'Reportado_A', 'Numero_contacto_whatssap', 'Gestion_Realizada', 'Estado', 'Fecha_cierre', 'Hora_cierre', 'Foto_URL_Cierre_hallazgo'] }
  ];

  hojasRequeridas.forEach(function(configHoja) {
    let hoja = ss.getSheetByName(configHoja.nombre);
    if (!hoja) {
      hoja = ss.insertSheet(configHoja.nombre);
      Logger.log('Hoja creada: ' + configHoja.nombre);
    }
    hoja.getRange(1, 1, 1, configHoja.encabezados.length).setValues([configHoja.encabezados]);
    if (hoja.getFrozenRows() === 0) hoja.setFrozenRows(1);
  });

  // Insertar valores por defecto en PARAM_SISTEMA si está vacía
  const hojaParam = ss.getSheetByName('PARAM_SISTEMA');
  if (hojaParam.getLastRow() <= 1) {
    const valoresIniciales = [
      ['COLOR_PRIMARIO', '',              'Auto-extraído del logo (dejar vacío para extracción automática)'],
      ['COLOR_ACENTO',   '',              'Auto-extraído del logo (dejar vacío para extracción automática)'],
      ['COLOR_FONDO',    '#101922',       'Color de fondo (Negro/Oscuro)'],
      ['URL_LOGO',       '',              'URL del logo de la empresa — la marca se extrae automáticamente con Gemini'],
      ['NOMBRE_EMPRESA', 'SECURITY WORK S&M', 'Nombre de la empresa'],
      ['DRIVE_ROOT_FOLDER_ID', '1dWgNKvEm4rtV7bpLNn7ymN667rbC0NPd', 'ID carpeta raíz para evidencias'],
      ['GEMINI_API_KEY', 'TU_API_KEY_AQUI', 'Clave API Gemini (para extracción de marca y análisis IA)'],
      ['OPEN_AI_KEY',    'TU_API_KEY_AQUI', 'Clave API OpenAI (opcional)']
    ];
    hojaParam.getRange(2, 1, valoresIniciales.length, 3).setValues(valoresIniciales);
    Logger.log('Valores iniciales insertados en PARAM_SISTEMA.');
  }

  // Insertar opciones iniciales en LISTAS_SISTEMA
  const hojaListas = ss.getSheetByName('LISTAS_SISTEMA');
  if (hojaListas.getLastRow() <= 1) {
    const opciones = [
      ['TIPO_ACTIVIDAD', 'Inspección de EPP'],
      ['TIPO_ACTIVIDAD', 'Condiciones de Orden y Aseo'],
      ['TIPO_ACTIVIDAD', 'Trabajo en Alturas'],
      ['TIPO_ACTIVIDAD', 'Riesgo Eléctrico'],
      ['PRIORIDAD', 'Baja'],
      ['PRIORIDAD', 'Media'],
      ['PRIORIDAD', 'Alta'],
      ['PRIORIDAD', 'Inmediata']
    ];
    hojaListas.getRange(2, 1, opciones.length, 2).setValues(opciones);
  }

  Logger.log('✅ Inicialización completada.');
}

// ═══════════════════════════════════════════════════════════
// RESET TOTAL DB_INSPECCIONES — ELIMINA Y RECREA LA HOJA
// ═══════════════════════════════════════════════════════════

/**
 * Elimina la hoja DB_INSPECCIONES por completo y la crea de nuevo
 * con SOLO los 8 campos nuevos. No hay datos que preservar.
 *
 * CÓMO EJECUTAR:
 *   1. Abre el spreadsheet APP_WEB_STT_MAESTRO en Google Sheets
 *   2. Menú → Extensiones → Apps Script
 *   3. Selecciona la función "reinicializarHojaInspecciones"
 *   4. Clic en ▶ Ejecutar
 */
function reinicializarHojaInspecciones() {
  // Usar la hoja activa del script (funciona tanto vinculado como standalone)
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    // Fallback: abrir por ID hardcodeado
    ss = SpreadsheetApp.openById('1ggeg2PW6Xv8GGTrAlKXDO1IEcCTTWeAp5E0Qdkd5fPo');
  }

  var NOMBRE_HOJA   = 'DB_INSPECCIONES';
  var ENCABEZADOS   = [
    'Id_formato',
    'Consecutivo',
    'Descripcion_Formato',
    'Fecha_Hora',
    'Empresa_Contratista',
    'Foto_Formato_URL',
    'Reportado_Por',
    'Estado',
    'Foto_Firma_URL',
    'Fecha_Cierre'
  ];

  // ── 1. Eliminar la hoja existente (con todos sus datos y formato) ──────────
  var hojaVieja = ss.getSheetByName(NOMBRE_HOJA);
  if (hojaVieja) {
    // Insertar hoja temporal para que GAS no se queje de eliminar la única hoja
    var tmp = ss.insertSheet('__tmp__');
    ss.deleteSheet(hojaVieja);
    Logger.log('[SETUP] Hoja antigua eliminada.');
  }

  // ── 2. Crear hoja nueva limpia ─────────────────────────────────────────────
  var nueva = ss.insertSheet(NOMBRE_HOJA);

  // ── 3. Escribir encabezados ────────────────────────────────────────────────
  var header = nueva.getRange(1, 1, 1, ENCABEZADOS.length);
  header.setValues([ENCABEZADOS]);
  header
    .setBackground('#1a237e')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center');

  nueva.setFrozenRows(1);

  // ── 4. Eliminar hoja temporal si se creó ──────────────────────────────────
  var tmpHoja = ss.getSheetByName('__tmp__');
  if (tmpHoja) ss.deleteSheet(tmpHoja);

  Logger.log('[SETUP] ✅ DB_INSPECCIONES recreada con campos: ' + ENCABEZADOS.join(' | '));
}
