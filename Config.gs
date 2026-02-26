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
      // Retornar null si falla, forzando al sistema a detectar el entorno dinámicamente
      return null;
    }
  },
  SHEET_PARAMETROS: 'PARAM_SISTEMA'
};

// getParametros() está definida en Setup.gs (versión completa con extracción de marca via Gemini).
