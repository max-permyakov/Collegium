/**
 * Referral codes arrive on a public `/r/:code` link before the visitor has a
 * session. The code is kept in localStorage and claimed once the visitor signs
 * in or finishes registration.
 */
export const REFERRAL_STORAGE_KEY = 'collegium:referral-code';

const CODE_PATTERN = /^[a-z0-9]{1,16}$/i;

export function normalizeReferralCode(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim().toLowerCase();
  return CODE_PATTERN.test(value) ? value : null;
}

export function storeReferralCode(code: string): string | null {
  const normalized = normalizeReferralCode(code);
  if (!normalized) return null;
  localStorage.setItem(REFERRAL_STORAGE_KEY, normalized);
  return normalized;
}

export function readReferralCode(): string | null {
  return normalizeReferralCode(localStorage.getItem(REFERRAL_STORAGE_KEY));
}

export function clearReferralCode(): void {
  localStorage.removeItem(REFERRAL_STORAGE_KEY);
}
