const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:5000/api";

export async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message = typeof payload === "string" ? payload : payload.message;
    const error = new Error(message || "Request failed");
    Object.assign(error, typeof payload === "object" ? payload : { message });
    error.status = response.status;
    throw error;
  }

  return payload;
}

export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
