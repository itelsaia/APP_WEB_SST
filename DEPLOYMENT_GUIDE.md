# Guia de Despliegue — Sistema SST (ITELSA IA)

> Documento de referencia para entender la arquitectura y el flujo de despliegue.
> Ultima actualizacion: 2026-03-07 | Version estable: v44

---

## 1. Arquitectura del Proyecto

```
APP_WEB_SST/
|
|-- .clasp.json              <-- Apunta a SST_CORE_MASTER (PROD)
|-- .claspignore             <-- Excluye _clientes/** del push a la biblioteca
|
|-- AdminFormatos.html       \
|-- AdminClientes.html        \
|-- App.js.html                |-- ARCHIVOS FUENTE (se editan AQUI)
|-- Index.html                 |   Estos son los que se sirven al usuario
|-- Backend.gs                 |   a traves de la biblioteca
|-- Web.gs                    /
|-- Config.gs                /
|-- ...                     /
|
|-- _clientes/
|   |-- security_work_sm/
|       |-- .clasp.json      <-- Apunta al proyecto GAS del CLIENTE
|       |-- appsscript.json  <-- Referencia la VERSION de la biblioteca
|       |-- Codigo.js        <-- Wrapper que llama a SST_CORE_MASTER
|       |-- deployments.conf <-- IDs de los deployments activos
|       |-- *.html           <-- Copias locales (NO se usan en produccion)
|
|-- deploy-prod.sh           <-- Script automatico de despliegue
```

### Que es cada cosa:

| Componente | Script ID | Que hace |
|---|---|---|
| **SST_CORE_MASTER** (biblioteca) | `1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey` | Contiene TODA la logica y los HTML. Es una biblioteca GAS. |
| **SST_CORE_MASTER** (DEV) | `1C5U_eycIS06y4nR2b-GuLWMLuTTOG4gHg7lVZXa6tD845kIXI6VeXk7U` | Copia de desarrollo (no usar en produccion) |
| **APP_WEB_SECURITY_WORK_S&M** (cliente) | `1Xszar7a2HYLkAFUDonaONKy-x5J4ivmbYTV0TrcPj4GAUHUd8qP3Vpbd` | Proyecto del cliente. Solo tiene Codigo.js + appsscript.json relevantes. |

---

## 2. Como Fluyen los Archivos

```
Tu editas archivos aqui:
    APP_WEB_SST/AdminFormatos.html    (raiz del proyecto = biblioteca)
         |
         |  clasp push --force
         v
    SST_CORE_MASTER (HEAD)            (archivos subidos, pero NO versionados)
         |
         |  clasp version "descripcion"
         v
    SST_CORE_MASTER v44               (snapshot inmutable, ESTE es el que usan los clientes)
         |
         |  El cliente referencia "version": "44" en su appsscript.json
         v
    APP_WEB_SECURITY_WORK_S&M         (proyecto GAS del cliente)
         |
         |  Cuando el usuario visita la URL, el cliente llama a:
         |  SST_CORE_MASTER.doGet(e)  -->  include('AdminFormatos')
         v
    El HTML se sirve desde la BIBLIOTECA (version 44)
```

### DATO CRITICO:
**Los archivos HTML se sirven desde la BIBLIOTECA, no desde el proyecto cliente.**

Cuando GAS ejecuta `HtmlService.createTemplateFromFile('AdminFormatos')` dentro de
la biblioteca, busca el archivo en la biblioteca (en la version que el cliente tiene
configurada en su appsscript.json).

Los archivos `.html` que estan en `_clientes/security_work_sm/` son copias locales
de respaldo. NO se usan en produccion.

---

## 3. Flujo de Despliegue (Paso a Paso)

### Opcion A: Manual (paso a paso)

```bash
# === PASO 1: Editar los archivos en la raiz ===
# Edita APP_WEB_SST/AdminFormatos.html, App.js.html, Backend.gs, etc.

# === PASO 2: Push a la biblioteca ===
cd APP_WEB_SST/
clasp push --force
# Esto sube los archivos a SST_CORE_MASTER (HEAD)

# === PASO 3: Crear version de la biblioteca (OBLIGATORIO) ===
clasp version "v45 descripcion del cambio"
# Sin este paso, los cambios NO llegan a los clientes.
# Los clientes usan versiones fijas (ej: "version": "44"),
# no HEAD. Si no creas version, siguen viendo lo anterior.

# === PASO 4: Actualizar la version en el cliente ===
# Editar _clientes/security_work_sm/appsscript.json
# Cambiar "version": "44" --> "version": "45"

# === PASO 5: Push del cliente ===
cd _clientes/security_work_sm/
clasp push --force
# Esto actualiza el appsscript.json en GAS para que apunte a la nueva version

# === PASO 6: Actualizar deployments ===
clasp deploy -i "AKfycbwzDupo..." -d "v45 descripcion"
clasp deploy -i "AKfycbym2x-d..." -d "v45 descripcion"
clasp deploy -i "AKfycbxgnHz9..." -d "v45 descripcion"
# Los IDs estan en deployments.conf
```

