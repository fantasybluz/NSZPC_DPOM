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
echo "📦 [1/8] 安裝必要工具..."

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
echo "📁 [2/8] 建立資料目錄..."
sudo mkdir -p /var/lib/nszpc/postgres
sudo mkdir -p /var/lib/nszpc/uploads
sudo chmod 777 /var/lib/nszpc/postgres
sudo chmod 777 /var/lib/nszpc/uploads
echo "  ✅ /var/lib/nszpc/{postgres,uploads}"
echo ""

# ========== 3. Build Docker Image ==========
echo "🐳 [3/8] Build Docker Image..."
sudo docker build -t nszpc-dpom:latest .
echo "  ✅ Image build 完成"
echo ""

# ========== 4. 匯入 Image 到 microk8s ==========
echo "📤 [4/8] 匯入 Image 到 microk8s..."
sudo docker save nszpc-dpom:latest > /tmp/nszpc-dpom.tar
sudo microk8s ctr image import /tmp/nszpc-dpom.tar
rm -f /tmp/nszpc-dpom.tar
echo "  ✅ Image 已匯入"
echo ""

# ========== 5. 部署基礎資源 ==========
echo "🔧 [5/8] 部署 Namespace + Secret + PV..."
sudo microk8s kubectl apply -f deploy/k8s/namespace.yaml
sudo microk8s kubectl apply -f deploy/k8s/secret.yaml
sudo microk8s kubectl apply -f deploy/k8s/pv.yaml
echo "  ✅ 基礎資源已建立"
echo ""

# ========== 6. 部署 PostgreSQL ==========
echo "🐘 [6/8] 部署 PostgreSQL..."
sudo microk8s kubectl apply -f deploy/k8s/postgres.yaml
echo "  ⏳ 等待 PostgreSQL 就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc-postgres -n nszpc --timeout=120s
echo "  ✅ PostgreSQL 已就緒"
echo ""

# ========== 7. 部署 App ==========
echo "🖥️  [7/8] 部署應用程式..."
sudo microk8s kubectl apply -f deploy/k8s/deployment.yaml
sudo microk8s kubectl apply -f deploy/k8s/service.yaml
echo "  ⏳ 等待應用程式就緒..."
sudo microk8s kubectl wait --for=condition=ready pod -l app=nszpc -n nszpc --timeout=120s
echo "  ✅ 應用程式已就緒"
echo ""

# ========== 8. 部署 Nginx ==========
echo "🌐 [8/8] 部署 Nginx 反向代理..."
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
echo "  🌐 存取網址: http://${IP}"
echo "     (Nginx port 80 → NodePort 30080)"
echo ""
echo "  👤 管理員帳號: admin / admin"
echo ""
echo "  📋 常用指令："
echo "    查看狀態:    sudo microk8s kubectl get all -n nszpc"
echo "    查看 App 日誌: sudo microk8s kubectl logs -f deploy/nszpc-app -n nszpc"
echo "    查看 Nginx 日誌: sudo microk8s kubectl logs -f deploy/nszpc-nginx -n nszpc"
echo "    重啟應用:    sudo microk8s kubectl rollout restart deploy/nszpc-app -n nszpc"
echo "    載入測試資料: sudo microk8s kubectl exec -it deploy/nszpc-app -n nszpc -- node dist/seed.js"
echo "========================================="
