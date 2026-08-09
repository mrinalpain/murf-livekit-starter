/**
 * Retrieve or generate a stable anonymous caller ID stored in localStorage.
 * Format: caller_<random_hex>
 */
export function getOrCreateCallerId(): string {
  if (typeof window === 'undefined') {
    return 'caller_default';
  }

  const STORAGE_KEY = 'swasthya_sathi_caller_id';
  let callerId = localStorage.getItem(STORAGE_KEY);

  if (!callerId) {
    const randomBytes = Math.random().toString(36).substring(2, 10);
    callerId = `caller_${randomBytes}`;
    localStorage.setItem(STORAGE_KEY, callerId);
  }

  return callerId;
}
