/**
 * Low-level fetch wrapper for the Optifact API gateway.
 *
 *   Base URL:  VITE_API_GATEWAY_URL
 *   API key:   VITE_API_GATEWAY_KEY  (sent in the `x-api-key` header)
 *
 * Auth flow:
 *   1. POST /register         → create a user
 *   2. POST /login            → returns { token, user_id, email }
 *   3. Subsequent requests carry both `x-api-key` and `Authorization: Bearer <token>`
 *
 * Storage (used by ../db.ts to persist relational tables as JSON files):
 *   POST   /upload-file       (multipart 'file' field)
 *   GET    /list-files
 *   DELETE /delete-file?file_id=...
 *
 * NOTE: The published gateway docs do not include an explicit "download file"
 * endpoint. We assume `GET /download-file?file_id=...` returns the raw file
 * body. If your deployment uses a different path (e.g. `/file`,
 * `/get-file`, `/files/:id`), update DOWNLOAD_FILE_PATH below.
 */

const RAW_BASE_URL = (import.meta.env.VITE_API_GATEWAY_URL as string | undefined)?.replace(
  /\/+$/,
  '',
);
const API_KEY = import.meta.env.VITE_API_GATEWAY_KEY as string | undefined;

if (!RAW_BASE_URL || !API_KEY) {
  // eslint-disable-next-line no-console
  console.warn(
    '[Optifact] Missing VITE_API_GATEWAY_URL or VITE_API_GATEWAY_KEY. ' +
      'Copy `.env.example` to `.env` and fill them in.',
  );
}

export const isApiConfigured = Boolean(RAW_BASE_URL && API_KEY);

const BASE_URL = RAW_BASE_URL ?? 'http://localhost:54321';
const DOWNLOAD_FILE_PATH = '/download-file';

const TOKEN_STORAGE_KEY = 'optifact.api.token';
const USER_STORAGE_KEY = 'optifact.api.user';

export interface ApiUser {
  user_id: string;
  email: string;
}

export interface LoginResponse extends ApiUser {
  token: string;
}

export interface UserProfileResponse extends ApiUser {
  storage_used?: number;
  storage_limit?: number;
  subscription_status?: string;
  subscription_end?: string | null;
  last_login?: string | null;
}

export interface RemoteFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  created_at: string;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

/* ------------------------------- Session state ----------------------------- */

let cachedToken: string | null = readStoredToken();
let cachedUser: ApiUser | null = readStoredUser();
const sessionListeners = new Set<(user: ApiUser | null) => void>();

function readStoredToken(): string | null {
  // NOTE: SPA bearer tokens live in localStorage because the api-gateway does
  // not set HttpOnly cookies. This is XSS-exposed by design — keep the surface
  // small and never log or render the token.
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(TOKEN_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

function readStoredUser(): ApiUser | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ApiUser) : null;
  } catch {
    return null;
  }
}

function persistSession(token: string | null, user: ApiUser | null): void {
  cachedToken = token;
  cachedUser = user;
  try {
    if (typeof localStorage !== 'undefined') {
      if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
      else localStorage.removeItem(TOKEN_STORAGE_KEY);
      if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
      else localStorage.removeItem(USER_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors (e.g. private mode quotas)
  }
  for (const cb of sessionListeners) cb(user);
}

export function getCurrentUser(): ApiUser | null {
  return cachedUser;
}

export function getCurrentToken(): string | null {
  return cachedToken;
}

export function onSessionChange(cb: (user: ApiUser | null) => void): () => void {
  sessionListeners.add(cb);
  return () => sessionListeners.delete(cb);
}

/* --------------------------------- Helpers --------------------------------- */

function authHeaders(includeAuth: boolean): Record<string, string> {
  const headers: Record<string, string> = {};
  if (API_KEY) headers['x-api-key'] = API_KEY;
  if (includeAuth && cachedToken) headers['Authorization'] = `Bearer ${cachedToken}`;
  return headers;
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    const message =
      (typeof data === 'object' && data !== null && 'error' in data
        ? String((data as { error: unknown }).error)
        : typeof data === 'string' && data
          ? data
          : `Request failed with status ${res.status}`) || `HTTP ${res.status}`;
    throw new ApiError(message, res.status);
  }
  return data;
}

async function request<T>(
  method: string,
  path: string,
  init: { body?: unknown; auth?: boolean; isForm?: boolean } = {},
): Promise<T> {
  const { body, auth = true, isForm = false } = init;
  const headers = authHeaders(auth);
  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isForm) {
      payload = body as BodyInit;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }
  const res = await fetch(`${BASE_URL}${path}`, { method, headers, body: payload });
  return (await parseJsonOrThrow(res)) as T;
}

/* ----------------------------------- Auth ---------------------------------- */

export async function register(email: string, password: string): Promise<ApiUser> {
  return request<ApiUser>('POST', '/register', { body: { email, password }, auth: false });
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const data = await request<LoginResponse>('POST', '/login', {
    body: { email, password },
    auth: false,
  });
  persistSession(data.token, { user_id: data.user_id, email: data.email });
  return data;
}

export async function logout(): Promise<void> {
  persistSession(null, null);
}

export async function getUserProfile(): Promise<UserProfileResponse> {
  const data = await request<UserProfileResponse>('GET', '/user');
  // Refresh cached user identity from server (id/email may have been updated).
  if (data?.user_id && data?.email) {
    persistSession(cachedToken, { user_id: data.user_id, email: data.email });
  }
  return data;
}

export async function updateUser(patch: {
  email?: string;
  password?: string;
}): Promise<{ success: boolean }> {
  return request<{ success: boolean }>('POST', '/update-user', { body: patch });
}

/* --------------------------------- Storage --------------------------------- */

export async function listFiles(): Promise<RemoteFile[]> {
  const data = await request<{ files: RemoteFile[] }>('GET', '/list-files');
  return data.files ?? [];
}

export async function uploadFile(
  fileName: string,
  body: Blob | string,
  mimeType = 'application/json',
): Promise<{ file_id: string; file_name: string; file_size: number }> {
  const blob = typeof body === 'string' ? new Blob([body], { type: mimeType }) : body;
  const form = new FormData();
  form.append('file', blob, fileName);
  return request('POST', '/upload-file', { body: form, isForm: true });
}

export async function deleteFile(fileId: string): Promise<void> {
  await request<{ success: boolean }>(
    'DELETE',
    `/delete-file?file_id=${encodeURIComponent(fileId)}`,
  );
}

/**
 * Download a file's raw contents as text. The gateway docs do not formally
 * specify a download endpoint; we use `GET /download-file?file_id=...`.
 * Adjust DOWNLOAD_FILE_PATH at the top of this file if your deployment
 * exposes a different path.
 */
export async function downloadFileText(fileId: string): Promise<string> {
  const res = await fetch(
    `${BASE_URL}${DOWNLOAD_FILE_PATH}?file_id=${encodeURIComponent(fileId)}`,
    { method: 'GET', headers: authHeaders(true) },
  );
  if (!res.ok) {
    throw new ApiError(`Download failed (HTTP ${res.status})`, res.status);
  }
  return res.text();
}
