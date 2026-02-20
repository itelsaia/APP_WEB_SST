/**
 * CONFIG.gs
 * Objeto global de configuración para el sistema.
 * Este archivo centraliza la lectura de parámetros del Google Sheet.
 */

const CONFIG = {
  /**
   * Obtiene dinámicamente el ID de la hoja de cálculo.
   * Si el script está vinculado, usa la activa. Si no, usa el ID hardcoded.
   */
  get SPREADSHEET_ID() {
    try {
      return SpreadsheetApp.getActiveSpreadsheet().getId();
    } catch (e) {
      // ID de respaldo por si el script falla al detectar la hoja activa
      return '1ggeg2PW6Xv8GGTrAlKXDO1IEcCTTWeAp5E0Qdkd5fPo';
    }
  },
  SHEET_PARAMETROS: 'PARAM_SISTEMA'
};

/**
 * Lee todos los parámetros de la hoja PARAM_SISTEMA y los devuelve como un objeto.
 */
function getParametros() {
  try {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName(CONFIG.SHEET_PARAMETROS);
    
    if (!hoja) {
      throw new Error("No se encontró la hoja '" + CONFIG.SHEET_PARAMETROS + "'. Asegúrese de ejecutar Setup.gs");
    }

    const datos = hoja.getDataRange().getValues();
    const params = {};
    
    for (let i = 1; i < datos.length; i++) {
      const clave = datos[i][0];
      let valor = datos[i][1];
      
      // Conversión automática de links de Drive para que funcionen como imágenes directas
      if (clave === 'URL_LOGO' && valor && valor.includes('drive.google.com')) {
        valor = convertirLinkADirecto(valor);
      }

      if (clave) {
        params[clave] = valor;
      }
    }
    
    return {
      status: "success",
      data: params
    };
    
  } catch (e) {
    Logger.log("Error en getParametros: " + e.toString());
    return {
      status: "error",
      message: "Error al leer configuración: " + e.toString()
    };
  }
}

/**
 * Convierte un link de visualización de Drive en un link directo de imagen.
 */
function convertirLinkADirecto(url) {
  const regex = /(?:id=|\/d\/|src=)([\w-]{25,})/;
  const match = url.match(regex);
  if (match && match[1]) {
    return 'https://lh3.googleusercontent.com/d/' + match[1];
  }
  return url;
}
