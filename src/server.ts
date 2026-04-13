import express from 'express';
import path from 'path';
import os from 'os';
import { initDatabase } from './models/database';
import authRouter, { authMiddleware } from './routes/auth';
import inventoryRouter from './routes/inventory';
import quotationsRouter from './routes/quotations';
import customersRouter from './routes/customers';
import suppliersRouter from './routes/suppliers';
import settingsRouter from './routes/settings';
import purchasesRouter from './routes/purchases';
import reportsRouter from './routes/reports';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// 圖片上傳的靜態目錄（保留給 API 使用）
app.use('/api/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// Auth routes (不需要認證)
app.use('/api/auth', authRouter);

// 需要認證的 API
app.use('/api/inventory', authMiddleware, inventoryRouter);
app.use('/api/quotations', authMiddleware, quotationsRouter);
app.use('/api/customers', authMiddleware, customersRouter);
app.use('/api/suppliers', authMiddleware, suppliersRouter);
app.use('/api/purchases', authMiddleware, purchasesRouter);
app.use('/api/reports', authMiddleware, reportsRouter);
app.use('/api/settings', authMiddleware, settingsRouter);

// 初始化資料庫後啟動
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`🖥️  星辰電腦管理系統已啟動: http://localhost:${PORT}`);
    console.log(`📡 內網存取: http://${getLocalIP()}:${PORT}`);
  });
}).catch(err => {
  console.error('❌ 資料庫初始化失敗:', err);
  process.exit(1);
});

function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name] || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}
