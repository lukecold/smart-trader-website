import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth";
import { useAuthModalStore } from "@/stores/authModal";
import { LoginModal } from "@/components/auth/LoginModal";
import { logoutApi } from "@/api/auth";

export function Layout() {
  const location = useLocation();
  const { isAuthenticated, email, sessionToken, clearAuth } = useAuthStore();
  const { open } = useAuthModalStore();

  // Off-canvas drawer state — only relevant below the `md` breakpoint.
  // Desktop keeps the persistent sidebar regardless of this value.
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = () => setSidebarOpen(false);

  const handleLogout = async () => {
    if (sessionToken) await logoutApi(sessionToken);
    clearAuth();
  };

  return (
    <div className="min-h-screen flex">
      {/* Backdrop — mobile only, tap to dismiss the drawer */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={closeSidebar}
          aria-hidden="true"
        />
      )}

      {/*
        Sidebar.
        - Desktop (md+): sticky, in-flow persistent sidebar (unchanged behavior).
        - Mobile: fixed off-canvas drawer, slid out by default, slides over
          content when opened. Tap backdrop or a nav link to dismiss.
      */}
      <aside
        className={cn(
          "w-64 bg-gray-900 border-r border-gray-800 flex flex-col overflow-y-auto",
          // Mobile drawer positioning + animation
          "fixed inset-y-0 left-0 z-40 h-screen transition-transform duration-200 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          // Desktop overrides: back to persistent sticky sidebar
          "md:sticky md:top-0 md:z-auto md:translate-x-0"
        )}
      >
        <div className="p-6 border-b border-gray-800 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Smart Trader</h1>
            <p className="text-xs text-gray-500 mt-1">Trading Dashboard</p>
          </div>
          {/* Close button — mobile only */}
          <button
            onClick={closeSidebar}
            className="md:hidden -mr-2 -mt-1 p-2 text-gray-400 hover:text-gray-200"
            aria-label="Close menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/" current={location.pathname === "/"} onClick={closeSidebar}>
            Dashboard
          </NavLink>
          <NavLink
            to="/strategy/create"
            current={location.pathname === "/strategy/create"}
            onClick={closeSidebar}
          >
            Create Strategy
          </NavLink>
        </nav>

        {/* Auth area */}
        <div className="p-4 border-t border-gray-800">
          {isAuthenticated ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-400 truncate" title={email ?? ""}>
                {email}
              </p>
              <button
                onClick={handleLogout}
                className="w-full text-xs px-3 py-2 rounded-lg text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors text-left"
              >
                Log out
              </button>
            </div>
          ) : (
            <button
              onClick={() => open()}
              className="w-full text-xs px-3 py-2 rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition-colors"
            >
              Login
            </button>
          )}
          <p className="text-xs text-gray-700 mt-3">v0.1.0</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 min-w-0 overflow-auto">
        {/* Mobile top bar with hamburger — hidden on desktop */}
        <div className="md:hidden sticky top-0 z-20 flex items-center gap-3 bg-gray-900 border-b border-gray-800 px-4 py-3">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 text-gray-300 hover:text-white"
            aria-label="Open menu"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-base font-bold text-white">Smart Trader</span>
        </div>
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>

      {/* Login modal — always mounted, invisible when closed */}
      <LoginModal />
    </div>
  );
}

function NavLink({
  to,
  current,
  children,
  onClick,
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <Link
      to={to}
      onClick={onClick}
      className={cn(
        "block px-3 py-2 rounded-lg text-sm transition-colors",
        current
          ? "bg-blue-600/20 text-blue-400"
          : "text-gray-400 hover:text-gray-200 hover:bg-gray-800"
      )}
    >
      {children}
    </Link>
  );
}
