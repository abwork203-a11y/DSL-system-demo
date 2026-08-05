import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, FileText, Factory, Package, Building2,
  BookOpen, BarChart3, Users, LogOut, CloudUpload,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import Footer from './Footer';
import { APP_NAME } from '../config';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/orders', label: 'Orders', icon: FileText },
  { to: '/distributors', label: 'Distributors', icon: Building2 },
  { to: '/products', label: 'Products', icon: Package, adminOnly: true },
  { to: '/manufacturers', label: 'Manufacturers', icon: Factory, adminOnly: true },
  { to: '/ledger', label: 'Ledger', icon: BookOpen },
  { to: '/reports', label: 'Reports', icon: BarChart3, adminOnly: true },
  { to: '/users', label: 'Sales Reps', icon: Users, adminOnly: true },
  { to: '/backup', label: 'Backup', icon: CloudUpload, adminOnly: true },
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-brand">{APP_NAME}<span>.</span></div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin).map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `sidebar-link${isActive ? ' active' : ''}`}
            >
              <Icon size={16} strokeWidth={2} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <strong>{user?.name}</strong>
            {user?.role === 'admin' ? 'Admin' : 'Sales Rep'}
          </div>
          <button className="sidebar-link" style={{ width: '100%', background: 'none', border: 'none' }} onClick={handleLogout}>
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        </div>
      </aside>
      <div className="main-area">
        <Outlet />
        <Footer />
      </div>
    </div>
  );
}
