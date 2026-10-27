import { locationUnavailable } from '../../src/core/errors';
import { ABORTED } from '../../src/core/ports';
import type { LocationService, PermissionState, PositionResult } from '../../src/core/ports';
import { err } from '../../src/core/result';
import { ScriptedMethod } from './scripted';

/**
 * Controllable LocationService. A held getCurrentPosition call settles with
 * ABORTED when its signal aborts, as the port contract requires.
 */
export class FakeLocationService implements LocationService {
  permission: PermissionState;
  permissionCalls = 0;
  readonly positionScript = new ScriptedMethod<[number], PositionResult>(
    err(locationUnavailable()),
    () => ABORTED,
  );

  constructor(permission: PermissionState = 'prompt') {
    this.permission = permission;
  }

  getPermissionState(): Promise<PermissionState> {
    this.permissionCalls += 1;
    return Promise.resolve(this.permission);
  }

  getCurrentPosition(timeoutMs: number, signal: AbortSignal): Promise<PositionResult> {
    return this.positionScript.invoke([timeoutMs], signal);
  }
}
