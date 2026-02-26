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
    // 1. Script Property (configurada manualmente en cada entorno GAS — DEV y PROD)
    try {
      const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
      if (id) return id;
    } catch(e) {}
    // 2. Hoja activa (cuando el script está vinculado a una Spreadsheet)
    try {
      return SpreadsheetApp.getActiveSpreadsheet().getId();
    } catch (e) {}
    // 3. ID hardcoded de respaldo (entorno DEV)
    return '1ggeg2PW6Xv8GGTrAlKXDO1IEcCTTWeAp5E0Qdkd5fPo';
  },
  SHEET_PARAMETROS: 'PARAM_SISTEMA'
};

// getParametros() está definida en Setup.gs (versión completa con extracción de marca via Gemini).
