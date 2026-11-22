// De antwoordkaart en de bijlagekeuze van de + (docs/thuisplanner-spullen-documenten.md §5 en §13). Een antwoord is geen
// item: het toont wat er al is, met een tik naar de bron. Er verandert niets zonder een tik op een knop.
import { useRef } from 'react';
import { useApp } from '../lib/context';
import { dagLabel } from '../lib/datum';
import { nieuwId } from '../lib/store';
import type { SpullenContext } from '../lib/spullen/opslag';
import type { Antwoord } from '../lib/vraag/spullen';
import type { Taak } from '../lib/types';
import { IcDocument, IcMap } from './Iconen';

export function AntwoordKaart({ antwoord, vervolgvraag, kiesSpul, tochToevoegen, sluit }: {
  antwoord: Antwoord | null;
  /** Een vraag zonder onderwerp: één gerichte vervolgvraag. */
  vervolgvraag?: string;
  kiesSpul: (id: string) => void;
  tochToevoegen: () => void;
  sluit: () => void;
}) {
  const app = useApp();
  const { openSpullen, vandaag } = app;
  const naar = (pad: string) => { sluit(); openSpullen(pad); };
  const toch = <button type="button" className="tekstknop kaart-aanpassen" onClick={tochToevoegen}>Toch toevoegen</button>;

  if (!antwoord) {
    return (
      <div className="snel-kaart antwoord" aria-live="polite">
        <div className="kaart-vraag" role="group" aria-label={vervolgvraag}>
          <p>{vervolgvraag}</p>
          <p className="antwoord-uitleg">Bijvoorbeeld: "Wanneer hebben we de vaatwasser gekocht?"</p>
        </div>
        {toch}
      </div>
    );
  }

  if (antwoord.soort === 'kies') {
    return (
      <div className="snel-kaart antwoord" aria-live="polite">
        <div className="kaart-vraag" role="group" aria-label={antwoord.regel}>
          <p>{antwoord.regel}</p>
          <div className="keuzes">
            {antwoord.opties.map(o => <button key={o.id} type="button" className="keuze" onClick={() => kiesSpul(o.id)}>{o.naam}</button>)}
          </div>
        </div>
        {toch}
      </div>
    );
  }

  if (antwoord.soort === 'niets') {
    return (
      <div className="snel-kaart antwoord" aria-live="polite">
        <div className="kaart-hoofd">
          <span className="kaart-icoon antwoord" aria-hidden="true"><IcMap width={20} height={20} /></span>
          <div className="kaart-tekst"><p className="kaart-regel">{antwoord.regel}</p></div>
        </div>
        {toch}
      </div>
    );
  }

  const v = antwoord.vervolg;
  const voegTaakToe = () => {
    if (v?.soort !== 'taak' || v.bestaat) return;
    const t: Taak = { id: nieuwId('t'), soort: 'taak', titel: v.titel, datum: v.datum, voor: null, klaar: false, klaarOp: null, spulId: v.spulId };
    app.toevoegen([t], `${v.titel} staat op de takenlijst`);
    sluit();
  };
  // Rustig: bij een antwoord over een veld alleen het eerste aankoopbewijs; bij een gevraagd document alle passende.
  const alleDocs = antwoord.bronnen.filter(b => b.soort === 'document');
  const documenten = antwoord.soort === 'antwoord' && antwoord.documenten ? alleDocs : alleDocs.slice(0, 1);
  const spul = antwoord.bronnen.find(b => b.soort === 'spul');
  return (
    <div className="snel-kaart antwoord" aria-live="polite">
      <div className="kaart-hoofd">
        <span className="kaart-icoon antwoord" aria-hidden="true">{documenten.length && antwoord.soort === 'antwoord' && antwoord.documenten ? <IcDocument width={20} height={20} /> : <IcMap width={20} height={20} />}</span>
        <div className="kaart-tekst">
          <p className="kaart-titel">{antwoord.regel}</p>
          {antwoord.soort === 'antwoord' && antwoord.extra && <p className="kaart-regel">{antwoord.extra}</p>}
        </div>
      </div>
      {antwoord.soort === 'antwoord' && antwoord.uitleg && <p className="antwoord-uitleg">{antwoord.uitleg}</p>}
      <div className="antwoord-bron" role="group" aria-label="Bron">
        {spul && (
          <button type="button" className="keuze" onClick={() => naar(`spul/${encodeURIComponent(spul.id)}`)}>
            {antwoord.soort === 'ontbreekt' ? `Aanvullen bij ${spul.label}` : spul.label}
          </button>
        )}
        {documenten.map(d => (
          <button key={d.id} type="button" className="keuze" onClick={() => naar(`document/${encodeURIComponent(d.id)}`)}>
            <IcDocument width={16} height={16} /> {d.label}
          </button>
        ))}
      </div>
      {v && (
        <div className="antwoord-vervolg">
          {v.soort === 'kan-niet' ? <p>{v.regel}</p>
            : v.bestaat ? <p>De taak "{v.titel}" staat er al ({dagLabel(v.datum, vandaag).toLowerCase()}).</p>
              : (
                <>
                  <p>Taak op {dagLabel(v.datum, vandaag).toLowerCase()} {v.datum.slice(0, 4) !== vandaag.slice(0, 4) ? v.datum.slice(0, 4) : ''}: "{v.titel}"</p>
                  <div className="keuzes"><button type="button" className="keuze aan" onClick={voegTaakToe}>Taak toevoegen</button></div>
                </>
              )}
        </div>
      )}
      {toch}
    </div>
  );
}

