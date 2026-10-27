/**
 * Weather icon (TASK-035; replaces the placeholder IconSlot). Renders the Lucide SVG for a ConditionCode from the
 * table in `weatherIcons.ts`; an unrecognized code falls back to the neutral UNKNOWN icon.
 *
 * Accessibility (NFR-003, FR-041):
 * - By default the icon is DECORATIVE (`aria-hidden`, not focusable): it is always placed next to the visible
 *   condition text, which carries the meaning, so a screen reader would only repeat it.
 * - When an icon stands alone, pass `label` (text from the message table): the SVG then has `role="img"` and that
 *   accessible name and is not hidden. Nothing in the app needs this today; the contract is covered by tests.
 * The icon uses `currentColor`, so it follows the text colour (and forced-colours mode); colour is never the
 * only carrier of meaning.
 */
import { CONDITION_PRESENTATION } from '../core/conditions';
import { CONDITION_CODES } from '../core/domain';
import type { ConditionCode } from '../core/domain';
import { CONDITION_ICONS } from './weatherIcons';

export interface WeatherIconProps {
  readonly condition: ConditionCode | undefined;
  /** Accessible name for an icon that is NOT next to the condition text. Omit it for a decorative icon. */
  readonly label?: string;
}

function knownCondition(condition: ConditionCode | undefined): ConditionCode {
  return condition !== undefined && (CONDITION_CODES as readonly string[]).includes(condition) ? condition : 'UNKNOWN';
}

export function WeatherIcon({ condition, label }: WeatherIconProps) {
  const code = knownCondition(condition);
  const Icon = CONDITION_ICONS[code];
  const common = { className: 'weather-icon', 'data-icon-key': CONDITION_PRESENTATION[code].iconKey, focusable: false } as const;
  if (label !== undefined && label.trim() !== '') {
    return <Icon {...common} role="img" aria-label={label} />;
  }
  return <Icon {...common} aria-hidden="true" />;
}
