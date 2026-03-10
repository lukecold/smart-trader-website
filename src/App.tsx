import { Routes, Route, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Dashboard } from "@/routes/index";
import { StrategyDetail } from "@/routes/strategy/[id]";
import { CreateStrategy } from "@/routes/strategy/create";
import { VerifyAuth } from "@/routes/auth/verify";

export default function App() {
  return (
    <Routes>
      {/* Magic-link verification — full-page, no sidebar */}
      <Route path="/auth/verify" element={<VerifyAuth />} />

      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/strategy/create" element={<CreateStrategy />} />
        <Route path="/strategy/:id" element={<StrategyDetail />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
