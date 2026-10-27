import type { CurrentWeather, ForecastDay, Location } from '../../src/core/domain';
import type { AppError } from '../../src/core/errors';
import type { WeatherProvider } from '../../src/core/ports';
import { ok } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

type CurrentResult = Result<CurrentWeather, AppError>;
type ForecastResult = Result<ForecastDay[], AppError>;

/**
 * Controllable WeatherProvider. Defaults: empty current weather and an empty
 * forecast (every field missing). Held calls are not settled by an abort; the
 * test can inspect `call.aborted` and decide.
 */
export class FakeWeatherProvider implements WeatherProvider {
  readonly currentScript = new ScriptedMethod<[Location], CurrentResult>(ok({}));
  readonly forecastScript = new ScriptedMethod<[Location, number, boolean], ForecastResult>(ok([]));

  getCurrent(loc: Location, signal: AbortSignal): Promise<CurrentResult> {
    return this.currentScript.invoke([loc], signal);
  }

  getForecast(loc: Location, days: number, includeToday: boolean, signal: AbortSignal): Promise<ForecastResult> {
    return this.forecastScript.invoke([loc, days, includeToday], signal);
  }
}
