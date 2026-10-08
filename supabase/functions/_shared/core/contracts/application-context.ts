import { z } from 'zod';
import { householdTimeZone } from './financial-date.ts';

/** Same canonical validation strategy as the financial contracts. */
export const applicationContextSchema = z.strictObject({
  locale: z.literal('he-IL'), direction: z.literal('rtl'), timeZone: z.literal(householdTimeZone),
}).readonly();
export type ApplicationContext = z.infer<typeof applicationContextSchema>;

export const applicationContext: ApplicationContext = Object.freeze({
  locale: 'he-IL',
  direction: 'rtl',
  timeZone: 'Asia/Jerusalem',
});

export function parseApplicationContext(value: unknown): ApplicationContext {
  // Preserve Task 1's public TypeError behavior; schema diagnostics stay private.
  if (!applicationContextSchema.safeParse(value).success) throw new TypeError('Invalid application context');
  return applicationContext;
}
