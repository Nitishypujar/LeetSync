/** Return an official store URL only when it targets the expected HTTPS host. */
export function approvedStoreUrl(value, hostname) {
  if (!value) return '';

  try {
    const url = new globalThis.URL(value);
    if (
      url.protocol !== 'https:' ||
      url.hostname !== hostname ||
      url.username ||
      url.password
    ) {
      return '';
    }

    return url.href;
  } catch {
    return '';
  }
}
