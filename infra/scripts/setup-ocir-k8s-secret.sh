#!/usr/bin/env bash
# =========================================================================
# Setup OCI Container Registry (OCIR) ImagePullSecret for K3s/Kubernetes
# =========================================================================
set -euo pipefail

OCIR_REGISTRY="${OCIR_REGISTRY:-hyd.ocir.io}"
OCIR_USERNAME="${OCIR_USERNAME:-}"
OCIR_AUTH_TOKEN="${OCIR_AUTH_TOKEN:-}"
OCIR_EMAIL="${OCIR_EMAIL:-admin@vaagatech.com}"
K8S_NAMESPACE="${K8S_NAMESPACE:-anvesh}"
SECRET_NAME="${SECRET_NAME:-ocir-secret}"

if [ -z "$OCIR_USERNAME" ] || [ -z "$OCIR_AUTH_TOKEN" ]; then
  echo "Usage: OCIR_USERNAME='<tenancy_ns>/<user>' OCIR_AUTH_TOKEN='<token>' ./setup-ocir-k8s-secret.sh"
  echo ""
  echo "Example:"
  echo "  OCIR_USERNAME='axkdaujrafzw/karthiksp' \\"
  echo "  OCIR_AUTH_TOKEN='Abc123Token...' \\"
  echo "  ./setup-ocir-k8s-secret.sh"
  exit 1
fi

echo "==> Creating / Updating secret '$SECRET_NAME' in namespace '$K8S_NAMESPACE' for registry '$OCIR_REGISTRY'..."

kubectl create secret docker-registry "$SECRET_NAME" \
  --docker-server="$OCIR_REGISTRY" \
  --docker-username="$OCIR_USERNAME" \
  --docker-password="$OCIR_AUTH_TOKEN" \
  --docker-email="$OCIR_EMAIL" \
  -n "$K8S_NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> Successfully configured imagePullSecret '$SECRET_NAME' in namespace '$K8S_NAMESPACE'."
