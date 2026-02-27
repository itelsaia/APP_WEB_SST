# DOCUMENTACIÓN — Sistema SST · ITELSA IA
## Guía completa de configuración, desarrollo y despliegue

> **Los IDs de proyectos y Spreadsheets NO están en este archivo.**
> Están en `SECRETOS.md` (excluido de Git). Búscalo en tu Google Drive personal.

---

## 1. ARQUITECTURA GENERAL

El sistema funciona con **3 proyectos de Google Apps Script (GAS)** separados:

```
┌─────────────────────────────────────────────────────────────┐
│  Tu computador (VS Code + clasp)                            │
│  Carpeta: APP_WEB_SST/                                      │
│    ├── .clasp.json        → apunta a SST_CORE_DEV (pruebas) │
│    ├── .clasp.prod.json   → apunta a SST_CORE_MASTER (prod) │
│    └── _cliente/          → apunta al proyecto del cliente  │
└─────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
  SST_CORE_DEV       SST_CORE_MASTER        APP_WEB_SECURITY
  (entorno prueba)   (biblioteca PROD)       _WORK_S&M
                     ← el cliente lo         (proyecto cliente)
                       usa como librería      solo tiene Código.gs
```

### ¿Por qué esta estructura?
- **SST_CORE_DEV**: donde pruebas cambios antes de publicar. Siempre sirve el código más reciente (HEAD). Nunca afecta a clientes reales.
- **SST_CORE_MASTER**: la biblioteca publicada por versiones (V1, V2, V3...). Los clientes apuntan a una versión fija.
- **APP_WEB_SECURITY_WORK_S&M**: el proyecto del cliente. Solo contiene `Código.gs` con 32 funciones wrapper que llaman a SST_CORE_MASTER.

---

## 2. IDs DE PROYECTOS

> ⚠️ Los IDs reales están en **SECRETOS.md** (en tu Google Drive, no en Git).

Una vez tengas `SECRETOS.md`, debes crear estos archivos manualmente en la carpeta del proyecto:

