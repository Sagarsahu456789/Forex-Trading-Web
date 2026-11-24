export async function apiRequest<T>(
  url: string,
  options: {
    method?: string;
    token?: string | null;
    body?: unknown;
    isFormData?: boolean;
  } = {}
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (!options.isFormData && options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(url, {
    method: options.method ?? 'GET',
    headers,
    body: options.isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });

  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    if (contentType.includes('application/json')) {
      const errData = (await response.json()) as { error?: string };
      throw new Error(errData.error || `Request failed (${response.status})`);
    }
    throw new Error(`Request failed (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function downloadProtectedFile(url: string, token: string, fallbackName: string): Promise<void> {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    let msg = 'Unable to download file';
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) msg = data.error;
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  const disposition = response.headers.get('content-disposition');
  const match = disposition?.match(/filename="?([^"]+)"?/);
  link.download = match ? match[1] : fallbackName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(objectUrl);
}
