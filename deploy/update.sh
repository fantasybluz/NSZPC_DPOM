#!/bin/bash
set -e

echo "========================================="
echo "  NSZPC 星辰電腦管理系統 - 更新部署"
echo "========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# 1. 拉取最新程式碼
echo "📥 [1/4] 拉取最新程式碼..."
git pull
echo ""

# 自動產生版號
APP_VERSION="$(date +%Y%m%d)-$(git rev-parse --short HEAD)"
echo "📌 版號: ${APP_VERSION}"
echo ""

# 2. 重新 build images
echo "🐳 [2/4] Build API Image..."
sudo docker build --build-arg APP_VERSION="${APP_VERSION}" -t nszpc-api:latest .
echo ""

echo "🌐 [3/4] Build Nginx Image (含 Next.js)..."
sudo docker build -t nszpc-nginx:latest -f deploy/Dockerfile.nginx .
echo ""

# 3. 匯入 + 重啟
echo "🔄 [4/4] 匯入 Image 並重啟..."
sudo docker save nszpc-api:latest | sudo microk8s ctr image import -
sudo docker save nszpc-nginx:latest | sudo microk8s ctr image import -

# 更新 K8s 設定（如有改動）
sudo microk8s kubectl apply -f deploy/k8s/

# 重啟 pods
sudo microk8s kubectl rollout restart deploy/nszpc-app -n nszpc
sudo microk8s kubectl rollout restart deploy/nszpc-nginx -n nszpc

echo ""
echo "⏳ 等待就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc -n nszpc --timeout=120s
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc-nginx -n nszpc --timeout=60s
echo ""

echo "📊 部署狀態："
sudo microk8s kubectl get pods -n nszpc
echo ""
echo "✅ 更新完成！版號: ${APP_VERSION}"
