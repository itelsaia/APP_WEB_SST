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

// getParametros() está definida en Setup.gs (versión completa con extracción de marca via Gemini).
