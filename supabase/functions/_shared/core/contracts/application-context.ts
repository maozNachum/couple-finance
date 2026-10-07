/** Public presentation context; no financial behavior or runtime dependencies. */
export interface ApplicationContext {
  readonly locale: 'he-IL';
  readonly direction: 'rtl';
  readonly timeZone: 'Asia/Jerusalem';
}

export const applicationContext: ApplicationContext = Object.freeze({
  locale: 'he-IL',
  direction: 'rtl',
  timeZone: 'Asia/Jerusalem',
});

export function parseApplicationContext(value: unknown): ApplicationContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('Invalid application context');
  }
  const fields = value as Record<string, unknown>;
  if (
    Object.keys(fields).length !== 3 ||
    fields.locale !== 'he-IL' ||
    fields.direction !== 'rtl' ||
    fields.timeZone !== 'Asia/Jerusalem'
  ) {
    throw new TypeError('Invalid application context');
  }
  return applicationContext;
}
