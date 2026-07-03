import { useEffect, useRef, useState } from "react";
import { loginWithGoogle } from "@/api/auth";
import { useAuthModalStore } from "@/stores/authModal";
import { useAuthStore } from "@/stores/auth";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

export function LoginModal() {
  const { isOpen, close, pendingAction } = useAuthModalStore();
  const { setAuth } = useAuthStore();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState("");
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
    configLoaded,
    buttonRef: googleButtonRef,
    error: googleError,
  } = useGoogleSignIn(isOpen, handleGoogleCredential);

  // Reset transient state when the modal closes.
  useEffect(() => {
    if (!isOpen) {
      setError("");
      setGoogleLoading(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) close();
  };

  // The backend reported it has no Google client ID configured.
  const googleUnavailable = configLoaded && !googleClientId;

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
              Continue with your Google account
            </p>
          </div>
          <button
            onClick={close}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xl leading-none mt-0.5"
          >
            ×
          </button>
        </div>

        {/* Google sign-in */}
        <div className="flex justify-center min-h-[44px] items-center">
          {googleLoading ? (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              Signing in…
            </div>
          ) : googleUnavailable ? (
            <p className="text-sm text-gray-400 text-center">
              Sign-in is temporarily unavailable. Please try again later.
            </p>
          ) : !configLoaded ? (
            <span className="w-4 h-4 border-2 border-gray-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <div ref={googleButtonRef} />
          )}
        </div>

        {(error || googleError) && (
          <p className="text-red-400 text-xs mt-3 text-center">
            {error || googleError}
          </p>
        )}
      </div>
    </div>
  );
}
