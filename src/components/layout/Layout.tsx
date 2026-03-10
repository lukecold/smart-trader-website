import { Outlet, Link, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

export function Layout() {
  const location = useLocation();

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-900 border-r border-gray-800 flex flex-col">
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
        <div className="p-4 border-t border-gray-800 text-xs text-gray-600">
          v0.1.0
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="max-w-7xl mx-auto p-6">
          <Outlet />
        </div>
      </main>
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
