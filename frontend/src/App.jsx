import { createBrowserRouter, RouterProvider, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ToastProvider } from './context/ToastContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';


import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import OrdersPage from './pages/OrdersPage';
import CreateOrderPage from './pages/CreateOrderPage';
import OrderDetailPage from './pages/OrderDetailPage';
import DistributorsPage from './pages/DistributorsPage';
import ProductsPage from './pages/ProductsPage';
import ManufacturersPage from './pages/ManufacturersPage';
import LedgerPage from './pages/LedgerPage';
import ReportsPage from './pages/ReportsPage';
import UsersPage from './pages/UsersPage';
import BackupPage from './pages/BackupPage';
import AccountSettingsPage from './pages/AccountSettingsPage';
import TermsPage from './pages/TermsPage';
import PrivacyPage from './pages/PrivacyPage';
import ContactPage from './pages/ContactPage';
import CookiePage from './pages/CookiePage';

// Providers need to sit *inside* the router for hooks like useNavigate/useBlocker
// to work inside them, but App itself is rendered by RouterProvider — so we
// wrap the shared layout route's children in these contexts via a small root element.
function Root() {
  return (
    <AuthProvider>
      <ToastProvider>
        <SocketProvider>
          <Outlet />
        </SocketProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      { path: '/login', element: <LoginPage /> },
      // Public legal/info pages — deliberately outside ProtectedRoute since
      // Terms/Privacy need to be viewable by anyone, logged in or not.
      { path: '/terms', element: <TermsPage /> },
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '/cookies', element: <CookiePage /> },
      { path: '/contact', element: <ContactPage /> },
      {
        element: (
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        ),
        children: [
          { path: '/', element: <DashboardPage /> },
          { path: '/orders', element: <OrdersPage /> },
          { path: '/orders/new', element: <CreateOrderPage /> },
          { path: '/orders/:id', element: <OrderDetailPage /> },
          { path: '/distributors', element: <DistributorsPage /> },
          { path: '/ledger', element: <LedgerPage /> },
          { path: '/products', element: <ProtectedRoute adminOnly><ProductsPage /></ProtectedRoute> },
          { path: '/manufacturers', element: <ProtectedRoute adminOnly><ManufacturersPage /></ProtectedRoute> },
          { path: '/reports', element: <ProtectedRoute adminOnly><ReportsPage /></ProtectedRoute> },
          { path: '/users', element: <ProtectedRoute adminOnly><UsersPage /></ProtectedRoute> },
          { path: '/backup', element: <ProtectedRoute adminOnly><BackupPage /></ProtectedRoute> },
          { path: '/account', element: <AccountSettingsPage /> },
        ],
      },
    ],
  },
]);

export default function App() {
  return <RouterProvider router={router} />;
}
