/**
 * Temperature unit toggle (TASK-033; FR-016, FR-017, AC-003-3, ODD-2).
 * Native radio buttons, so arrow keys and Space work with no extra code.
 */
import { message } from '../core/messages';
import type { MessageId } from '../core/messages';
import type { TemperatureUnit } from '../core/domain';
import { useUi, useViewState } from './context';

const UNITS: ReadonlyArray<{ unit: TemperatureUnit; labelId: MessageId }> = [
  { unit: 'C', labelId: 'ui.unit.celsius' },
  { unit: 'F', labelId: 'ui.unit.fahrenheit' },
];

export function UnitToggle() {
  const { controller } = useUi();
  const { temperatureUnit } = useViewState();
  return (
    <fieldset className="unit-toggle">
      <legend>{message('ui.unit.legend')}</legend>
      {UNITS.map(({ unit, labelId }) => (
        <label key={unit}>
          <input
            type="radio"
            name="temperature-unit"
            value={unit}
            checked={temperatureUnit === unit}
            onChange={() => void controller.setTemperatureUnit(unit)}
          />
          <span>{message(labelId)}</span>
        </label>
      ))}
    </fieldset>
  );
}