/** De bijlagekeuze: foto maken, foto kiezen of een PDF; in de demo ook de meegeleverde voorbeelden. */
export function BijlageKeuze({ sp, sluit }: { sp: SpullenContext; sluit: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const foto = useRef<HTMLInputElement>(null);
  const pdf = useRef<HTMLInputElement>(null);
  const gekozen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    sp.startInvoer({ soort: 'bestand', bestand: f });
    sluit();
  };
  const voorbeeld = (sleutel: 'bon-foto' | 'factuur-pdf') => { sp.startInvoer({ soort: 'voorbeeld', sleutel }); sluit(); };
  return (
    <div className="snel-kaart" aria-label="Bijlage toevoegen" role="group">
      <div className="bijlage-keuzes">
        <button type="button" className="keuze" onClick={() => camera.current?.click()}>Foto maken</button>
        <button type="button" className="keuze" onClick={() => foto.current?.click()}>Foto kiezen</button>
        <button type="button" className="keuze" onClick={() => pdf.current?.click()}>Bestand (PDF)</button>
        {sp.soort === 'demo' && (
          <>
            <button type="button" className="keuze" onClick={() => voorbeeld('bon-foto')}><span className="demo-label">Demo</span> Voorbeeldbon gebruiken</button>
            <button type="button" className="keuze" onClick={() => voorbeeld('factuur-pdf')}><span className="demo-label">Demo</span> Voorbeeldfactuur gebruiken</button>
          </>
        )}
      </div>
      <p className="antwoord-uitleg">PDF, JPEG, PNG of WebP, tot 10 MB. Foto's worden op je toestel verkleind, zonder plaatsgegevens. Op een iPhone: bewaar een bijlage uit je mail eerst in Bestanden en kies hem daarna.</p>
      <input ref={camera} type="file" hidden accept="image/*" capture="environment" onChange={gekozen} data-testid="bijlage-camera" />
      <input ref={foto} type="file" hidden accept="image/*" onChange={gekozen} data-testid="bijlage-foto" />
      <input ref={pdf} type="file" hidden accept="application/pdf" onChange={gekozen} data-testid="bijlage-pdf" />
    </div>
  );
}
