//#region src/lib/locale.d.ts
type LocaleLabelKey = 'ariaTask' | 'ariaMilestone' | 'addSubtaskTitle' | 'expandAllTitle' | 'collapseAllTitle' | 'columnTaskName' | 'columnStartDate' | 'columnEndDate' | 'columnDuration' | 'columnQuarter';
type ChartLocale = {
  code: string;
  labels?: Partial<Record<LocaleLabelKey, string>>;
  weekStartsOn?: 0 | 1 | 6;
  weekNumbering?: 'iso' | 'us' | 'simple';
  weekendDays?: number[];
};
declare const EN_US_LABELS: Record<LocaleLabelKey, string>;
/**
 * Derives the first day of week (0=Sun, 1=Mon, 6=Sat) from a BCP 47 code.
 * Uses `Intl.Locale.getWeekInfo()` where available (Chromium, Safari 15.4+),
 * with a CLDR-based fallback table for Firefox and older runtimes.
 *
 * @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
 * @returns The first day of the week: `0` (Sunday), `1` (Monday), or `6` (Saturday).
 */
declare function deriveWeekStartsOn(code: string): 0 | 1 | 6;
/**
 * Derives the week numbering scheme from a BCP 47 code.
 * Europe and ISO-aligned regions default to `'iso'`; Americas and others to `'us'`.
 *
 * @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
 * @returns The week numbering scheme: `'iso'`, `'us'`, or `'simple'`.
 */
declare function deriveWeekNumbering(code: string): 'iso' | 'us' | 'simple';
/**
 * Derives weekend days (0=Sun … 6=Sat) from a BCP 47 code.
 * Uses `Intl.Locale.getWeekInfo()` where available, with a CLDR-based fallback table.
 *
 * @param code - A BCP 47 language tag (e.g. `'en-US'`, `'de-DE'`).
 * @returns An array of weekend day indices (sorted ascending).
 */
declare function deriveWeekendDays(code: string): number[];
/**
 * Resolves a {@link ChartLocale} from either a full `ChartLocale` object or a BCP 47 string.
 * When given a string, derives `weekStartsOn`, `weekNumbering`, and `weekendDays` from CLDR conventions.
 *
 * @param raw - A {@link ChartLocale} object, a BCP 47 language tag string, or `undefined`.
 * @returns A fully resolved {@link ChartLocale} with defaults applied.
 */
declare function resolveChartLocale(raw: ChartLocale | string | undefined): ChartLocale;
/**
 * Formats a week number according to the specified scheme.
 *
 * - `'iso'`: ISO 8601 (week 1 contains the first Thursday; Monday start).
 * - `'us'`: Week 1 contains January 1; Sunday start.
 * - `'simple'`: `Math.ceil(dayOfYear / 7)`.
 *
 * @param date - The date to compute the week number for.
 * @param scheme - The week numbering scheme: `'iso'`, `'us'`, or `'simple'`.
 * @returns The week number as a positive integer.
 */
declare function formatWeekNumber(date: Date, scheme: 'iso' | 'us' | 'simple'): number;
/**
 * Formats a label template by replacing `{0}` with the given argument.
 *
 * @param template - The template string containing `{0}` as placeholder.
 * @param arg - The value to substitute for `{0}`.
 * @returns The formatted string with the placeholder replaced.
 */
declare function formatLabel(template: string, arg: string): string;
//#endregion
export { deriveWeekStartsOn as a, formatWeekNumber as c, deriveWeekNumbering as i, resolveChartLocale as l, EN_US_LABELS as n, deriveWeekendDays as o, LocaleLabelKey as r, formatLabel as s, ChartLocale as t };
//# sourceMappingURL=locale-3A5xWe8q.d.mts.map