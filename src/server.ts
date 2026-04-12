import express from 'express';
import path from 'path';
import os from 'os';
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
app.use(express.static(path.join(__dirname, '..', 'public')));

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

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🖥️  星辰電腦管理系統已啟動: http://localhost:${PORT}`);
  console.log(`📡 內網存取: http://${getLocalIP()}:${PORT}`);
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