### `.clasp.json` (DEV)
```json
{
  "scriptId": "[VER SECRETOS.md → SST_CORE_DEV]",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

### `.clasp.prod.json` (PROD)
```json
{
  "scriptId": "[VER SECRETOS.md → SST_CORE_MASTER]",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [".html"],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

### `_cliente/.clasp.json` (Cliente)
```json
{
  "scriptId": "[VER SECRETOS.md → APP_WEB_SECURITY_WORK_S&M]",
  "rootDir": "",
  "scriptExtensions": [".js", ".gs"],
  "htmlExtensions": [],
  "jsonExtensions": [".json"],
  "filePushOrder": [],
  "skipSubdirectories": false
}
```

---

## 3. PRERREQUISITOS EN EL NUEVO COMPUTADOR

### 3.1 Instalar Node.js
- Descargar desde: https://nodejs.org (versión LTS)
- Verificar: `node -v` y `npm -v`

### 3.2 Instalar clasp globalmente
```bash
npm install -g @google/clasp
```
Verificar: `clasp -v`

### 3.3 Instalar VS Code + extensión Claude Code
- VS Code: https://code.visualstudio.com
- Extensión Claude Code: buscar "Claude Code" en el marketplace de VS Code

### 3.4 Autenticar clasp con Google
```bash
clasp login
```
- Abre el navegador automáticamente
- Inicia sesión con la cuenta Google que tiene acceso a los proyectos GAS
- Esto crea el archivo `~/.clasprc.json` con las credenciales

---

## 4. CONFIGURAR EL PROYECTO EN EL NUEVO COMPUTADOR

### Paso 1 — Clonar el repositorio
```bash
git clone <URL-del-repositorio> "APP_WEB_SST"
cd "APP_WEB_SST"
```

### Paso 2 — Recuperar SECRETOS.md
Busca `SECRETOS.md` en tu Google Drive personal y cópialo dentro de la carpeta `APP_WEB_SST/`.

### Paso 3 — Crear los archivos .clasp
Con los IDs del `SECRETOS.md`, crea los 3 archivos `.clasp` descritos en la sección 2.

### Paso 4 — Autenticar clasp
```bash
clasp login
```

### Paso 5 — Verificar conexión
```bash
clasp status
```
Debe mostrar los archivos del proyecto sin errores.

---

## 5. ESTRUCTURA DE ARCHIVOS DEL PROYECTO

```
APP_WEB_SST/
│
├── .clasp.json              ← Config clasp DEV (en .gitignore — recrear con SECRETOS.md)
├── .clasp.prod.json         ← Config clasp PROD (en .gitignore — recrear con SECRETOS.md)
├── .clasp.dev.json          ← Respaldo config DEV (en .gitignore)
│
├── Backend.gs               ← TODA la lógica de negocio (funciones GAS)
├── Config.gs                ← Configuración global (SPREADSHEET_ID, etc.)
├── Setup.gs                 ← Inicialización de la base de datos / hojas
├── Notificaciones.gs        ← Lógica de notificaciones
├── AI_Core.gs               ← Integración con Gemini AI
├── Web.gs                   ← Manejo de rutas de la Web App (doGet/doPost)
├── Código.js                ← VACÍO en DEV/PROD (no tocar)
│
├── Index.html               ← Punto de entrada HTML de la app
├── Login.html               ← Página de login
├── Login.js.html            ← Lógica JS del formulario de login
├── Styles.html              ← Estilos CSS globales (Tailwind + custom)
├── App.js.html              ← TODA la lógica JS del frontend (archivo principal)
│
├── AdminClientes.html       ← Panel admin: gestión de clientes
├── AdminUsuarios.html       ← Panel admin: gestión de usuarios
├── AdminFormatos.html       ← Panel admin: gestión de formatos SST
├── AdminHallazgos.html      ← Panel admin: galería de hallazgos
├── AdminHallazgos.js.html   ← Lógica JS de hallazgos admin
├── AdminAsistencia.html     ← Panel admin: control de asistencia
├── AdminSupervisorSTT.html  ← Panel admin: métricas supervisores
│
├── FormInspeccion.html      ← Formulario de inspección (supervisor)
├── FormHallazgo.html        ← Formulario de hallazgo (supervisor)
├── GestionHallazgo.html     ← Gestión/cierre de hallazgos
├── PanelGestionFormatos.html    ← Panel gestión de formatos (supervisor)
├── PanelGestionFormatos.js.html ← Lógica JS panel gestión formatos
│
├── appsscript.json          ← Manifiesto GAS (zona horaria, runtime)
├── TEMPLATE_CLIENTE_Codigo.txt  ← Plantilla con las 32 funciones del cliente
├── DOCUMENTACION.md         ← Este archivo (sí va a Git, sin IDs)
├── SECRETOS.md              ← IDs reales (NO va a Git — guardar en Drive)
│
└── _cliente/                ← Carpeta SOLO para el proyecto cliente
    ├── .clasp.json          ← Apunta al cliente (en .gitignore — recrear con SECRETOS.md)
    ├── Código.js            ← Las 32 funciones wrapper del cliente
    └── appsscript.json      ← Manifiesto mínimo del cliente
```

---

## 6. FLUJO DE TRABAJO: DESARROLLO Y DESPLIEGUE

### REGLA DE ORO
```
DEV → probar → PROD → publicar versión → actualizar cliente
NUNCA saltarse el DEV cuando hay cambios de código
```

### 6.1 Hacer cambios en el código
Editar los archivos en VS Code, luego subir a DEV:
```bash
clasp push --force
```
*(usa `.clasp.json` por defecto → va a SST_CORE_DEV)*

### 6.2 Probar en DEV
1. Ir a Apps Script → abrir **SST_CORE_DEV** (link en SECRETOS.md)
2. **Implementar** → **Probar implementaciones**
3. Copiar el enlace `/dev` y abrirlo en el navegador
4. Probar todos los cambios

### 6.3 Subir a PROD (solo cuando pruebas estén aprobadas)
```bash
clasp push --force --project .clasp.prod.json
```

### 6.4 Publicar nueva versión en SST_CORE_MASTER
1. Apps Script → **SST_CORE_MASTER**
2. **Implementar** → **Administrar implementaciones**
3. Lápiz → **Nueva versión** → descripción del cambio → **Implementar**

### 6.5 Actualizar la biblioteca en el cliente
1. Apps Script → **APP_WEB_SECURITY_WORK_S&M**
2. **Bibliotecas** → **SST_CORE_MASTER** → cambiar al número de versión nuevo → **Guardar**

### 6.6 Nueva implementación del cliente
1. Todavía en **APP_WEB_SECURITY_WORK_S&M**
2. **Implementar** → **Administrar implementaciones** → lápiz → **Nueva versión** → **Implementar**

---

## 7. GESTIÓN DEL PROYECTO CLIENTE (MUY IMPORTANTE)

### El problema recurrente
El `Código.gs` del cliente tiene 32 funciones wrapper. Si queda con solo 3 funciones, la app falla:
```
google.script.run.validarCredenciales is not a function
```

### Cómo actualizar Código.gs del cliente (única forma correcta)
```bash
cd _cliente
clasp push --force
cd ..
```
Luego seguir pasos 6.6.

### NUNCA hacer
- ❌ Editar Código.gs del cliente en el editor online de Apps Script
- ❌ Hacer `clasp push` desde la raíz hacia el cliente

---

## 8. CONFIGURACIÓN DEL ENTORNO DEV (Script Properties)

Una sola vez por computador/entorno:

1. Apps Script → **SST_CORE_DEV** → ⚙️ → **Configuración del proyecto**
2. **Propiedades del script** → **Agregar propiedad**:
   - Nombre: `SPREADSHEET_ID`
   - Valor: *(ver SECRETOS.md → Spreadsheet DEV)*
3. **Guardar**

> Esta configuración NO se borra con `clasp push`. Es persistente en GAS.

---

## 9. CÓMO AGREGAR UN NUEVO CLIENTE

1. Crear nuevo proyecto GAS vacío en https://script.google.com
2. Copiar el contenido de `TEMPLATE_CLIENTE_Codigo.txt` en su `Código.gs`
3. Agregar biblioteca SST_CORE_MASTER con la versión más reciente
4. ⚙️ → Propiedades del script → agregar `SPREADSHEET_ID` del cliente
5. Ejecutar `inicializarProduccion()` UNA SOLA VEZ
6. Implementar como Web App (Ejecutar como: Yo / Acceso: Cualquier usuario)
7. Agregar el scriptId del nuevo proyecto a `SECRETOS.md`

---

## 10. PROBLEMAS COMUNES Y SOLUCIONES

### App no carga / "La conexión tardó demasiado"
Código.gs del cliente perdió las 32 funciones.
```bash
cd _cliente && clasp push --force && cd ..
```
Luego nueva implementación del cliente (paso 6.6).

### "google.script.run.X is not a function"
Misma causa. Mismo fix que arriba.

### La app funciona en DEV pero no en PROD
No se publicó nueva versión de SST_CORE_MASTER o el cliente no actualizó la versión.
Seguir pasos 6.3 → 6.4 → 6.5 → 6.6 en orden.

### clasp push falla con "Could not find authorization"
Las credenciales expiraron.
```bash
clasp login
```

---

## 11. COMANDOS RÁPIDOS

| Acción | Comando |
|---|---|
| Subir cambios a DEV | `clasp push --force` |
| Subir cambios a PROD | `clasp push --force --project .clasp.prod.json` |
| Actualizar Código.gs del cliente | `cd _cliente && clasp push --force && cd ..` |
| Ver estado | `clasp status` |
| Ver historial git | `git log --oneline` |
