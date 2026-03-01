# Guía de Despliegue — SST ITELSA IA

## Arquitectura del sistema

```
┌─────────────────────────────────────────────────────────────┐
│                    REPOSITORIO LOCAL (Git)                   │
│                                                             │
│  ┌──────────────────┐      ┌────────────────────────────┐   │
│  │  Código CORE     │      │  _clientes/                │   │
│  │  (raíz del repo) │      │  ├── security_work_sm/     │   │
│  │  Backend.gs      │      │  │   ├── .clasp.json       │   │
│  │  App.js.html     │      │  │   ├── Código.js         │   │
│  │  Login.html      │      │  │   └── *.html            │   │
│  │  ...             │      │  └── [nuevo_cliente]/      │   │
│  └────────┬─────────┘      └──────────────┬─────────────┘   │
│           │                               │                  │
└───────────┼───────────────────────────────┼──────────────────┘
            │ clasp push (PROD)             │ clasp push
            ▼                               ▼
   ┌────────────────┐            ┌──────────────────────────┐
   │ SST_CORE_MASTER│            │ APP_WEB_SECURITY_WORK_S&M│
   │ (Biblioteca    │◄───────────│ (Proyecto cliente GAS)   │
   │  GAS PROD)     │  usa como  │  Código.gs               │
   └────────────────┘  biblioteca└──────────────────────────┘
            ▲
            │ usa como biblioteca
   ┌────────────────┐
   │ SST_CLIENTE_DEV│
   │ (Proyecto de   │
   │  pruebas)      │
   └────────────────┘
```

**Proyectos GAS:**
| Proyecto | Uso | scriptId |
|---|---|---|
| SST_CORE_MASTER | Biblioteca PROD (toda la lógica) | `1OSJxzs28piv...` |
| SST_CLIENTE_DEV | Ambiente de pruebas | scriptId DEV |
| APP_WEB_SECURITY_WORK_S&M | Cliente PROD real | `1Xszar7a2HYL...` |

---

## Flujo 1 — Desarrollo y pruebas en DEV

Cuando haces cambios al código:

```bash
# 1. Editar archivos normalmente en VSCode
# 2. Subir al ambiente de pruebas:
clasp push --force

# 3. Abrir SST_CLIENTE_DEV y probar
# 4. Cuando todo funciona → ir al Flujo 2
```

> **Importante:** `clasp push --force` sin tocar `.clasp.json` siempre sube al DEV.

---

## Flujo 2 — Despliegue a producción (después de aprobar pruebas)

### Paso A: Ejecutar el script (automático)

```bash
bash deploy-prod.sh
```

Este script hace **automáticamente**:
- Push del código core → SST_CORE_MASTER PROD
- Push del Código.gs → cada cliente en `_clientes/*/`
- Restaura `.clasp.json` a DEV

### Paso B: Publicar nueva versión en SST_CORE_MASTER (manual, ~1 min)

1. Abrir [SST_CORE_MASTER en GAS](https://script.google.com)
2. **Implementar → Administrar las implementaciones**
3. Clic en el **lápiz** del deployment activo
4. Versión → **"Nueva versión"** → escribir descripción (ej: `v1.5 - fix despedida`)
5. Clic en **Implementar**
6. Anotar el número de versión publicado (ej: Versión 21)

### Paso C: Actualizar cada cliente (manual, ~2 min por cliente)

En cada proyecto cliente (ej: **APP_WEB_SECURITY_WORK_S&M**):

1. **Bibliotecas** en el panel izquierdo → clic en **SST_CORE_MASTER**
2. Cambiar versión al número nuevo (ej: 21) → **Guardar**
3. **Implementar → Administrar las implementaciones**
4. Clic en el **lápiz** del deployment activo
5. Versión → **"Nueva versión"** → **Implementar**

✅ Los usuarios verán los cambios inmediatamente al recargar la app.

---

## Flujo 3 — Agregar un nuevo cliente

### Paso 1: Crear el proyecto GAS del cliente

1. Ir a [script.google.com](https://script.google.com) → **Nuevo proyecto**
2. Renombrarlo (ej: `APP_WEB_EMPRESA_XYZ`)
3. Copiar el **scriptId** de la URL: `script.google.com/home/projects/[SCRIPT_ID]/edit`

### Paso 2: Configurar el proyecto GAS

En el editor GAS del nuevo cliente:

**a) Pegar el Código.gs:**
- Borrar todo el contenido del archivo `Código.gs`
- Copiar todo el contenido de `_clientes/security_work_sm/Código.js` y pegarlo
- Guardar

**b) Agregar la biblioteca SST_CORE_MASTER:**
- Panel izquierdo → **Bibliotecas** → clic en `+`
- Script ID: `1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey`
- Seleccionar la **versión más reciente**
- Identificador: `SST_CORE_MASTER` (exactamente así)
- Clic en **Agregar**

