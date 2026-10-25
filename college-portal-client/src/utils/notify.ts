import type { AxiosError } from 'axios';
import { toast } from 'sonner';

/**
 * Pulls the server-provided Russian error message out of an axios error and
 * falls back to a generic text. Unknown failures are logged for debugging.
 */
export function extractErrorMessage(error: unknown, fallback = 'Произошла ошибка'): string {
  const data = (error as AxiosError<{ message?: string; error?: string }> | undefined)
    ?.response?.data;
  return data?.message || data?.error || fallback;
}

/** Successful user action feedback. */
export function notifySuccess(message: string): void {
  toast.success(message);
}

/** Failed user action feedback; server message wins over the fallback. */
export function notifyFailure(error: unknown, fallback = 'Произошла ошибка'): void {
  console.error(error);
  toast.error(extractErrorMessage(error, fallback));
}
