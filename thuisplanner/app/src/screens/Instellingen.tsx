import { useApp } from '../lib/context';
import { IcLinks, IcPijl } from '../components/Iconen';
import {
  isStandaard, magUit, OVERZICHT_DELEN, type AgendaWie, type OverzichtDeel, type Sleutel, type Startscherm,
} from '../lib/voorkeuren';
import type { AgendaWeergave } from '../lib/context';

/**
 * Persoonlijke instellingen (besluit 20; voorbeelden 2–5 in docs/afbeeldingen/besluit20-instellingen-mobiel.html). Alleen
 * de eigen weergave: niets hiervan verandert gedeelde gegevens of wat een ander ziet. Meldingen komen er pas bij met de
 * pushmeldingen (P1); tot dan toont dit scherm er niets over.
 */
export type InstellingenPad = '' | 'startscherm' | 'overzicht' | 'agenda';

const STARTSCHERMEN: { id: Startscherm; naam: string; sub: string }[] = [
  { id: 'vandaag', naam: 'Overzicht', sub: 'Wat er vandaag en deze week speelt' },
  { id: 'agenda', naam: 'Agenda', sub: 'Opent in je standaardweergave' },
  { id: 'taken', naam: 'Taken', sub: 'De takenlijst in de Agenda' },
  { id: 'boodschappen', naam: 'Boodschappen', sub: '' },
];
const DELEN: Record<OverzichtDeel, { naam: string; sub: string }> = {
  afspraken: { naam: 'Afspraken', sub: 'De eerstvolgende 3' },
  taken: { naam: 'Te doen', sub: 'Tot 5 open taken' },
  boodschappen: { naam: 'Boodschappen', sub: 'Eén regel' },
  verder: { naam: 'Vakantie en suggestie', sub: 'Alleen als ze spelen' },
};
const WEERGAVEN: { id: AgendaWeergave; naam: string }[] = [
  { id: 'dag', naam: 'Dag' }, { id: 'week', naam: 'Week' }, { id: 'maand', naam: 'Maand' }, { id: 'taken', naam: 'Taken' },
];
const WEERGAVE_NAAM: Record<AgendaWeergave, string> = { dag: 'Dag', week: 'Week', maand: 'Maand', taken: 'Taken' };

export function Instellingen() {
  const { voorkeuren, instellingenPad, openInstellingen, gaNaar } = useApp();
  if (!voorkeuren) return null;
  const terug = instellingenPad === ''
    ? <button type="button" className="terug-link" onClick={() => gaNaar('meer')}><IcLinks width={18} height={18} /> Meer</button>
    : <button type="button" className="terug-link" onClick={() => openInstellingen('')}><IcLinks width={18} height={18} /> Persoonlijk</button>;
  return (
    <div className="scherm instellingen">
      <header className="kop">{terug}</header>
      {instellingenPad === '' && <Hub />}
      {instellingenPad === 'startscherm' && <StartschermKeuze />}
      {instellingenPad === 'overzicht' && <OverzichtKeuze />}
      {instellingenPad === 'agenda' && <AgendaKeuze />}
    </div>
  );
}

function Reden() {
  const { voorkeuren } = useApp();
  if (!voorkeuren?.reden) return null;
  return <p className="stil-tekst instellingen-reden" role="status">{voorkeuren.reden}</p>;
}

