const API_BASE = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(message: string, public readonly status: number, public readonly code?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiRequestOptions extends RequestInit { timeoutMs?: number }

export interface UploadProgress {
  loaded: number;
  total: number | null;
  phase: 'uploading' | 'processing';
}

interface ApiUploadOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  onProgress?: (progress: UploadProgress) => void;
}

/** XHR exposes actual upload progress, including slow mobile connections. */
export function apiUpload<T>(path: string, body: FormData, { signal, timeoutMs = 300_000, onProgress }: ApiUploadOptions = {}): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError('요청을 취소했습니다.', 0, 'REQUEST_ABORTED'));
      return;
    }
    const xhr = new XMLHttpRequest();
    let settled = false;
    const cleanup = () => {
      signal?.removeEventListener('abort', cancel);
      xhr.onload = xhr.onerror = xhr.ontimeout = xhr.onabort = null;
      xhr.upload.onprogress = xhr.upload.onload = null;
    };
    const fail = (error: ApiError) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const succeed = (value: T) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(value);
    };
    const cancel = () => {
      fail(new ApiError('요청을 취소했습니다.', 0, 'REQUEST_ABORTED'));
      xhr.abort();
    };
    xhr.upload.onprogress = event => {
      onProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : null, phase: 'uploading' });
    };
    xhr.upload.onload = event => {
      onProgress?.({ loaded: event.loaded, total: event.lengthComputable ? event.total : null, phase: 'processing' });
    };
    xhr.onload = () => {
      if (xhr.status === 204) { succeed(undefined as T); return; }
      let payload: unknown = null;
      try { payload = JSON.parse(xhr.responseText); } catch { /* The API or proxy may return a non-JSON error. */ }
      if (xhr.status < 200 || xhr.status >= 300) {
        const error = payload as { error?: { message?: string; code?: string } } | null;
        fail(new ApiError(error?.error?.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', xhr.status, error?.error?.code));
      } else if (payload === null) {
        fail(new ApiError('서버 응답을 확인할 수 없습니다.', xhr.status));
      } else {
        succeed((payload as { data: T }).data);
      }
    };
    xhr.onerror = () => fail(new ApiError('서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.', 0));
    xhr.ontimeout = () => fail(new ApiError('사진 전송 또는 접수 확인 시간이 초과되었어요. 연결 상태를 확인하고 다시 시도해 주세요.', 0, 'REQUEST_TIMEOUT'));
    xhr.onabort = () => fail(new ApiError('요청을 취소했습니다.', 0, 'REQUEST_ABORTED'));
    try {
      xhr.open('POST', `${API_BASE}${path}`);
      xhr.withCredentials = true;
      xhr.timeout = timeoutMs;
      // The browser supplies the multipart boundary; do not set Content-Type manually.
      signal?.addEventListener('abort', cancel, { once: true });
      xhr.send(body);
    } catch {
      fail(new ApiError('서버에 연결할 수 없습니다. 네트워크 연결을 확인하고 다시 시도해 주세요.', 0));
    }
  });
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { signal, timeoutMs = 12_000, ...requestOptions } = options;
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener('abort', cancel, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const headers = new Headers(requestOptions.headers);
    if (requestOptions.body instanceof FormData) headers.delete('Content-Type');
    else if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${API_BASE}${path}`, {
      ...requestOptions,
      headers,
      credentials: 'include',
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const payload: unknown = await response.json().catch(error => {
      if (controller.signal.aborted) throw error;
      return null;
    });
    if (!response.ok) {
      const error = payload as { error?: { message?: string; code?: string } } | null;
      throw new ApiError(error?.error?.message || '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.', response.status, error?.error?.code);
    }
    if (payload === null) throw new ApiError('서버 응답을 확인할 수 없습니다.', response.status);
    return (payload as { data: T }).data;
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(timedOut ? '요청 시간이 초과되었어요. 다시 시도해 주세요.' : '요청을 취소했습니다.', 0, timedOut ? 'REQUEST_TIMEOUT' : 'REQUEST_ABORTED');
    }
    if (error instanceof ApiError) throw error;
    throw new ApiError('서버에 연결할 수 없습니다. 백엔드 실행 상태를 확인하고 다시 시도해 주세요.', 0);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener('abort', cancel);
  }
}
