import { auth } from "./firebase";
import { onAuthStateChanged, User } from "firebase/auth";

async function waitForUser(timeoutMs = 5000): Promise<User | null> {
  if (!auth) return null;
  if (auth.currentUser) return auth.currentUser;
  const firebaseAuth = auth;

  return await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, timeoutMs);

    const unsubscribe = onAuthStateChanged(firebaseAuth, (user) => {
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    });
  });
}

export async function getFirebaseAuthHeader(
  options: { requireUser?: boolean; forceRefresh?: boolean } = {}
): Promise<Record<string, string>> {
  const { requireUser = true, forceRefresh = false } = options;
  const user = await waitForUser();

  if (!user) {
    if (requireUser) {
      // Se estamos no browser e o usuário é obrigatório mas não foi encontrado
      if (typeof window !== 'undefined' && window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
      throw new Error("AUTH_REQUIRED");
    }
    return {};
  }

  const token = await user.getIdToken(forceRefresh);
  return { Authorization: `Bearer ${token}` };
}

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const authHeaders = await getFirebaseAuthHeader();
  const firstHeaders = new Headers(init.headers || {});
  Object.entries(authHeaders).forEach(([key, value]) => firstHeaders.set(key, value));

  const firstResponse = await fetch(input, { ...init, headers: firstHeaders });
  if (firstResponse.status !== 401) return firstResponse;

  const refreshedAuthHeaders = await getFirebaseAuthHeader({ forceRefresh: true });
  const retryHeaders = new Headers(init.headers || {});
  Object.entries(refreshedAuthHeaders).forEach(([key, value]) => retryHeaders.set(key, value));

  return fetch(input, { ...init, headers: retryHeaders });
}
export async function logout() {
  if (!auth) return;
  try {
    await auth.signOut();
    window.location.href = "/login";
  } catch (error) {
    console.error("Erro ao deslogar:", error);
  }
}
