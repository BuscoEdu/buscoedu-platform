#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

echo "========================================="
echo "Verificación de NO-regresión (sitio público)"
echo "========================================="
echo

declare -a PATHS=(
  "app/page.tsx"
  "app/explorar/page.tsx"
  "components/layout/Header.tsx"
  "components/layout/Footer.tsx"
  "components/naia"
  "src/lib/naia-mock.ts"
)

echo "Archivos/rutas monitoreadas:"
for p in "${PATHS[@]}"; do
  echo " - $p"
done
echo

echo "Salida de git status (solo rutas monitoreadas):"
STATUS_OUTPUT="$(git status --short -- "${PATHS[@]}" || true)"

if [[ -z "$STATUS_OUTPUT" ]]; then
  echo "✅ Sin cambios detectados en las rutas del sitio público."
else
  echo "$STATUS_OUTPUT"
  echo
  echo "⚠️ Se detectaron cambios en rutas públicas. Revisar antes de desplegar."
fi

echo

echo "Detalle de diferencias (si aplica):"
git diff -- "${PATHS[@]}" || true

echo
echo "Verificación finalizada."
