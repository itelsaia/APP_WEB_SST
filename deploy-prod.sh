#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  deploy-prod.sh  —  Despliegue completo a producción
#  Uso: bash deploy-prod.sh
#
#  Lo que hace este script automáticamente:
#   1. Push del código core → SST_CORE_MASTER (PROD)
#   2. Push del Código.gs → cada carpeta en _clientes/*/
#   3. Muestra recordatorio de pasos manuales en GAS
# ═══════════════════════════════════════════════════════════════════

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CLASP_JSON="$SCRIPT_DIR/.clasp.json"
DEV_ID="1Ac_RObbEOak_qE-lcQGUFCIO71Pjh4LEXhj5Xxcmqiuc475wdhiL5l_5"
PROD_ID="1OSJxzs28piv1fpPmbZRXik9iRN1eDE0baUUggp-H5QIAiEjYfLGyhyey"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║       DESPLIEGUE A PRODUCCIÓN — SST ITELSA IA        ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── PASO 1: Push SST_CORE_MASTER (PROD) ───────────────────────────
echo "▶ [1/2] Pusheando SST_CORE_MASTER (PROD)..."

node -e "
  var fs = require('fs');
  var j = JSON.parse(fs.readFileSync('$CLASP_JSON'));
  j.scriptId = '$PROD_ID';
  fs.writeFileSync('$CLASP_JSON', JSON.stringify(j, null, 2));
"

cd "$SCRIPT_DIR"
clasp push --force
echo "   ✓ SST_CORE_MASTER actualizado"

node -e "
  var fs = require('fs');
  var j = JSON.parse(fs.readFileSync('$CLASP_JSON'));
  j.scriptId = '$DEV_ID';
  fs.writeFileSync('$CLASP_JSON', JSON.stringify(j, null, 2));
"
echo "   ✓ .clasp.json restaurado a DEV"

# ── PASO 2: Push a cada carpeta de cliente en _clientes/ ──────────
echo ""
echo "▶ [2/2] Pusheando a clientes..."

CLIENTES_DIR="$SCRIPT_DIR/_clientes"
if [ -d "$CLIENTES_DIR" ]; then
  for CLIENT_DIR in "$CLIENTES_DIR"/*/; do
    if [ -f "$CLIENT_DIR/.clasp.json" ]; then
      CLIENT_NAME=$(basename "$CLIENT_DIR")
      echo "   → Pusheando cliente: $CLIENT_NAME"
      cd "$CLIENT_DIR"
      clasp push --force
      echo "   ✓ $CLIENT_NAME actualizado"
      cd "$SCRIPT_DIR"
    fi
  done
else
  echo "   ⚠ Carpeta _clientes/ no encontrada"
fi

# ── PASO 3: Recordatorio pasos manuales ───────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ PUSH COMPLETO — Pasos manuales restantes en GAS:         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  1. SST_CORE_MASTER:                                         ║"
echo "║     Implementar → Administrar → editar → Nueva versión       ║"
echo "║                                                              ║"
echo "║  2. Por cada cliente (ej: APP_WEB_SECURITY_WORK_S&M):        ║"
echo "║     a) Bibliotecas → SST_CORE_MASTER → versión nueva         ║"
echo "║     b) Implementar → Administrar → editar → Nueva versión    ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
