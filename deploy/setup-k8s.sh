#!/bin/bash
set -e

echo "========================================="
echo "  NSZPC 星辰電腦管理系統 - K8s 部署腳本"
echo "========================================="
echo ""

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# ========== 1. 安裝必要工具 ==========
echo "📦 [1/9] 安裝必要工具..."

if ! command -v docker &> /dev/null; then
  echo "  安裝 Docker..."
  sudo apt-get update -qq
  sudo apt-get install -y -qq docker.io
  sudo usermod -aG docker $USER
  echo "  ✅ Docker 已安裝"
else
  echo "  ✅ Docker 已存在"
fi

if ! command -v microk8s &> /dev/null; then
  echo "  安裝 microk8s..."
  sudo snap install microk8s --classic
  sudo usermod -aG microk8s $USER
  echo "  ✅ microk8s 已安裝"
else
  echo "  ✅ microk8s 已存在"
fi

echo "  等待 microk8s 就緒..."
sudo microk8s status --wait-ready

echo "  啟用 microk8s 插件..."
sudo microk8s enable dns storage
echo ""

# ========== 2. 建立資料目錄 ==========
echo "📁 [2/9] 建立資料目錄..."
sudo mkdir -p /var/lib/nszpc/postgres
sudo mkdir -p /var/lib/nszpc/uploads
sudo chmod 777 /var/lib/nszpc/postgres
sudo chmod 777 /var/lib/nszpc/uploads
echo "  ✅ /var/lib/nszpc/{postgres,uploads}"
echo ""

# 自動產生版號：日期 + git short hash
APP_VERSION="$(date +%Y%m%d)-$(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "📌 版號: ${APP_VERSION}"
echo ""

# ========== 3. Build 後端 API Image ==========
echo "🐳 [3/9] Build 後端 API Image..."
sudo docker build --build-arg APP_VERSION="${APP_VERSION}" -t nszpc-api:latest .
echo "  ✅ API Image build 完成"
echo ""

# ========== 4. Build 前端 Nginx Image ==========
echo "🌐 [4/9] Build 前端 Nginx Image (含 Next.js)..."
sudo docker build -t nszpc-nginx:latest -f deploy/Dockerfile.nginx .
echo "  ✅ Nginx Image build 完成"
echo ""

# ========== 5. 匯入 Images 到 microk8s ==========
echo "📤 [5/9] 匯入 Images 到 microk8s..."
sudo docker save nszpc-api:latest > /tmp/nszpc-api.tar
sudo microk8s ctr image import /tmp/nszpc-api.tar
rm -f /tmp/nszpc-api.tar

sudo docker save nszpc-nginx:latest > /tmp/nszpc-nginx.tar
sudo microk8s ctr image import /tmp/nszpc-nginx.tar
rm -f /tmp/nszpc-nginx.tar
echo "  ✅ Images 已匯入"
echo ""

# ========== 6. 部署基礎資源 ==========
echo "🔧 [6/9] 部署 Namespace + Secret + PV..."
sudo microk8s kubectl apply -f deploy/k8s/namespace.yaml
sudo microk8s kubectl apply -f deploy/k8s/secret.yaml
sudo microk8s kubectl apply -f deploy/k8s/pv.yaml
echo "  ✅ 基礎資源已建立"
echo ""

# ========== 7. 部署 PostgreSQL ==========
echo "🐘 [7/9] 部署 PostgreSQL..."
sudo microk8s kubectl apply -f deploy/k8s/postgres.yaml
echo "  ⏳ 等待 PostgreSQL 就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc-postgres -n nszpc --timeout=120s
echo "  ✅ PostgreSQL 已就緒"
echo ""

# ========== 8. 部署 App ==========
echo "🖥️  [8/9] 部署 API 應用程式..."
sudo microk8s kubectl apply -f deploy/k8s/deployment.yaml
sudo microk8s kubectl apply -f deploy/k8s/service.yaml
echo "  ⏳ 等待 API 就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc -n nszpc --timeout=120s
echo "  ✅ API 已就緒"
echo ""

# ========== 9. 部署 Nginx ==========
echo "🌐 [9/9] 部署 Nginx (前端 + 反向代理)..."
sudo microk8s kubectl apply -f deploy/k8s/nginx-config.yaml
sudo microk8s kubectl apply -f deploy/k8s/nginx.yaml
echo "  ⏳ 等待 Nginx 就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc-nginx -n nszpc --timeout=60s
echo "  ✅ Nginx 已就緒"
echo ""

# ========== 顯示結果 ==========
echo "📊 部署狀態："
echo ""
sudo microk8s kubectl get all -n nszpc
echo ""

IP=$(hostname -I | awk '{print $1}')
echo "========================================="
echo "  🎉 部署完成！"
echo ""
echo "  🌐 存取網址: http://${IP}:30080"
echo ""
echo "  👤 管理員帳號: admin / admin"
echo ""
echo "  📋 常用指令："
echo "    查看狀態:     sudo microk8s kubectl get all -n nszpc"
echo "    查看 API 日誌: sudo microk8s kubectl logs -f deploy/nszpc-app -n nszpc"
echo "    查看 Nginx 日誌: sudo microk8s kubectl logs -f deploy/nszpc-nginx -n nszpc"
echo "    重啟 API:     sudo microk8s kubectl rollout restart deploy/nszpc-app -n nszpc"
echo "    重啟前端:     sudo microk8s kubectl rollout restart deploy/nszpc-nginx -n nszpc"
echo "========================================="
