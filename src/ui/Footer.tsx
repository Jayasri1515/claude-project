/**
 * Footer: data-source credit and notices (TASK-025; Open-Meteo licence CC BY 4.0, GeoNames credit; TASK-035 icon
 * licence). A `footer` that is not inside main or a section is the page's `contentinfo` landmark.
 *
 * What it shows, by mode:
 * - live (real Open-Meteo data): the credit text from `Config.attributionText`, exactly as configured, with the
 *   Open-Meteo and GeoNames names linked; the data licence (CC BY 4.0, linked) and a note that values are rounded
 *   and simplified; and a link to the third-party notices. An empty `attributionText` shows no credit at all.
 * - demo: NO credit (the data is invented and must not be presented as Open-Meteo data); a statement saying so,
 *   plus the notices link (the Lucide icons are still used).
 * The footer is the full credit for the page; the weather panels also carry a short Open-Meteo link beside the
 * data (WeatherCredit.tsx), as the licence asks.
 *
 * Links are ExternalLink (new tab, noopener noreferrer, new-tab hint in the accessible name).
 */
import { message } from '../core/messages';
import { ATTRIBUTION_URLS, splitAttribution, THIRD_PARTY_NOTICES_PATH } from './attribution';
import type { AttributionLink } from './attribution';
import { useUi } from './context';
import { ExternalLink } from './ExternalLink';

function Segments({ text, links }: { text: string; links: readonly AttributionLink[] }) {
  return (
    <>
      {splitAttribution(text, links).map((segment, index) =>
        segment.kind === 'link' ? (
          <ExternalLink key={index} href={segment.href}>
            {segment.text}
          </ExternalLink>
        ) : (
          <span key={index}>{segment.text}</span>
        ),
      )}
    </>
  );
}

function Credit({ text }: { text: string }) {
  const licenceName = message('ui.attribution.licenceName');
  return (
    <>
      <p className="attribution">
        <Segments
          text={text}
          links={[
            { phrase: message('ui.attribution.weather'), href: ATTRIBUTION_URLS.openMeteo },
            { phrase: message('ui.attribution.geonames'), href: ATTRIBUTION_URLS.geonames },
          ]}
        />
      </p>
      <p className="attribution">
        <Segments
          text={message('ui.attribution.licenceLine', { licence: licenceName })}
          links={[{ phrase: licenceName, href: ATTRIBUTION_URLS.ccBy4 }]}
        />
      </p>
    </>
  );
}

export function Footer() {
  const { config, demo } = useUi();
  return (
    <footer className="app-footer">
      {demo ? (
        <p className="attribution">{message('ui.attribution.demo')}</p>
      ) : config.attributionText.trim() !== '' ? (
        <Credit text={config.attributionText} />
      ) : null}
      <p className="attribution">
        <ExternalLink href={THIRD_PARTY_NOTICES_PATH}>{message('ui.footer.notices')}</ExternalLink>
      </p>
    </footer>
  );
}
