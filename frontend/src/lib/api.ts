// Centralized API configuration for SHARECOM.
// Use NEXT_PUBLIC_API_BASE_URL in frontend code and BACKEND_API_BASE_URL for server routes.
// Example (mobile/device access): http://192.168.1.10:8000

const FALLBACK_CLIENT_API_BASE_URL = "http://localhost:8000";
const FALLBACK_SERVER_API_BASE_URL = "http://127.0.0.1:8000";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL;

if (!API_BASE_URL && process.env.NODE_ENV === "production") {
  throw new Error("NEXT_PUBLIC_API_BASE_URL is missing in production environment");
}

export const SERVER_API_BASE_URL =
  process.env.BACKEND_API_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL;

export const getApiUrl = (path: string) => {
  const base = (API_BASE_URL || FALLBACK_CLIENT_API_BASE_URL).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

export const getServerApiUrl = (path: string) => {
  const base = (SERVER_API_BASE_URL || FALLBACK_SERVER_API_BASE_URL).replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${cleanPath}`;
};

export const getUploadUrl = (filename: string) => {
  return `${API_BASE_URL}/uploads/${filename}`;
};
