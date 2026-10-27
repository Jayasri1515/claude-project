import type { ConditionCode } from '../core/domain';
import { describeCondition } from '../core/conditions';
import { message } from '../core/messages';
import { WeatherIcon } from './WeatherIcon';

/**
 * Icon plus text, always together (FR-041): the text carries the meaning, so the icon is decorative.
 * A missing condition reads "Unavailable" next to the neutral icon.
 */
export function ConditionView({ condition, text }: { condition: ConditionCode | undefined; text: string | undefined }) {
  const hasText = text !== undefined && text.trim() !== '';
  if (condition === undefined && !hasText) {
    return (
      <span className="condition">
        <WeatherIcon condition="UNKNOWN" />
        <span>{message('ui.unavailable')}</span>
      </span>
    );
  }
  const shown = describeCondition(condition, text);
  return (
    <span className="condition">
      <WeatherIcon condition={shown.condition} />
      <span>{shown.label}</span>
    </span>
  );
}
