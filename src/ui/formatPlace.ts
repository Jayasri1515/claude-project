/**
 * Display name of a place: name, then region and country only when present
 * (AC-001-2, AC-003-1). All wording comes from the message table.
 */
import type { Location } from '../core/domain';
import { message } from '../core/messages';
import type { MessageId } from '../core/messages';

function present(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed === '' ? undefined : trimmed;
}

export function formatPlace(location: Pick<Location, 'name' | 'admin1' | 'country'>): string {
  const region = present(location.admin1);
  const country = present(location.country);
  const name = location.name;
  let id: MessageId = 'ui.place.name';
  if (region !== undefined && country !== undefined) id = 'ui.place.nameRegionCountry';
  else if (region !== undefined) id = 'ui.place.nameRegion';
  else if (country !== undefined) id = 'ui.place.nameCountry';
  return message(id, {
    name,
    ...(region !== undefined ? { region } : {}),
    ...(country !== undefined ? { country } : {}),
  });
}