**c) Agregar el SPREADSHEET_ID:**
- Panel izquierdo → **⚙️ Configuración del proyecto**
- Sección **Propiedades del script** → **Agregar propiedad**
- Clave: `SPREADSHEET_ID`
- Valor: ID del Google Sheet del cliente (está en la URL del Sheet)
- Clic en **Guardar**

**d) Inicializar la base de datos (UNA SOLA VEZ):**
- Seleccionar función `inicializarProduccion` en el menú desplegable
- Clic en **Ejecutar**
- Autorizar los permisos cuando aparezca el popup

**e) Implementar como Web App:**
- **Implementar → Nueva implementación**
- Tipo: **Aplicación web**
- Ejecutar como: **Yo (tu cuenta)**
- Quién tiene acceso: **Cualquier usuario**
- Clic en **Implementar**
- Copiar la **URL de la web app** — esa es la URL que se le da a los usuarios

### Paso 3: Registrar el cliente en el repositorio local

```bash
# 1. Crear carpeta del cliente en _clientes/
mkdir "_clientes/nombre_empresa"

# 2. Copiar los archivos del cliente existente como base
cp _clientes/security_work_sm/* "_clientes/nombre_empresa/"
```

**3. Editar `_clientes/nombre_empresa/.clasp.json`** — cambiar el scriptId:
```json
{
  "scriptId": "EL_NUEVO_SCRIPT_ID_DEL_CLIENTE",
  "rootDir": "",
  ...
}
```

**4. Agregar y commitear:**
```bash
git add "_clientes/nombre_empresa/"
git commit -m "feat: agregar cliente nombre_empresa"
```

Desde ahora, `bash deploy-prod.sh` automáticamente incluirá este cliente en cada despliegue.

---

## Errores frecuentes y soluciones

### "Los cambios no se ven en el cliente"
**Causa:** El deployment del cliente sigue apuntando a una versión antigua.
**Solución:** Seguir el Flujo 2 completo (Pasos B y C).

### "El deployment apunta a la versión nueva pero sigue igual"
**Causa:** El Código.gs del cliente está desactualizado (le faltan funciones).
**Solución:**
```bash
bash deploy-prod.sh   # re-pushea todo incluyendo Código.gs del cliente
```
Luego repetir el Paso C del Flujo 2.

### "google.script.run.funcionNueva() no funciona"
**Causa:** La función existe en SST_CORE_MASTER pero no está re-exportada en el Código.gs del cliente.
**Solución:** Agregar la función en `_clientes/[cliente]/Código.js` y correr `deploy-prod.sh`.

### "Error de autorización al ejecutar inicializarProduccion()"
**Causa:** El proyecto necesita autorización para acceder al Spreadsheet.
**Solución:** Ejecutar cualquier función desde el editor GAS y completar el flujo de OAuth.

---

## Estructura de archivos del repositorio

```
APP_WEB_SST/
├── Backend.gs              ← Lógica principal del servidor
├── App.js.html             ← JavaScript del cliente (frontend)
├── Login.html              ← Página de login
├── Index.html              ← App principal
├── *.html                  ← Demás páginas de la app
├── *.gs                    ← Módulos del backend
├── appsscript.json         ← Configuración GAS
├── .clasp.json             ← Apunta a DEV (NO modificar manualmente)
├── .clasp.prod.json        ← Apunta a PROD (referencia)
├── .claspignore            ← Excluye _clientes/** del push del core
├── deploy-prod.sh          ← Script de despliegue a producción
└── _clientes/
    ├── security_work_sm/   ← APP_WEB_SECURITY_WORK_S&M
    │   ├── .clasp.json     ← scriptId del cliente
    │   ├── Código.js       ← Wrapper de funciones (mantener actualizado)
    │   └── *.html          ← Copias de las páginas
    └── [nuevo_cliente]/    ← Próximo cliente (misma estructura)
```
