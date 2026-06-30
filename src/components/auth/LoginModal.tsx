import { useEffect, useRef, useState } from "react";
import { requestMagicLink, loginWithGoogle } from "@/api/auth";
import { useAuthModalStore } from "@/stores/authModal";
import { useAuthStore } from "@/stores/auth";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

export function LoginModal() {
  const { isOpen, close, pendingAction } = useAuthModalStore();
  const { setAuth } = useAuthStore();
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"input" | "sent">("input");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // Verify a Google ID token with the backend, then authenticate locally.
  const handleGoogleCredential = async (idToken: string) => {
    setError("");
    setGoogleLoading(true);
    try {
      const { email: googleEmail, sessionToken } = await loginWithGoogle(idToken);
      setAuth(googleEmail, sessionToken);
      pendingAction?.();
      close();
    } catch (err) {
      setError((err as Error).message || "Google sign-in failed. Please try again.");
    } finally {
      setGoogleLoading(false);
    }
  };

  const {
    clientId: googleClientId,
    buttonRef: googleButtonRef,
    error: googleError,
  } = useGoogleSignIn(isOpen && stage === "input", handleGoogleCredential);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen && stage === "input") {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen, stage]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setStage("input");
      setError("");
      setLoading(false);
      setGoogleLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError("");
    try {
      await requestMagicLink(email.trim());
      setStage("sent");
    } catch (err) {
      setError((err as Error).message || "Failed to send link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) close();
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-white font-semibold text-lg">Login required</h2>
            <p className="text-gray-400 text-sm mt-0.5">
              {stage === "input"
                ? googleClientId
                  ? "Continue with Google or get a magic link"
                  : "Enter your email to receive a magic link"
                : "Check your inbox"}
            </p>
          </div>
          <button
            onClick={close}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {stage === "input" ? (
          <>
            {/* Google sign-in — only shown when configured server-side */}
            {googleClientId && (
              <div className="mb-2">
                <div className="flex justify-center min-h-[44px] items-center">
                  {googleLoading ? (
                    <div className="flex items-center gap-2 text-sm text-gray-400">
                      <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      Signing in…
                    </div>
                  ) : (
                    <div ref={googleButtonRef} />
                  )}
                </div>
                {googleError && (
                  <p className="text-red-400 text-xs mt-2 text-center">{googleError}</p>
                )}
                <div className="flex items-center gap-3 my-5">
                  <div className="h-px flex-1 bg-gray-800" />
                  <span className="text-xs text-gray-600">or</span>
                  <div className="h-px flex-1 bg-gray-800" />
                </div>
              </div>
            )}
            <form onSubmit={handleSend} className="space-y-4">
            <input
              ref={inputRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-3 text-white text-sm outline-none focus:border-blue-500 transition-colors placeholder-gray-600"
            />
            {error && (
              <p className="text-red-400 text-xs">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading || googleLoading || !email.trim()}
              className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-colors text-sm"
            >
              {loading ? "Sending…" : "Send magic link"}
            </button>
            </form>
          </>
        ) : (
          <div className="text-center space-y-4">
            <div className="text-5xl">✉️</div>
            <p className="text-gray-300 text-sm">
              Magic link sent to <span className="text-white font-medium">{email}</span>
            </p>
            <p className="text-gray-500 text-xs">
              Click the link in your email to log in. It expires in 15 minutes.
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => {
                  setStage("input");
                  setError("");
                }}
                className="flex-1 py-2 text-sm text-gray-400 hover:text-gray-200 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors"
              >
                Wrong email?
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 py-2 text-sm text-blue-400 hover:text-blue-300 border border-blue-500/30 rounded-lg hover:border-blue-500/50 disabled:opacity-50 transition-colors"
              >
                {loading ? "Sending…" : "Resend"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
