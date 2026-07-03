const BASE_URL = "/api/v1";

export interface VerifyResponse {
  email: string;
  sessionToken: string;
}

export interface AuthConfig {
  /** Google OAuth client ID, or "" when Google sign-in is not configured. */
  googleClientId: string;
}

/** Fetches public auth configuration (e.g. whether Google sign-in is enabled). */
export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    const res = await fetch(`${BASE_URL}/auth/config`);
    const json = await res.json();
    return { googleClientId: (json?.data?.google_client_id as string) ?? "" };
  } catch {
    return { googleClientId: "" };
  }
}

/** Exchanges a Google ID token (from Google Identity Services) for a session. */
export async function loginWithGoogle(idToken: string): Promise<VerifyResponse> {
  const res = await fetch(`${BASE_URL}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id_token: idToken }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.code !== 0) {
    throw new Error((json as { msg?: string }).msg ?? "Google sign-in failed");
  }
  return {
    email: json.data.email as string,
    sessionToken: json.data.session_token as string,
  };
}

export async function logoutApi(sessionToken: string): Promise<void> {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sessionToken}` },
  }).catch(() => {/* best-effort */});
}