### Opcion B: Automatico

```bash
bash deploy-prod.sh
```

Este script hace todo automaticamente: push biblioteca, crear version,
actualizar clientes, push clientes, y actualizar deployments.

---

## 4. Deployments del Cliente (security_work_sm)

Los IDs estan en `_clientes/security_work_sm/deployments.conf`:

| Nombre | Deployment ID | Uso |
|---|---|---|
| Sin titulo (principal) | `AKfycbym2x-d9zhmbxokFHqDRVimB1EPAO6P4zIGOsYkF6f5qpwh5LV5OhToeLKsO0dii-yzoQ` | URL de produccion |
| V22 (Estable) | `AKfycbwzDupoFQu3d8FeSBZZVu_6CaMecVhy_RfbSZseCZzjcFMwW3wHskyU4bl1kZqwKzfY-g` | URL de pruebas |
| V.1.2_MultiTenant | `AKfycbxgnHz9o67_y0stDlpmGGKiImJ91XWREnIMA4O21r6TS3aAjMX7tDv63dV0k4PVLsYkpA` | Legacy |

---

## 5. Errores Comunes y Soluciones

### "Hice cambios pero no se ven en la URL"

**Causa mas probable:** Falta `clasp version` despues de `clasp push`.

El `clasp push` sube archivos al HEAD de la biblioteca, pero los clientes
estan fijados a una version especifica (ej: "version": "44"). Si no creas
una nueva version con `clasp version`, el cliente sigue viendo la version anterior.

**Checklist:**
1. Hiciste `clasp push` desde la raiz? (no desde _clientes/)
2. Hiciste `clasp version`?
3. Actualizaste el numero de version en `_clientes/.../appsscript.json`?
4. Hiciste `clasp push` desde la carpeta del cliente?
5. Hiciste `clasp deploy -i <ID>`?

### "position:fixed no funciona en modales"

**Causa:** El contenedor `#main-content` tiene la clase `animate-slide-up` que usa
`transform: translateY(0)`. En CSS, un padre con `transform` rompe `position:fixed`
en todos sus hijos — se comporta como `position:absolute` relativo al padre.

**Solucion:** Mover el modal a `document.body` al abrirlo:
```javascript
function abrirModal(modal) {
    document.body.appendChild(modal);  // Sacarlo del contenedor con transform
    modal.classList.add('open');
}
function cerrarModal(modal) {
    modal.classList.remove('open');
    document.getElementById('admin-workspace-X').appendChild(modal); // Devolverlo
}
```

### "No puedo redirigir automaticamente al login desde setTimeout/callbacks"

**Causa:** El sandbox de GAS tiene `allow-top-navigation-by-user-activation`, que
SOLO permite navegar el frame principal cuando hay un click real del usuario
(`isTrusted = true`). Desde setTimeout, callbacks async o google.script.run
NO hay user activation, y el navegador bloquea la navegacion.

Metodos probados que NO funcionan desde codigo async:
- `window.top.location.href` — URL cambia pero pagina se congela
- `window.location.replace()` — pagina queda en blanco
- `form.submit()` con `target=_top` — pagina se congela
- `<meta http-equiv="refresh">` — navega solo el iframe interno, pagina en blanco
- `element.click()` programatico — `isTrusted=false`, navegador rechaza

**Solucion oficial de Google:** Usar un enlace `<a href="..." target="_top">` que
el usuario clickea manualmente. Es la UNICA forma confiable.

```javascript
// FUNCIONA — desde click de usuario (cerrarSesion en header)
function _irAlLogin(urlBase) {
    var url = urlBase.split('?')[0] + '?page=login';
    try { window.top.location.href = url; return; } catch (e) { }
    _navegarViaForm(url);
}

// FUNCIONA — despedida con boton clickeable
overlay.innerHTML = '...<a href="' + loginUrl + '" target="_top">Ir al login</a>...';

// NO FUNCIONA — desde setTimeout/callback (sin user activation)
setTimeout(function() { window.top.location.href = url; }, 3000); // BLOQUEADO
```

Referencia: https://developers.google.com/apps-script/guides/html/restrictions

---

## 6. Como Agregar un Nuevo Cliente

1. Crear un nuevo proyecto GAS vacio en Google Apps Script
2. Copiar `Codigo.js` de un cliente existente
3. En el proyecto GAS: Configuracion > Propiedades del script > agregar:
   - `SPREADSHEET_ID` = ID del Google Sheet del cliente
4. Agregar biblioteca SST_CORE_MASTER con la ultima version
5. Ejecutar `inicializarProduccion()` UNA SOLA VEZ
6. Implementar como Web App (Ejecutar como: Yo / Acceso: Cualquier usuario)
7. Crear carpeta en `_clientes/<nombre_cliente>/`:
   - `.clasp.json` con el scriptId del nuevo proyecto
   - `appsscript.json` con la version de la biblioteca
   - `deployments.conf` con los IDs de deployment
