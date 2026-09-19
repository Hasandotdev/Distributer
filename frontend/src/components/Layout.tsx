import { useState } from 'react';
import { Outlet, Link, useLocation, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Banknote,
  Store,
  Route,
  Users,
  BarChart3,
  Menu,
  LogOut,
  Sun,
  Moon,
  Printer,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { cn } from '@/lib/utils';

const allNavItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'employee'] },
  { to: '/bills', label: 'Bills', icon: FileText, roles: ['admin', 'employee'] },
  { to: '/recoveries', label: 'Recoveries', icon: Banknote, roles: ['admin', 'employee'] },
  { to: '/customers', label: 'Customers', icon: Store, roles: ['admin', 'employee'] },
  { to: '/routes', label: 'Routes', icon: Route, roles: ['admin', 'employee'] },
  { to: '/employees', label: 'Employees', icon: Users, roles: ['admin'] },
  { to: '/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'employee'] },
  { to: '/print', label: 'Print', icon: Printer, roles: ['admin', 'employee'] },
];

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const { userRole, signOut } = useAuth();
  const { isDark, toggle } = useTheme();
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = allNavItems.filter((item) => item.roles.includes(userRole || 'employee'));

  async function handleLogout() {
    await signOut();
    navigate('/login');
  }

  return (
    <div className={cn(
      "flex h-screen overflow-hidden",
      "bg-slate-50 dark:bg-slate-950",
      "text-slate-900 dark:text-slate-100"
    )}>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "flex-shrink-0 flex flex-col z-40 transition-all duration-200",
          "bg-slate-900 dark:bg-slate-950",
          expanded ? "w-52" : "w-[60px]",
          "fixed inset-y-0 left-0 lg:relative lg:inset-auto",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
      >
        <div className="flex h-14 items-center justify-center border-b border-slate-700/50 flex-shrink-0">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">D</span>
          </div>
        </div>

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = location.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white"
                )}
              >
                <Icon className="h-[18px] w-[18px] flex-shrink-0" />
                <span
                  className={cn(
                    "whitespace-nowrap overflow-hidden transition-opacity duration-150",
                    expanded ? "opacity-100" : "opacity-0"
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <header className={cn(
          "h-14 flex items-center justify-between px-4 lg:px-5 flex-shrink-0",
          "bg-white dark:bg-slate-900",
          "border-b border-slate-200 dark:border-slate-800"
        )}>
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden">
              <Menu className="h-5 w-5 text-slate-600 dark:text-slate-400" />
            </button>
            <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-200 hidden sm:block">
              Distribution & Credit Management System
            </h1>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={toggle}
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              {isDark ? (
                <Sun className="h-[18px] w-[18px] text-amber-500" />
              ) : (
                <Moon className="h-[18px] w-[18px] text-slate-500" />
              )}
            </button>

            <div className="h-5 w-px bg-slate-200 dark:bg-slate-700 mx-1" />

            <span className="text-xs px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hidden sm:inline">
              {userRole}
            </span>

            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