function Hub() {
  const { voorkeuren, openInstellingen } = useApp();
  const v = voorkeuren!.voorkeuren;
  const aan = OVERZICHT_DELEN.filter(d => v.overzicht[d]).length;
  const regels: { pad: Exclude<InstellingenPad, ''>; naam: string; sub: string; waarde: string }[] = [
    { pad: 'startscherm', naam: 'Startscherm', sub: 'Waar Thuisplanner opent', waarde: STARTSCHERMEN.find(s => s.id === v.startscherm)!.naam },
    { pad: 'overzicht', naam: 'Overzicht', sub: 'Wat er op je Overzicht staat', waarde: `${aan} van 4` },
    { pad: 'agenda', naam: 'Agenda en taken', sub: 'Standaardweergave en wat je ziet', waarde: WEERGAVE_NAAM[v.agendaWeergave] },
  ];
  return (
    <>
      <h1>Persoonlijk</h1>
      <p className="kop-samenvatting">Dit verandert alleen jouw weergave. De rest van het gezin merkt er niets van.</p>
      <section className="blok" aria-label="Instellingen">
        <ul className="lijst">
          {regels.map(r => (
            <li key={r.pad} className="rij">
              <button type="button" className="rij-knop" onClick={() => openInstellingen(r.pad)} aria-label={`${r.naam}: ${r.waarde}`}>
                <span className="rij-inhoud">
                  <span className="rij-titel">{r.naam}</span>
                  <span className="rij-sub"><span className="plek">{r.sub}</span></span>
                </span>
                <span className="instelling-waarde">{r.waarde}</span>
                <IcPijl className="rij-pijl" />
              </button>
            </li>
          ))}
        </ul>
        <p className="stil-tekst instellingen-voet">Wordt bewaard bij je account en geldt op al je toestellen.</p>
      </section>
      <Herstellen />
    </>
  );
}

function Herstellen() {
  const { voorkeuren, zetAgenda, meld } = useApp();
  const vk = voorkeuren!;
  const standaard = isStandaard(vk.voorkeuren);
  return (
    <section className="blok" aria-labelledby="h-herstel">
      <h2 id="h-herstel" className="sectie-kop">Standaard</h2>
      <button type="button" className="knop stil" disabled={standaard || !vk.kanWijzigen}
        onClick={async () => {
          if (await vk.herstel()) { zetAgenda({ weergave: 'week', filter: null }); meld('Standaardinstellingen hersteld'); }
        }}>
        Standaardinstellingen herstellen
      </button>
      <p className="stil-tekst instellingen-voet">
        {standaard ? 'Je gebruikt de standaardinstellingen.' : 'Zet startscherm en weergave terug.'}
      </p>
      <Reden />
    </section>
  );
}

