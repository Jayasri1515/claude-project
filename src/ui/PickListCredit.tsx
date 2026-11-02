/**
 * Data credit beside the pick list (M-22, M-23). The pick list shows search results, which are location data from
 * GeoNames served by Open-Meteo, and Open-Meteo asks for its link "next to any location Open-Meteo data are
 * displayed". Both are plain paragraphs outside any live region, so they are never announced as a change. They render
 * only when a credit text is configured (the same test the footer and WeatherCredit use).
 *
 * The links are ExternalLink (new tab, noopener noreferrer); the addresses come from ATTRIBUTION_URLS.
 */
import { message } from '../core/messages';
import { ATTRIBUTION_URLS, splitAttribution } from './attribution';
import { useUi } from './context';
import { ExternalLink } from './ExternalLink';

export function PickListCredit() {
  const { config } = useUi();
  if (config.attributionText.trim() === '') return null;
  const geonames = message('ui.attribution.geonames');
  const line = message('ui.attribution.geonamesLine', { geonames });
  return (
    <>
      <p className="note panel-credit">
        <ExternalLink href={ATTRIBUTION_URLS.openMeteo}>{message('ui.attribution.weather')}</ExternalLink>
      </p>
      <p className="note panel-credit">
        {splitAttribution(line, [{ phrase: geonames, href: ATTRIBUTION_URLS.geonames }]).map((segment, index) =>
          segment.kind === 'link' ? (
            <ExternalLink key={index} href={segment.href}>
              {segment.text}
            </ExternalLink>
          ) : (
            <span key={index}>{segment.text}</span>
          ),
        )}
      </p>
    </>
  );
}
