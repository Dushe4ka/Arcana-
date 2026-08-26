export class ApiError extends Error {
  status: number;
  issues?: { path: string; message: string }[];

  constructor(status: number, message: string, issues?: { path: string; message: string }[]) {
    super(message);
    this.status = status;
    this.issues = issues;
  }
}

const DEFAULT_BASE_URL = "http://localhost:4000/api";

export function getApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_URL;
  return (configured || DEFAULT_BASE_URL).replace(/\/$/, "");
}

type TokenGetter = () => string | null;
type UnauthorizedHandler = () => Promise<string | null>;

// The auth store wires itself in here at module load (see auth-store.ts) so this module
// never has to import the store directly and create a circular dependency.
let getAccessToken: TokenGetter = () => null;
let handleUnauthorized: UnauthorizedHandler = async () => null;

export function configureApi(opts: {
  getAccessToken: TokenGetter;
  onUnauthorized: UnauthorizedHandler;
}): void {
  getAccessToken = opts.getAccessToken;
  handleUnauthorized = opts.onUnauthorized;
}

type RequestOptions = RequestInit & { auth?: boolean };

async function rawRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const { auth = true, headers, ...rest } = options;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...((headers as Record<string, string>) ?? {}),
  };
  if (auth) {
    const token = getAccessToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, { ...rest, headers: finalHeaders });
  } catch {
    throw new ApiError(0, "Не удалось подключиться к серверу. Проверьте адрес сервера в настройках.");
  }

  if (response.status === 204) return undefined as T;

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.message ?? `Ошибка сервера (${response.status})`,
      body?.issues,
    );
  }
  return body as T;
}

/** All API calls should go through this - it retries exactly once after a 401 by asking the
 * auth store to refresh the access token, so a component never has to think about token
 * expiry itself. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(path, options);
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && options.auth !== false) {
      const refreshedToken = await handleUnauthorized();
      if (refreshedToken) {
        return await rawRequest<T>(path, options);
      }
    }
    throw err;
  }
}
