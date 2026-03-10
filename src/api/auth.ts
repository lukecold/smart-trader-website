const BASE_URL = "/api/v1";

export async function requestMagicLink(email: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/auth/request-link`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error((json as { msg?: string }).msg ?? `HTTP ${res.status}`);
  }
}

export interface VerifyResponse {
  email: string;
  sessionToken: string;
}

export async function verifyMagicToken(token: string): Promise<VerifyResponse> {
  const res = await fetch(`${BASE_URL}/auth/verify?token=${encodeURIComponent(token)}`);
  const json = await res.json();
  if (!res.ok || json.code !== 0) {
    throw new Error((json as { msg?: string }).msg ?? "Verification failed");
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
