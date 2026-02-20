/**
 * WEB.gs
 * Lógica de enrutamiento y renderizado de la Web App.
 * Versión robusta con manejo total de errores.
 */

function doGet(e) {
  try {
    // 1. Leer configuración (protegido contra errores)
    var config = {};
    try {
      var configRes = getParametros();
      if (configRes && configRes.status === 'success' && configRes.data) {
        config = configRes.data;
      }
    } catch (err) {
      Logger.log("Error en getParametros: " + err);
    }
    
    // 2. Leer parámetros de URL
    var page = (e && e.parameter && e.parameter.page) ? e.parameter.page : 'login';
    var role = (e && e.parameter && e.parameter.role) ? e.parameter.role : '';
    var email = (e && e.parameter && e.parameter.email) ? e.parameter.email : '';
    
    // 3. Crear template
    var template;
    if (page === 'app') {
      template = HtmlService.createTemplateFromFile('Index');
      template.role = role;
      template.email = email;
    } else {
      template = HtmlService.createTemplateFromFile('Login');
    }
    
    // 4. Inyectar datos como JSON seguro (sin usar config.PROPIEDAD directamente en HTML)
    template.configJSON = JSON.stringify(config);
    template.config = config;
    template.scriptUrl = ScriptApp.getService().getUrl();
    
    // 5. Evaluar
    return template.evaluate()
      .setTitle('SaaS SST | ' + (config.NOMBRE_EMPRESA || 'Gestión'))
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
      
  } catch (fatal) {
    Logger.log("FATAL doGet: " + fatal);
    return HtmlService.createHtmlOutput(
      '<html><body style="font-family:sans-serif;text-align:center;padding:60px;">' +
      '<h2 style="color:#B91C1C;">⚠ Error del Sistema</h2>' +
      '<p>' + fatal.toString() + '</p>' +
      '<br><a href="' + ScriptApp.getService().getUrl() + '">Reintentar</a>' +
      '</body></html>'
    ).setTitle('Error SST')
     .addMetaTag('viewport', 'width=device-width, initial-scale=1')
     .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
}

/**
 * Incluir archivos HTML parciales en templates.
 */
function include(filename) {
  try {
    return HtmlService.createHtmlOutputFromFile(filename).getContent();
  } catch (e) {
    Logger.log("include error (" + filename + "): " + e);
    return '<!-- Error: ' + filename + ' -->';
  }
}
