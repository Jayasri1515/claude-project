import type { Coordinates } from '../../src/core/domain';
import { aborted, positionUnavailable } from '../../src/core/errors';
import type { AppError } from '../../src/core/errors';
import type { LocationService } from '../../src/core/ports';
import { err } from '../../src/core/result';
import type { Result } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

export type PositionOutcome = Result<Coordinates, AppError>;

/**
 * Controllable approved LocationService. It has no timeout (the watchdog belongs to the Location Flow), so a held
 * call stays pending until the test resolves it or its signal aborts, in which case it settles with `err(aborted())`.
 * Default answer: `position_unavailable`.
 */
export class FakeLocationService implements LocationService {
  readonly positionScript = new ScriptedMethod<[], PositionOutcome>(err(positionUnavailable()), () => err(aborted()));

  getPosition(signal: AbortSignal): Promise<PositionOutcome> {
    return this.positionScript.invoke([], signal);
  }
}