/** Eén keuze uit een lijst (radio's), voor startscherm en wiens agenda. */
function Keuzes<T extends string>({ naam, label, opties, waarde, kies }: {
  naam: string; label: string; opties: { id: T; naam: string; sub?: string }[]; waarde: T; kies: (w: T) => void;
}) {
  const { voorkeuren } = useApp();
  return (
    <fieldset className="instelling-groep" disabled={!voorkeuren!.kanWijzigen}>
      <legend className="sectie-kop">{label}</legend>
      <ul className="lijst">
        {opties.map(o => (
          <li key={o.id} className="rij">
            <label className="instelling-regel">
              <span className="rij-inhoud">
                <span className="rij-titel">{o.naam}</span>
                {o.sub && <span className="rij-sub"><span className="plek">{o.sub}</span></span>}
              </span>
              <input type="radio" name={naam} value={o.id} checked={waarde === o.id} onChange={() => kies(o.id)} />
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

function StartschermKeuze() {
  const { voorkeuren } = useApp();
  const vk = voorkeuren!;
  const zet = (s: Sleutel, w: string) => { void vk.zet(s, w); };
  const opties = STARTSCHERMEN.map(s => (s.id === 'agenda'
    ? { ...s, sub: `Opent in je standaardweergave (${WEERGAVE_NAAM[vk.voorkeuren.agendaWeergave]})` } : s));
  return (
    <>
      <h1>Startscherm</h1>
      <p className="kop-samenvatting">Waar Thuisplanner opent als je de app start.</p>
      <Keuzes naam="startscherm" label="Openen op" opties={opties} waarde={vk.voorkeuren.startscherm} kies={w => zet('startscherm', w)} />
      <Reden />
      <p className="stil-tekst instellingen-voet">
        Een link uit een melding, een uitnodiging of een gedeelde link opent altijd dat ene item of scherm. Wisselen tussen
        schermen brengt je nooit vanzelf terug naar het startscherm.
      </p>
    </>
  );
}

function OverzichtKeuze() {
  const { voorkeuren } = useApp();
  const vk = voorkeuren!;
  const v = vk.voorkeuren;
  return (
    <>
      <h1>Overzicht</h1>
      <p className="kop-samenvatting">Verbergen is niet verwijderen. Alles blijft in de Agenda en bij Boodschappen.</p>
      <fieldset className="instelling-groep" disabled={!vk.kanWijzigen}>
        <legend className="sectie-kop">Onderdelen</legend>
        <ul className="lijst">
          {OVERZICHT_DELEN.map(d => {
            const vast = v.overzicht[d] && !magUit(v, d);
            return (
              <li key={d} className="rij">
                <label className="instelling-regel">
                  <span className="rij-inhoud">
                    <span className="rij-titel">{DELEN[d].naam}</span>
                    <span className="rij-sub"><span className="plek">{vast ? 'Blijft aan: je Overzicht is nooit leeg' : DELEN[d].sub}</span></span>
                  </span>
                  <input type="checkbox" role="switch" checked={v.overzicht[d]} disabled={vast}
                    onChange={e => { void vk.zet(`overzicht.${d}` as Sleutel, e.target.checked); }} />
                </label>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <Reden />
      <p className="stil-tekst instellingen-voet">
        Taken die te laat zijn of vandaag moeten, blijven altijd zichtbaar zolang Te doen aan staat. Eén onderdeel blijft
        altijd aan, zodat je Overzicht nooit leeg is.
      </p>
    </>
  );
}

function AgendaKeuze() {
  const { voorkeuren, zetAgenda, huishouden } = useApp();
  const vk = voorkeuren!;
  const v = vk.voorkeuren;
  return (
    <>
      <h1>Agenda en taken</h1>
      <p className="kop-samenvatting">Hoe de Agenda opent. Binnen de Agenda kun je altijd even iets anders kiezen.</p>
      <fieldset className="instelling-groep" disabled={!vk.kanWijzigen}>
        <legend className="sectie-kop">Standaardweergave</legend>
        <div className="segment vier" role="radiogroup" aria-label="Standaardweergave">
          {WEERGAVEN.map(w => (
            <button key={w.id} type="button" role="radio" aria-checked={v.agendaWeergave === w.id}
              className={'segment-knop' + (v.agendaWeergave === w.id ? ' aan' : '')}
              onClick={() => { zetAgenda({ weergave: w.id }); void vk.zet('agenda.weergave', w.id); }}>
              {w.naam}
            </button>
          ))}
        </div>
      </fieldset>
      <Keuzes<AgendaWie> naam="agenda-wie" label="Wiens agenda bij openen" waarde={v.agendaWie}
        opties={[
          { id: 'iedereen', naam: 'Iedereen', sub: 'Het hele gezin' },
          { id: 'ik', naam: 'Ik', sub: 'Jouw afspraken en taken, plus wat voor het hele gezin is. Een link vanaf het Overzicht toont altijd iedereen' },
        ]}
        kies={w => { zetAgenda({ filter: w === 'ik' ? huishouden.ik : null }); void vk.zet('agenda.wie', w); }} />
      <Reden />
      <p className="stil-tekst instellingen-voet">
        Afgeronde taken en taken zonder datum blijven ingeklapt onderaan, zoals nu. Daar is geen schakelaar voor nodig.
      </p>
    </>
  );
}

/** De regel in Meer, onder "Voor jou". Alleen als persoonlijke instellingen er zijn (demo, of online met de migratie). */
export function InstellingenRij() {
  const { voorkeuren, openInstellingen } = useApp();
  if (!voorkeuren) return null;
  return (
    <section aria-labelledby="h-voor-jou" className="blok">
      <h2 id="h-voor-jou" className="sectie-kop">Voor jou</h2>
      <ul className="lijst">
        <li className="rij">
          <button type="button" className="rij-knop" onClick={() => openInstellingen('')}>
            <span className="rij-inhoud">
              <span className="rij-titel">Persoonlijke instellingen</span>
              <span className="rij-sub"><span className="plek">Startscherm en weergave. Alleen voor jou.</span></span>
            </span>
            <IcPijl className="rij-pijl" />
          </button>
        </li>
      </ul>
    </section>
  );
}
