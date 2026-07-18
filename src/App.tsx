import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/routes/index";
import { Leaderboard } from "@/routes/leaderboard";
import { RedactedStrategyView } from "@/routes/view/[id]";
import { StrategyDetail } from "@/routes/strategy/[id]";
import { CreateStrategy } from "@/routes/strategy/create";
import { useAuthStore } from "@/stores/auth";

// Home: logged-in users land on the Dashboard, logged-out users on the
// Leaderboard. Auth state rehydrates synchronously from localStorage, so
// refreshing "/" stays on whichever page applies — all other routes have no
// load-time redirects and keep the current page on refresh as-is.
function Home() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return isAuthenticated ? (
    <Dashboard />
  ) : (
    <Navigate to="/leaderboard" replace />
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/view/:id" element={<RedactedStrategyView />} />
        <Route path="/strategy/create" element={<CreateStrategy />} />
        <Route path="/strategy/:id" element={<StrategyDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
