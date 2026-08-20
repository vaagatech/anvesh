#!/usr/bin/env bash
# =========================================================================
# Anvesh Enterprise Customer Packaging Script
# Generates a standalone, air-gapped customer distribution tarball containing:
# 1. Docker Compose setup
# 2. Kubernetes / K3s production manifest
# 3. Environment configuration template
# 4. Automated 1-line customer installer script
# =========================================================================

set -e

VERSION="0.4.0"
DIST_DIR="dist-customer/anvesh-enterprise-v${VERSION}"

echo "📦 Packaging Anvesh Enterprise Edition v${VERSION} for customer distribution..."

# 1. Clean & create output directory
rm -rf dist-customer
mkdir -p "${DIST_DIR}/k8s" "${DIST_DIR}/docker" "${DIST_DIR}/config"

# 2. Copy Kubernetes production manifest & Prometheus configuration
cp infra/k8s/anvesh-k8s.yaml "${DIST_DIR}/k8s/anvesh.yaml"

# 3. Create standalone Docker Compose for single-VM customer installations
cat << 'EOF' > "${DIST_DIR}/docker/docker-compose.yml"
version: '3.8'

services:
  anvesh-engine:
    image: vaagatech/anvesh:0.4.0
    container_name: anvesh-engine
    command: ["node", "apps/engine/dist/api/server.js"]
    restart: always
    ports:
      - "3848:3848"
    environment:
      - ANVESH_PORT=3848
      - NODE_ENV=production
      - ANVESH_STORAGE=filesystem
      - ANVESH_DATA_DIR=/data
    volumes:
      - anvesh_data:/data
    deploy:
      resources:
        limits:
          memory: 256M

  anvesh-hub:
    image: vaagatech/anvesh:0.4.0
    container_name: anvesh-hub
    command: ["node", "apps/hub-api/dist/server.js"]
    restart: always
    ports:
      - "3849:3849"
    environment:
      - ANVESH_HUB_PORT=3849
      - ANVESH_HUB_ADMIN_USER=admin
      - ANVESH_HUB_ADMIN_PASSWORD=change-me-in-production
      - NODE_ENV=production
    volumes:
      - anvesh_hub_data:/data/hub
    depends_on:
      - anvesh-engine

  anvesh-spider:
    image: vaagatech/anvesh:0.4.0
    container_name: anvesh-spider
    command: ["node", "apps/spider/dist/serve.js"]
    restart: always
    ports:
      - "3851:3851"
    environment:
      - ANVESH_SPIDER_PORT=3851
    depends_on:
      - anvesh-engine

  anvesh-indexer:
    image: vaagatech/anvesh:0.4.0
    container_name: anvesh-indexer
    command: ["node", "apps/indexer/dist/serve.js"]
    restart: always
    ports:
      - "3852:3852"
    environment:
      - ANVESH_INDEXER_PORT=3852
    depends_on:
      - anvesh-engine

volumes:
  anvesh_data:
  anvesh_hub_data:
EOF

# 4. Create customer environment configuration template
cat << 'EOF' > "${DIST_DIR}/config/anvesh.env.example"
# =========================================================================
# Anvesh Enterprise Customer Configuration
# =========================================================================

# Administrator Credentials
ANVESH_HUB_ADMIN_USER=admin
ANVESH_HUB_ADMIN_PASSWORD=YOUR_SECURE_ADMIN_PASSWORD

# Storage Tiering (filesystem, s3, or oci)
ANVESH_STORAGE=filesystem
ANVESH_DATA_DIR=/data

# ResourceGuard Memory & CPU Ceiling (Max 75% recommended)
ANVESH_HEAP_MAX_RATIO=0.75
ANVESH_HEAP_WARN_RATIO=0.65

# S3 / OCI Object Storage (Optional Cold Storage Tier)
# AWS_ACCESS_KEY_ID=
# AWS_SECRET_ACCESS_KEY=
# S3_BUCKET=
# S3_REGION=us-east-1
EOF

# 5. Create customer installer script
cat << 'EOF' > "${DIST_DIR}/install.sh"
#!/usr/bin/env bash
# Anvesh Enterprise 1-Click Installer
set -e

echo "============================================================"
echo "  🚀 Installing Anvesh Enterprise Search & Vector Platform  "
echo "============================================================"

# Check if Docker or Kubectl is installed
if command -v docker &> /dev/null && command -v docker-compose &> /dev/null; then
  echo "✓ Docker environment detected. Starting standalone cluster..."
  cd docker
  docker-compose up -d
  echo ""
  echo "✅ Anvesh is running!"
  echo "   - Search Engine API: http://localhost:3848"
  echo "   - Hub Web Control Plane: http://localhost:3849"
  echo "   - Username: admin / Password: change-me-in-production"
elif command -v kubectl &> /dev/null; then
  echo "✓ Kubernetes environment detected. Deploying to cluster..."
  kubectl apply -f k8s/anvesh.yaml
  echo ""
  echo "✅ Anvesh deployed to Kubernetes namespace 'anvesh'!"
  echo "   Run 'kubectl get pods -n anvesh' to monitor status."
else
  echo "❌ Neither Docker nor Kubectl found. Please install Docker or Kubernetes to run Anvesh."
  exit 1
fi
EOF
chmod +x "${DIST_DIR}/install.sh"

# 6. Create customer README
cat << 'EOF' > "${DIST_DIR}/README.md"
# Anvesh Enterprise Search & Vector Database Platform

Thank you for choosing **Anvesh** by VaagaTech!

## Quick Installation

### Option 1: Docker Compose (Single VM / Server)
```bash
./install.sh
```
Or manually:
```bash
cd docker
docker-compose up -d
```

### Option 2: Kubernetes / K3s (Production Cluster)
```bash
kubectl apply -f k8s/anvesh.yaml
```

## Access Endpoints
- **Search Engine REST API**: `http://<your-host>:3848`
- **Hub Operator Control Plane**: `http://<your-host>:3849`
- **Spider Crawler**: `http://<your-host>:3851`
- **Bulk Indexer**: `http://<your-host>:3852`

## Enterprise Support & Inquiries
- **Support**: support@vaagatech.com
- **Website**: https://www.vaagatech.com
EOF

# 7. Package into final tarball
tar -czvf "dist-customer/anvesh-enterprise-v${VERSION}.tar.gz" -C dist-customer "anvesh-enterprise-v${VERSION}"

echo "🎉 Enterprise customer distribution package created:"
echo "   dist-customer/anvesh-enterprise-v${VERSION}.tar.gz"
