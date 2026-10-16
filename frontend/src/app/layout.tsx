import type { Metadata } from 'next';
import 'bootstrap/dist/css/bootstrap.min.css';
import 'bootstrap-icons/font/bootstrap-icons.min.css';
import '@/styles/globals.css';
// Apple 風格（DESIGN.md）疊在最上面
import '@/styles/apple.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ToastProvider } from '@/contexts/ToastContext';
import BootstrapClient from '@/components/BootstrapClient';

export const metadata: Metadata = {
  title: '星辰電腦管理系統',
  description: 'NSZPC 星辰電腦內部管理系統',
  // 跟官網同一套 NSZ 立方體圖示；?v= 是讓瀏覽器丟掉以前快取的圖示，換圖時加一
  icons: {
    icon: [
      { url: '/favicon.ico?v=3', sizes: '16x16 32x32 48x48' },
      { url: '/favicon-32.png?v=3', type: 'image/png', sizes: '32x32' },
    ],
    apple: '/apple-touch-icon.png?v=3',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-TW">
      <body>
        <AuthProvider>
          <ToastProvider>
            {children}
          </ToastProvider>
        </AuthProvider>
        <BootstrapClient />
      </body>
    </html>
  );
}
