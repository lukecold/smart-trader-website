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

  const handleLogout = async () => {
    if (sessionToken) await logoutApi(sessionToken);
    clearAuth();
  };

  return (
    <div className="min-h-screen flex">
      {/* Sidebar — sticky so auth button stays visible regardless of content height */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col sticky top-0 h-screen overflow-y-auto">
        <div className="p-6 border-b border-gray-800">
          <h1 className="text-xl font-bold text-white">Smart Trader</h1>
          <p className="text-xs text-gray-500 mt-1">Trading Dashboard</p>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <NavLink to="/" current={location.pathname === "/"}>
            Dashboard
          </NavLink>
          <NavLink
            to="/strategy/create"
            current={location.pathname === "/strategy/create"}
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
      <main className="flex-1 overflow-auto">
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
}: {
  to: string;
  current: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      to={to}
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
