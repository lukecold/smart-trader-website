import { useEffect, useRef, useState } from "react";
import { fetchAuthConfig } from "@/api/auth";

const GSI_SRC = "https://accounts.google.com/gsi/client";

// Loads the Google Identity Services script exactly once and resolves when its
// global is available. Concurrent callers share the same in-flight <script>.
function loadGsiScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GSI_SRC}"]`
    );
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("failed to load Google script"))
      );
      return;
    }
    const s = document.createElement("script");
    s.src = GSI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("failed to load Google script"));
    document.head.appendChild(s);
  });
}

/**
 * Renders a "Continue with Google" button into `buttonRef` when `enabled` and a
 * Google client ID is configured server-side. On a successful sign-in the GIS
 * library invokes `onCredential` with a Google ID token (JWT) to verify on the
 * backend.
 *
 * Returns `clientId` (null until config loads / when Google sign-in is off) so
 * callers can conditionally render the surrounding UI.
 */
export function useGoogleSignIn(
  enabled: boolean,
  onCredential: (idToken: string) => void
) {
  const [clientId, setClientId] = useState<string | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buttonRef = useRef<HTMLDivElement>(null);

  // Keep the latest callback without re-running the render effect.
  const onCredRef = useRef(onCredential);
  onCredRef.current = onCredential;

  // Load the public auth config once to discover the client ID. `configLoaded`
  // lets callers distinguish "still fetching" from "Google not configured".
  useEffect(() => {
    let cancelled = false;
    fetchAuthConfig()
      .then((c) => {
        if (!cancelled) setClientId(c.googleClientId || null);
      })
      .catch(() => {
        if (!cancelled) setClientId(null);
      })
      .finally(() => {
        if (!cancelled) setConfigLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Initialize GIS and render the button once enabled + client ID is known.
  useEffect(() => {
    if (!enabled || !clientId) return;
    let cancelled = false;
    setError(null); // clear any stale error from a previous (failed) attempt
    loadGsiScript()
      .then(() => {
        if (cancelled || !buttonRef.current) return;
        const g = window.google;
        if (!g?.accounts?.id) {
          setError("Could not load Google sign-in.");
          return;
        }
        g.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => {
            if (resp.credential) onCredRef.current(resp.credential);
          },
          cancel_on_tap_outside: true,
        });
        buttonRef.current.innerHTML = "";
        g.accounts.id.renderButton(buttonRef.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          text: "continue_with",
          shape: "pill",
          logo_alignment: "center",
          width: 280,
        });
      })
      .catch(() => {
        if (!cancelled) setError("Could not load Google sign-in.");
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, clientId]);

  return { clientId, configLoaded, buttonRef, error };
}
