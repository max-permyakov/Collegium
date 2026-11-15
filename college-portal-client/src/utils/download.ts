import type { AxiosResponse } from 'axios';

/**
 * Saves a blob response using the server-provided file name when available.
 * The API exposes `Content-Disposition` for protected reward downloads.
 */
export function saveBlobResponse(response: AxiosResponse<Blob>, fallbackName: string): void {
  const disposition = String(response.headers['content-disposition'] ?? '');
  const match = /filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i.exec(disposition);
  const encodedName = match?.[1] ?? match?.[2];
  const fileName = encodedName ? decodeURIComponent(encodedName) : fallbackName;

  const url = URL.createObjectURL(response.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}
