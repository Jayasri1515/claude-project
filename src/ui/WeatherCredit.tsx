/**
 * Short Open-Meteo credit inside a weather panel (TASK-025). The Open-Meteo licence asks for the link "next to any
 * location Open-Meteo data are displayed", so the Current weather card and the Forecast list each carry this line
 * when they show data; the page footer keeps the full credit.
 *
 * It renders only in live mode (a real Open-Meteo composition: not demo, and a credit text is configured, the same
 * test the footer uses) and only when the caller says its section is showing real data. It is a plain paragraph
 * and is always placed outside the section's live region, so it is never announced as a change.
 */
import { message } from '../core/messages';
import { ATTRIBUTION_URLS } from './attribution';
import { useUi } from './context';
import { ExternalLink } from './ExternalLink';

export function WeatherCredit({ showing }: { showing: boolean }) {
  const { config, demo } = useUi();
  if (!showing || demo || config.attributionText.trim() === '') return null;
  return (
    <p className="note panel-credit">
      <ExternalLink href={ATTRIBUTION_URLS.openMeteo}>{message('ui.attribution.weather')}</ExternalLink>
    </p>
  );
}
