/**
 * Condition-to-icon/label table (C10, architecture 4.10; FR-015, FR-022, FR-041; architecture Section 7 item 8,
 * message-wording.md M-44).
 *
 * Maps the provider-independent ConditionCode to an icon key and a label
 * message ID. The provider-code-to-ConditionCode table lives in each provider
 * adapter, not here. The icon assets are Lucide icons, mapped in src/ui/weatherIcons.ts (TASK-035).
 *
 * Day/night (item 8): only CLEAR and PARTLY_CLOUDY have a night variant, and only in the CURRENT-weather card,
 * driven by `isDay`. Clear reads "Sunny" by day and "Clear" at night; when the provider gives no `isDay` the text is
 * the neutral "Clear" (never "Sunny") and the icon stays the day variant. Forecast days always use the day variant
 * and "Sunny".
 */
import { CONDITION_CODES } from './domain';
import type { ConditionCode } from './domain';
import { message } from './messages';
import type { MessageId } from './messages';

export type IconKey =
  | 'clear'
  | 'clear-night'
  | 'partly-cloudy'
  | 'partly-cloudy-night'
  | 'cloudy'
  | 'drizzle'
  | 'rain'
  | 'snow'
  | 'thunderstorm'
  | 'fog'
  | 'unknown';

export interface ConditionPresentation {
  readonly iconKey: IconKey;
  readonly labelId: MessageId;
}

export const CONDITION_PRESENTATION: Readonly<Record<ConditionCode, ConditionPresentation>> = {
  CLEAR: { iconKey: 'clear', labelId: 'condition.clear' },
  PARTLY_CLOUDY: { iconKey: 'partly-cloudy', labelId: 'condition.partlyCloudy' },
  CLOUDY: { iconKey: 'cloudy', labelId: 'condition.cloudy' },
  DRIZZLE: { iconKey: 'drizzle', labelId: 'condition.drizzle' },
  RAIN: { iconKey: 'rain', labelId: 'condition.rain' },
  SNOW: { iconKey: 'snow', labelId: 'condition.snow' },
  THUNDERSTORM: { iconKey: 'thunderstorm', labelId: 'condition.thunderstorm' },
  FOG: { iconKey: 'fog', labelId: 'condition.fog' },
  UNKNOWN: { iconKey: 'unknown', labelId: 'condition.unknown' },
};

/** The only conditions with a night variant, and its icon key. */
export const NIGHT_ICON_KEYS: Readonly<Partial<Record<ConditionCode, IconKey>>> = {
  CLEAR: 'clear-night',
  PARTLY_CLOUDY: 'partly-cloudy-night',
};

/** Where a condition is shown: the current-weather card uses `isDay`; forecast days always use the day form. */
export interface ConditionContext {
  readonly surface?: 'current' | 'forecast';
  /** True by day, false by night, undefined when the provider does not say. Ignored on the forecast surface. */
  readonly isDay?: boolean;
}

export interface ConditionDisplay {
  /** The ConditionCode actually used (UNKNOWN for missing or unrecognized input). */
  readonly condition: ConditionCode;
  readonly iconKey: IconKey;
  /** True when the night icon variant is used. */
  readonly night: boolean;
  /** Always non-empty. Shown together with the icon (FR-041). */
  readonly label: string;
}

function isConditionCode(value: unknown): value is ConditionCode {
  return typeof value === 'string' && (CONDITION_CODES as readonly string[]).includes(value);
}

/**
 * Presentation for a condition. A missing or unrecognized code becomes UNKNOWN
 * with the neutral icon. For UNKNOWN only, non-blank provider text is used as
 * the label; known conditions always use the table label. Day/night: see the file comment.
 */
export function describeCondition(
  code: ConditionCode | undefined,
  providerText?: string,
  context: ConditionContext = {},
): ConditionDisplay {
  const condition: ConditionCode = isConditionCode(code) ? code : 'UNKNOWN';
  const entry = CONDITION_PRESENTATION[condition];
  const surface = context.surface ?? 'current';
  const night = surface === 'current' && context.isDay === false && NIGHT_ICON_KEYS[condition] !== undefined;
  const iconKey = night ? (NIGHT_ICON_KEYS[condition] ?? entry.iconKey) : entry.iconKey;
  const sunny = condition === 'CLEAR' && (surface === 'forecast' || context.isDay === true);
  const fallbackText = providerText?.trim();
  const label =
    condition === 'UNKNOWN' && fallbackText !== undefined && fallbackText !== ''
      ? fallbackText
      : message(sunny ? 'condition.sunny' : entry.labelId);
  return { condition, iconKey, night, label };
}
