/**
 * AI_CORE.gs
 * Módulo para la integración con Modelos de Lenguaje (LLMs).
 * Procesa hallazgos de SST para proponer diagnósticos y planes de acción.
 */

const AI_CORE = {
  ENDPOINT: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent",
  
  /**
   * Analiza un hallazgo reportado mediante la API de Gemini.
   * @param {string} detalle Texto del hallazgo.
   * @param {string} urlImagen URL de la evidencia fotográfica (opcional).
   * @return {Object} Análisis estructurado.
   */
  analizarHallazgo: function(detalle, urlImagen) {
    try {
      const params = getParametros().data || {};
      const apiKey = params.GEMINI_API_KEY;
      
      if (!apiKey) {
        throw new Error("No se encontró la GEMINI_API_KEY en PARAM_SISTEMA.");
      }

      const prompt = this.generarPromptSST(detalle);
      
      const payload = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };

      // Si hay imagen, se podría pasar como blob si fuera base64, 
      // pero aquí estamos pasando la URL de Drive. 
      // Nota: Gemini API requiere el contenido base64 para imágenes directamente en el payload
      // o usar File API. Como simplificación inicial usaremos el texto del hallazgo.

      const options = {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        muteHttpExceptions: true
      };

      const response = UrlFetchApp.fetch(`${this.ENDPOINT}?key=${apiKey}`, options);
      const json = JSON.parse(response.getContentText());

      if (json.candidates && json.candidates[0] && json.candidates[0].content) {
        const respuestaTexto = json.candidates[0].content.parts[0].text;
        return this.estructurarRespuestaIA(respuestaTexto);
      } else {
        throw new Error("Respuesta inválida de la IA: " + response.getContentText());
      }

    } catch (e) {
      Logger.log("Error en AI_CORE.analizarHallazgo: " + e.toString());
      return {
        diagnostico: "Error en el análisis automático.",
        plan_accion: "Revisión manual requerida.",
        nivel_riesgo: "DESCONOCIDO"
      };
    }
  },

  /**
   * Genera el prompt especializado para SST.
   */
  generarPromptSST: function(detalle) {
    return `Actúa como un experto en Seguridad y Salud en el Trabajo (SST) con conocimiento de la normativa colombiana e internacional.
    Analiza el siguiente hallazgo reportado en campo y genera un diagnóstico breve, un plan de acción inmediato y clasifica el nivel de riesgo (BAJO, MEDIO, ALTO, CRÍTICO).
    
    Hallazgo: "${detalle}"
    
    Responde ÚNICAMENTE en formato JSON con la siguiente estructura:
    {
      "diagnostico": "...",
      "plan_accion": "...",
      "nivel_riesgo": "..."
    }`;
  },

  /**
   * Limpia y estructura la respuesta de la IA.
   */
  estructurarRespuestaIA: function(texto) {
    try {
      // Limpiar posibles bloques de código markdown
      const jsonLimpio = texto.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonLimpio);
    } catch (e) {
      return {
        diagnostico: "La IA generó una respuesta no estructurada.",
        plan_accion: texto,
        nivel_riesgo: "MEDIO"
      };
    }
  },

  /**
   * Guarda el análisis en la hoja DB_ANALISIS_IA.
   */
  guardarAnalisis: function(idPadre, analisis) {
    try {
      const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
      const hoja = ss.getSheetByName('DB_ANALISIS_IA');
      if (!hoja) return;

      hoja.appendRow([
        idPadre,
        analisis.diagnostico,
        analisis.plan_accion,
        analisis.nivel_riesgo,
        new Date()
      ]);
      
      // Si el riesgo es alto o crítico, disparar notificación
      if (analisis.nivel_riesgo === 'ALTO' || analisis.nivel_riesgo === 'CRÍTICO') {
        const datosInspeccion = this.obtenerDatosInspeccion(idPadre);
        NOTIFICACIONES.enviarAlertaRiesgo(datosInspeccion, analisis);
      }

    } catch (e) {
      Logger.log("Error al guardar análisis: " + e.toString());
    }
  },
  
  /**
   * Obtiene datos de la inspección original para la notificación.
   */
  obtenerDatosInspeccion: function(idRegistro) {
    const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
    const hoja = ss.getSheetByName('DB_INSPECCIONES');
    const datos = hoja.getDataRange().getValues();
    for (let i = 1; i < datos.length; i++) {
      if (datos[i][0] === idRegistro) {
        return {
          id: datos[i][0],
          fecha: datos[i][1],
          email: datos[i][2],
          idCliente: datos[i][3],
          tipo: datos[i][4],
          detalle: datos[i][5],
          url: datos[i][6]
        };
      }
    }
    return {};
  }
};
