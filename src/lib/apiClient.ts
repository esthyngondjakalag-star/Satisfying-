export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    token: string;
    orgId?: number | null;
  }
): Promise<T> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${options.token}`,
  };
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (options.orgId) {
    headers['x-org-id'] = String(options.orgId);
  }

  const res = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Erreur serveur (${res.status})`);
  }
  return data as T;
}
