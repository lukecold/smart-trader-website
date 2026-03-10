import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { verifyMagicToken } from "@/api/auth";
import { useAuthStore } from "@/stores/auth";
import { useAuthModalStore } from "@/stores/authModal";

export function VerifyAuth() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setAuth } = useAuthStore();
  const { pendingAction, close } = useAuthModalStore();

  const [status, setStatus] = useState<"loading" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");
    if (!token) {
      setErrorMsg("No token provided.");
      setStatus("error");
      return;
    }

    verifyMagicToken(token)
      .then(({ email, sessionToken }) => {
        setAuth(email, sessionToken);
        // Execute any action that triggered the login flow
        if (pendingAction) {
          pendingAction();
          close();
        }
        navigate("/", { replace: true });
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setStatus("error");
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Verifying your login link…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-8 max-w-sm w-full text-center">
        <div className="text-red-400 text-4xl mb-4">✗</div>
        <h2 className="text-white font-semibold text-lg mb-2">Link invalid or expired</h2>
        <p className="text-gray-400 text-sm mb-6">{errorMsg}</p>
        <button
          onClick={() => navigate("/", { replace: true })}
          className="text-sm px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
