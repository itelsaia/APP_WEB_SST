/**
 * NOTIFICACIONES.gs
 * Gestiona el envío de correos electrónicos y alertas del sistema.
 * Utiliza los parámetros de marca blanca para personalizar las plantillas.
 */

const NOTIFICACIONES = {
  
  /**
   * Envía un correo de alerta cuando se detecta un riesgo alto o crítico.
   * @param {Object} inspeccion Datos de la inspección original.
   * @param {Object} analisis Resultado del análisis de la IA.
   */
  enviarAlertaRiesgo: function(inspeccion, analisis) {
    try {
      const params = getParametros().data || {};
      const config = {
        colorPrimario: params.COLOR_PRIMARIO || "#1E3A8A",
        logoUrl: params.URL_LOGO || "",
        nombreSaaS: params.NOMBRE_SISTEMA || "SST SaaS",
        emailGerente: params.EMAIL_NOTIFICACIONES || "gerencia@ejemplo.com"
      };

      const asunto = `🚨 ALERTA SST: Riesgo ${analisis.nivel_riesgo} Detectado - ${inspeccion.tipo}`;
      
      const htmlBody = `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
          <div style="background-color: ${config.colorPrimario}; padding: 20px; text-align: center;">
            <img src="${config.logoUrl}" alt="Logo" style="max-height: 50px; margin-bottom: 10px;">
            <h1 style="color: white; margin: 0; font-size: 20px;">Alerta de Seguridad SST</h1>
          </div>
          <div style="padding: 20px; color: #333;">
            <p>Se ha registrado un nuevo hallazgo con un nivel de riesgo clasificado como <strong>${analisis.nivel_riesgo}</strong>.</p>
            
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">ID Registro:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${inspeccion.id}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Actividad:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${inspeccion.tipo}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">Detalle Reportado:</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${inspeccion.detalle}</td>
              </tr>
            </table>

            <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid ${config.colorPrimario}; margin-bottom: 20px;">
              <h3 style="margin-top: 0; color: ${config.colorPrimario};">Diagnóstico IA</h3>
              <p>${analisis.diagnostico}</p>
              <h3 style="margin-top: 15px; color: ${config.colorPrimario};">Plan de Acción Recomendado</h3>
              <p>${analisis.plan_accion}</p>
            </div>

            <p style="text-align: center;">
              <a href="${inspeccion.url}" style="background-color: ${config.colorPrimario}; color: white; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
                Ver Evidencia en Drive
              </a>
            </p>
          </div>
          <div style="background-color: #f4f4f4; padding: 15px; text-align: center; color: #777; font-size: 12px;">
            Este es un correo automático generado por ${config.nombreSaaS}.
          </div>
        </div>
      `;

      MailApp.sendEmail({
        to: config.emailGerente,
        subject: asunto,
        htmlBody: htmlBody
      });

      Logger.log("Alerta enviada correctamente a: " + config.emailGerente);

    } catch (e) {
      Logger.log("Error al enviar notificación: " + e.toString());
    }
  }
};
