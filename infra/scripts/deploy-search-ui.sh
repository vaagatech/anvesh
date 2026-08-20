#!/usr/bin/env bash
set -euo pipefail

# Script to build and deploy Search UI with Cognito to AWS S3 & CloudFront

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SEARCHENGINE_DIR="$(cd "$ROOT_DIR/../searchengine" && pwd)"
UI_DIR="$SEARCHENGINE_DIR/apps/hub-ui"

echo "=== 1. Reading Terraform Outputs ==="
cd "$ROOT_DIR"
S3_BUCKET=$(terraform output -raw search_ui_s3_bucket 2>/dev/null || echo "")
CF_DIST_ID=$(terraform output -raw search_ui_cloudfront_distribution_id 2>/dev/null || echo "")
API_URL=$(terraform output -raw anvesh_api_url 2>/dev/null || echo "https://api.vaagatech.com/anvesh")
COGNITO_POOL_ID=$(terraform output -raw cognito_user_pool_id 2>/dev/null || echo "")
COGNITO_CLIENT_ID=$(terraform output -raw cognito_ui_client_id 2>/dev/null || echo "")
COGNITO_REGION=$(terraform output -raw cognito_region 2>/dev/null || echo "us-east-1")

if [ -z "$S3_BUCKET" ] || [ -z "$CF_DIST_ID" ]; then
  echo "Error: Could not retrieve S3 bucket or CloudFront distribution ID from terraform output."
  echo "Please make sure you have run 'terraform apply' first."
  exit 1
fi

echo "Target S3 Bucket:        $S3_BUCKET"
echo "CloudFront Dist ID:      $CF_DIST_ID"
echo "Anvesh API Gateway URL:  $API_URL"
echo "Cognito User Pool ID:    $COGNITO_POOL_ID"
echo "Cognito UI Client ID:    $COGNITO_CLIENT_ID"
echo "Cognito Region:          $COGNITO_REGION"

echo ""
echo "=== 2. Building Search UI with Vite & Cognito Config ==="
cd "$UI_DIR"

# Export environment variables for Vite bundle build
export VITE_API_BASE_URL="$API_URL"
export VITE_COGNITO_USER_POOL_ID="$COGNITO_POOL_ID"
export VITE_COGNITO_CLIENT_ID="$COGNITO_CLIENT_ID"
export VITE_COGNITO_REGION="$COGNITO_REGION"

npm install
npm run build

BUILD_OUT_DIR="$UI_DIR/dist"

echo "Build directory: $BUILD_OUT_DIR"

echo ""
echo "=== 3. Syncing Assets to S3 ==="
# Sync static hashed assets with 1-year cache
aws s3 sync "$BUILD_OUT_DIR" "s3://$S3_BUCKET" \
  --delete \
  --exclude "index.html" \
  --cache-control "public, max-age=31536000, immutable"

# Sync index.html with no-cache so updates reflect immediately
aws s3 cp "$BUILD_OUT_DIR/index.html" "s3://$S3_BUCKET/index.html" \
  --cache-control "no-cache, no-store, must-revalidate"

echo ""
echo "=== 4. Invalidating CloudFront Cache ==="
aws cloudfront create-invalidation \
  --distribution-id "$CF_DIST_ID" \
  --paths "/*"

echo ""
echo "=== Deployment Complete ==="
echo "Search UI is live at: https://search.vaagatech.com"
