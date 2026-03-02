#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
#  deploy-prod.sh  —  Despliegue completo a producción (automático)
#  Uso: bash deploy-prod.sh
#
#  Flujo automático:
#   1. Push código → SST_CORE_MASTER (PROD)
#   2. Publica nueva versión de SST_CORE_MASTER (clasp version)
#   3. Actualiza appsscript.json de cada cliente con la nueva versión
#   4. Push código → cada cliente en _clientes/*/
#   5. Actualiza todos los deployments del cliente (clasp deploy -i ID)
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

# ── PASO 1: Push código → SST_CORE_MASTER ─────────────────────────
echo "▶ [1/3] Pusheando código → SST_CORE_MASTER (PROD)..."

sed -i "s/$DEV_ID/$PROD_ID/" "$CLASP_JSON"
cd "$SCRIPT_DIR"
clasp push --force
echo "   ✓ Código actualizado en SST_CORE_MASTER"

# ── PASO 2: Publicar nueva versión de SST_CORE_MASTER ─────────────
echo ""
echo "▶ [2/3] Publicando nueva versión de SST_CORE_MASTER..."
VERSION_OUTPUT=$(clasp version "Deploy $(date '+%Y-%m-%d')" 2>&1)
SST_VERSION=$(echo "$VERSION_OUTPUT" | grep -oE '[0-9]+' | tail -1)

sed -i "s/$PROD_ID/$DEV_ID/" "$CLASP_JSON"
echo "   ✓ .clasp.json restaurado a DEV"

if [ -z "$SST_VERSION" ]; then
  echo "   ⚠ No se pudo detectar versión automáticamente."
  read -p "   Ingresa el número de versión de SST_CORE_MASTER: " SST_VERSION
fi
echo "   ✓ Nueva versión de SST_CORE_MASTER: v$SST_VERSION"

# ── PASO 3: Actualizar y desplegar cada cliente ────────────────────
echo ""
echo "▶ [3/3] Desplegando clientes..."

CLIENTES_DIR="$SCRIPT_DIR/_clientes"
if [ -d "$CLIENTES_DIR" ]; then
  for CLIENT_DIR in "$CLIENTES_DIR"/*/; do
    if [ -f "$CLIENT_DIR/.clasp.json" ]; then
      CLIENT_NAME=$(basename "$CLIENT_DIR")
      echo ""
      echo "   ── $CLIENT_NAME ──"

      # Actualizar versión de SST_CORE_MASTER en appsscript.json
      if [ -f "$CLIENT_DIR/appsscript.json" ]; then
        sed -i "s/\"version\": \"[0-9]*\"/\"version\": \"$SST_VERSION\"/" "$CLIENT_DIR/appsscript.json"
        echo "   ✓ appsscript.json → versión $SST_VERSION"
      fi

      # Push código del cliente
      cd "$CLIENT_DIR"
      clasp push --force
      echo "   ✓ Código pusheado"

      # Auto-actualizar deployments del cliente sin pasos manuales en GAS
      if [ -f "deployments.conf" ]; then
        echo "   → Actualizando deployments..."
        while IFS= read -r DEPLOY_ID; do
          [[ -z "$DEPLOY_ID" || "$DEPLOY_ID" == \#* ]] && continue
          clasp deploy -i "$DEPLOY_ID" -d "v$SST_VERSION $(date '+%Y-%m-%d')" > /dev/null 2>&1 \
            && echo "      ✓ ${DEPLOY_ID:0:40}..." \
            || echo "      ⚠ Error: ${DEPLOY_ID:0:40}..."
        done < "deployments.conf"
      else
        echo "   ℹ Sin deployments.conf — actualiza los deployments en GAS manualmente"
      fi

      cd "$SCRIPT_DIR"
      echo "   ✓ $CLIENT_NAME completo"
    fi
  done
else
  echo "   ⚠ Carpeta _clientes/ no encontrada"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  ✅ DESPLIEGUE COMPLETO — Sin pasos manuales en GAS          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
