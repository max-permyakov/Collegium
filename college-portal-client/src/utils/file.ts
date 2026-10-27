/** Human-readable file size in Russian units (Б / КБ / МБ / ГБ). */
export function formatFileSize(bytes?: number | null): string {
  const size = typeof bytes === 'number' && Number.isFinite(bytes) ? bytes : 0;
  if (size < 1024) return `${size} Б`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} КБ`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} МБ`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} ГБ`;
}

/** Voice / video message duration as mm:ss (with hours when needed). */
export function formatDuration(ms?: number | null): string {
  const totalSeconds = Math.max(0, Math.round((ms ?? 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}
