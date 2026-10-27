import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * De foutgrens (N2, docs/thuisplanner-beta-voorbereiding.md Q4): loopt een scherm vast, dan geen wit scherm maar een
 * rustige melding met "Opnieuw laden" en "Meld dit". De navigatie staat buiten de grens van een scherm en blijft dus
 * werken; een ander scherm kiezen begint opnieuw (geef `key={scherm}` mee).
 *
 * "Meld dit" opent een mail met alleen het tijdstip, het scherm, de omgeving en het soort fout (bijvoorbeeld TypeError).
 * Nooit de foutmelding zelf of iets van het scherm: daar kunnen titels, namen of adressen in staan. Geen externe
 * foutmonitoring (geen nieuwe verwerker). Het adres van de ontvanger staat (nog) niet in de app; de gebruiker kiest het in
 * het mailprogramma.
 */
export class Foutgrens extends Component<{ plek: string; omgeving?: string; sluit?: () => void; children: ReactNode }, { fout: Error | null; moment: Date | null }> {
  state = { fout: null as Error | null, moment: null as Date | null };

  static getDerivedStateFromError(fout: Error) {
    return { fout, moment: new Date() };
  }

  componentDidCatch(fout: Error, info: ErrorInfo) {
    // Alleen in de console van dit toestel (voor wie meekijkt); er gaat niets naar buiten.
    console.error('Thuisplanner: een scherm liep vast', fout, info.componentStack);
  }

  render() {
    const { fout, moment } = this.state;
    if (!fout || !moment) return this.props.children;
    const href = meldLink({ moment, plek: this.props.plek, omgeving: this.props.omgeving, soort: fout.name });
    const { sluit } = this.props;
    const inhoud = (
      <div className="scherm foutgrens" role="alert" aria-labelledby="h-foutgrens">
        <h1 id="h-foutgrens">{sluit ? 'Dit venster liep vast' : 'Dit scherm liep vast'}</h1>
        <p className="foutgrens-tekst">Er ging iets mis. Laad de app opnieuw; meestal is het daarmee opgelost.</p>
        <div className="foutgrens-acties">
          <button type="button" className="knop breed" onClick={() => window.location.reload()}>Opnieuw laden</button>
          <a className="knop breed stil" href={href}>Meld dit</a>
          {sluit && <button type="button" className="knop breed stil" onClick={sluit}>Sluiten</button>}
        </div>
        <p className="stil-tekst">De melding bevat alleen het tijdstip en het scherm, niet wat je hebt ingevuld.</p>
      </div>
    );
    // In een venster (toevoegen of aanpassen): de melding in dezelfde laag, zodat hij in beeld staat.
    return sluit ? <div className="laag"><div className="venster">{inhoud}</div></div> : inhoud;
  }
}

/** De mail van "Meld dit": tijdstip, scherm, omgeving en het soort fout; geen inhoud, geen foutmelding. */
export function meldLink({ moment, plek, omgeving, soort }: { moment: Date; plek: string; omgeving?: string; soort: string }): string {
  const tijd = `${moment.getFullYear()}-${tweecijfers(moment.getMonth() + 1)}-${tweecijfers(moment.getDate())} `
    + `${tweecijfers(moment.getHours())}:${tweecijfers(moment.getMinutes())}`;
  // Alleen een bekende, korte naam van het soort fout (TypeError, RangeError, ...); iets anders wordt "Error".
  const veiligSoort = /^[A-Za-z]{1,40}$/.test(soort) ? soort : 'Error';
  const regels = [
    'Er liep een scherm vast in Thuisplanner.',
    '',
    `Tijdstip: ${tijd} (tijd van dit toestel)`,
    `Scherm: ${plek}`,
    ...(omgeving ? [`Omgeving: ${omgeving}`] : []),
    `Soort fout: ${veiligSoort}`,
    '',
    'Wat deed je net? (mag je weglaten)',
  ];
  return `mailto:?subject=${encodeURIComponent(`Thuisplanner: ${plek} liep vast`)}&body=${encodeURIComponent(regels.join('\n'))}`;
}

const tweecijfers = (n: number) => String(n).padStart(2, '0');
