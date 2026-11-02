import type { Coordinates, WeatherResult } from '../../src/core/domain';
import { aborted } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import type { WeatherProvider } from '../../src/core/ports';
import { err, ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

export type WeatherGetResult = Result<WeatherResult, AppError>;

/**
 * Controllable approved WeatherProvider. Default answer: both sections present but empty (every field missing).
 * Latency, failure, hold/resolve and abort are controlled through `getScript` (see ScriptedMethod): a call whose signal
 * aborts settles with `err(aborted())`, as the port contract requires.
 */
export class FakeWeatherProvider implements WeatherProvider {
  readonly getScript = new ScriptedMethod<[Coordinates], WeatherGetResult>(
    ok({ current: ok({}), forecast: ok([]) }),
    () => err(aborted()),
  );

  get(coords: Coordinates, signal: AbortSignal): Promise<WeatherGetResult> {
    return this.getScript.invoke([coords], signal);
  }
}
