import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Factory,
  Package,
  Building2,
  BookOpen,
  BarChart3,
  Users,
  LogOut,
  CloudUpload,
  Menu,
  Settings,
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
  { to: '/account', label: 'Account Settings', icon: Settings },
];

export default function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live date and time
  const [currentDateTime, setCurrentDateTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const closeSidebar = () => {
    setSidebarOpen(false);
  };

  return (
    <div className="app-shell">

      {/* Mobile menu button */}
      <button
        className={`hamburger-btn${sidebarOpen ? ' is-hidden' : ''}`}
        onClick={() => setSidebarOpen(!sidebarOpen)}
        aria-label="Toggle menu"
      >
        <Menu size={22} strokeWidth={2} />
      </button>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="sidebar-scrim"
          onClick={closeSidebar}
        />
      )}

      {/* Sidebar */}
      <aside className={`sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>

        <div className="sidebar-brand">
          {APP_NAME}
          <span>.</span>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS
            .filter((item) => !item.adminOnly || isAdmin)
            .map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                onClick={closeSidebar}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' active' : ''}`
                }
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

          <button
            className="sidebar-link"
            style={{
              width: '100%',
              background: 'none',
              border: 'none',
            }}
            onClick={handleLogout}
          >
            <LogOut size={16} strokeWidth={2} />
            Log out
          </button>
        </div>

      </aside>

      {/* Main area */}
      <div className="main-area">

        {/* Global topbar */}
        <header className="topbar">
          <div className="topbar-date-time">

            <span className="topbar-date">
              {currentDateTime.toLocaleDateString(undefined, {
                weekday: 'long',
                month: 'short',
                day: 'numeric',
                year: 'numeric',
              })}
            </span>

            <span className="topbar-divider">•</span>

            <span className="topbar-time">
              {currentDateTime.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </span>

          </div>

        </header>

        {/* Current page */}
        <Outlet />

        {/* Footer */}
        <Footer />

      </div>

    </div>
  );
}