/**
 * The one table that maps every ConditionCode to a Lucide icon (TASK-035; FR-015, FR-022, FR-041).
 *
 * Icons: Lucide (https://lucide.dev), package `lucide-react`, ISC licence (the licence text, which also carries
 * the MIT notice for the few icons derived from Feather, ships in `THIRD_PARTY_NOTICES.txt`, copied from public/
 * to the build output; scripts/scanDistLib.mjs pins the icon set). Only the icons imported here are bundled:
 * `lucide-react` is marked side-effect free
 * and every import is a named import, so the bundler drops the other ~1,900 icons.
 *
 * The table is a `Record<ConditionCode, ...>`, so adding a ConditionCode without an icon fails the type check;
 * `test/ui/weatherIcon.test.tsx` also checks it at run time. UNKNOWN has a neutral "question mark" icon.
 * An icon never carries meaning alone: the condition text is always shown (see ConditionView).
 */
import { Cloud, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, CircleQuestionMark, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ConditionCode } from '../core/domain';

export const CONDITION_ICONS: Readonly<Record<ConditionCode, LucideIcon>> = {
  CLEAR: Sun,
  PARTLY_CLOUDY: CloudSun,
  CLOUDY: Cloud,
  RAIN: CloudRain,
  SNOW: CloudSnow,
  THUNDERSTORM: CloudLightning,
  FOG: CloudFog,
  UNKNOWN: CircleQuestionMark,
};
