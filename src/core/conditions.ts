/**
 * Condition-to-icon/label table (C10, architecture 4.10; FR-015, FR-022, FR-041).
 *
 * Maps the provider-independent ConditionCode to an icon key and a label
 * message ID. The provider-code-to-ConditionCode table lives in each provider
 * adapter, not here. The icon assets are Lucide icons, mapped in src/ui/weatherIcons.ts (TASK-035).
 */
import { CONDITION_CODES } from './domain';
import type { ConditionCode } from './domain';
import { message } from './messages';
import type { MessageId } from './messages';

export type IconKey =
  | 'clear'
  | 'partly-cloudy'
  | 'cloudy'
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
  RAIN: { iconKey: 'rain', labelId: 'condition.rain' },
  SNOW: { iconKey: 'snow', labelId: 'condition.snow' },
  THUNDERSTORM: { iconKey: 'thunderstorm', labelId: 'condition.thunderstorm' },
  FOG: { iconKey: 'fog', labelId: 'condition.fog' },
  UNKNOWN: { iconKey: 'unknown', labelId: 'condition.unknown' },
};

export interface ConditionDisplay {
  /** The ConditionCode actually used (UNKNOWN for missing or unrecognized input). */
  readonly condition: ConditionCode;
  readonly iconKey: IconKey;
  /** Always non-empty. Shown together with the icon (FR-041). */
  readonly label: string;
}

function isConditionCode(value: unknown): value is ConditionCode {
  return typeof value === 'string' && (CONDITION_CODES as readonly string[]).includes(value);
}

/**
 * Presentation for a condition. A missing or unrecognized code becomes UNKNOWN
 * with the neutral icon. For UNKNOWN only, non-blank provider text is used as
 * the label; known conditions always use the table label.
 */
export function describeCondition(code: ConditionCode | undefined, providerText?: string): ConditionDisplay {
  const condition: ConditionCode = isConditionCode(code) ? code : 'UNKNOWN';
  const entry = CONDITION_PRESENTATION[condition];
  const fallbackText = providerText?.trim();
  const label =
    condition === 'UNKNOWN' && fallbackText !== undefined && fallbackText !== ''
      ? fallbackText
      : message(entry.labelId);
  return { condition, iconKey: entry.iconKey, label };
}
