// Mijn spullen & Documenten (docs/thuisplanner-spullen-documenten.md §4 en §5): één rij onder Meer, met binnenin de
// tabbladen Spullen en Documenten. Dezelfde gegevens, twee weergaven: een document is één rij en verschijnt bij elk spul
// waaraan het gekoppeld is. Rustig: een lijst, één zoekveld, en het dossier pas na een tik.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '../lib/context';
import {
  SOORT_NAAM, VELD_NAAM, WETTELIJKE_UITLEG, datumMetJaar, documentenVan, inPrullenbak, magZichtbaarheidWisselen, spullenVan,
  terugzettenTot, veldStatus, veldWaarde, zoekDocumenten, zoekSpullen,
} from '../lib/spullen/logica';
import { useSpullen, type SpullenContext } from '../lib/spullen/opslag';
import type { Document, Spul, SpulVeld } from '../lib/spullen/types';
import { IcDocument, IcLinks, IcMap, IcPijl, IcPlus } from '../components/Iconen';
import { DocumentVenster, KoppelVenster, SpulVenster } from '../components/SpullenVensters';
import { TaakRij } from '../components/Rijen';
import { nieuwId } from '../lib/store';
import { isTaak } from '../lib/vandaag';
import type { Taak } from '../lib/types';
import { TAKEN_ALLEEN_GEDEELD } from '../lib/vraag/spullen';

export function Spullen() {
  const sp = useSpullen();
  const { spullenPad, openSpullen, gaNaar } = useApp();
  if (!sp) {
    return (
      <div className="scherm">
        <header className="kop"><button type="button" className="terug-link" onClick={() => gaNaar('meer')}><IcLinks width={18} height={18} /> Meer</button></header>
        <p className="stil-tekst" role="status">Spullen &amp; documenten is in deze versie nog niet beschikbaar.</p>
      </div>
    );
  }
  const [soort, id] = spullenPad.split('/');
  if (soort === 'spul' && id) return <SpulPagina key={id} sp={sp} id={decodeURIComponent(id)} />;
  if (soort === 'document' && id) return <DocumentPagina key={id} sp={sp} id={decodeURIComponent(id)} />;
  return <Overzicht sp={sp} tab={soort === 'documenten' ? 'documenten' : 'spullen'} kiesTab={t => openSpullen(t === 'documenten' ? 'documenten' : '')} />;
}

/** De rij in Meer. Zonder opslag (de lokale modus, nog niet gebouwd) toont Meer niets van spullen. */
export function SpullenRij() {
  const sp = useSpullen();
  const { openSpullen } = useApp();
  if (!sp) return null;
  const n = sp.gegevens.spullen.filter(s => !s.verwijderdOp).length;
  const d = sp.gegevens.documenten.filter(x => !x.verwijderdOp).length;
  const sub = n || d ? `${n} ${n === 1 ? 'spul' : 'spullen'} · ${d} ${d === 1 ? 'document' : 'documenten'}` : 'Aankopen, bonnen en garanties';
  return (
    <section aria-label="Spullen en documenten" className="blok meer-vakanties">
      <ul className="lijst">
        <li className="rij">
          <button type="button" className="rij-knop" onClick={() => openSpullen('')} aria-label={`Spullen & documenten: ${sub}`}>
            <span className="lid-avatar vak-icoon" aria-hidden="true"><IcMap width={20} height={20} /></span>
            <span className="rij-inhoud">
              <span className="rij-titel">Spullen &amp; documenten</span>
              <span className="rij-sub"><span className="plek">{sub}</span></span>
            </span>
            <IcPijl className="rij-pijl" />
          </button>
        </li>
      </ul>
    </section>
  );
}

function DemoNoot({ sp }: { sp: SpullenContext }) {
  if (sp.soort !== 'demo') return null;
  return <p className="sp-noot"><span className="demo-label">Demo</span> Voorbeeldgegevens. Er wordt niets echt bewaard, ook geen bestanden.</p>;
}

// ---------------------------------------------------------------- Overzicht met de twee tabbladen

function Overzicht({ sp, tab, kiesTab }: { sp: SpullenContext; tab: 'spullen' | 'documenten'; kiesTab: (t: 'spullen' | 'documenten') => void }) {
  const { gaNaar, openSpullen } = useApp();
  const [zoek, zetZoek] = useState('');
  const [nieuwSpul, zetNieuwSpul] = useState(false);
  const [toonPrullenbak, zetToonPrullenbak] = useState(false);
  const bestand = useRef<HTMLInputElement>(null);
  const g = sp.gegevens;
  const spullen = zoekSpullen(g.spullen, zoek);
  const documenten = zoekDocumenten(g, zoek);
  const nu = new Date();
  const prullenbak = [
    ...g.spullen.filter(s => inPrullenbak(s, nu)).map(s => ({ id: s.id, naam: s.naam, op: s.verwijderdOp!, terug: () => sp.spulTerugzetten(s.id) })),
    ...g.documenten.filter(d => inPrullenbak(d, nu)).map(d => ({ id: d.id, naam: d.titel, op: d.verwijderdOp!, terug: () => sp.documentTerugzetten(d.id) })),
  ];
  return (
    <div className="scherm spullen">
      <header className="kop">
        <button type="button" className="terug-link" onClick={() => gaNaar('meer')}><IcLinks width={18} height={18} /> Meer</button>
        <div className="kop-regel">
          <h1>Spullen &amp; documenten</h1>
          <button type="button" className="icoonknop vak-plus" aria-label={tab === 'spullen' ? 'Spul toevoegen' : 'Document toevoegen'}
            onClick={() => (tab === 'spullen' ? zetNieuwSpul(true) : bestand.current?.click())}><IcPlus /></button>
        </div>
      </header>
      <DemoNoot sp={sp} />

      <div className="vak-tabs twee" role="tablist" aria-label="Weergave">
        {(['spullen', 'documenten'] as const).map(t => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls={`paneel-${t}`}
            className={'vak-tab' + (tab === t ? ' aan' : '')} onClick={() => kiesTab(t)}>{t === 'spullen' ? 'Spullen' : 'Documenten'}</button>
        ))}
      </div>

      <label className="sp-zoek">
        <span className="sr-only">Zoeken</span>
        <input type="search" value={zoek} onChange={e => zetZoek(e.target.value)} placeholder={tab === 'spullen' ? 'Zoek op naam, merk, model of winkel' : 'Zoek op titel, soort of spul'}
          autoComplete="off" enterKeyHint="search" />
      </label>

      <div role="tabpanel" id={`paneel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'spullen' ? (
          spullen.length ? (
            <ul className="lijst sp-lijst">
              {spullen.map(s => (
                <li key={s.id} className="rij">
                  <button type="button" className="rij-knop" onClick={() => openSpullen(`spul/${encodeURIComponent(s.id)}`)}>
                    <span className="rij-inhoud">
                      <span className="rij-titel">{s.naam}</span>
                      <span className="rij-sub"><span className="plek">{spulSub(s)}</span></span>
                    </span>
                    <IcPijl className="rij-pijl" />
                  </button>
                </li>
              ))}
            </ul>
          ) : zoek ? <p className="stil-tekst sp-leeg">Niets gevonden voor "{zoek}".</p> : (
            <section className="rust" aria-label="Nog geen spullen">
              <p className="rust-titel">Nog geen spullen.</p>
              <p className="rust-tekst">Bewaar een aankoop met de bon erbij, dan vind je hem altijd terug.</p>
              <button type="button" className="knop" onClick={() => zetNieuwSpul(true)}>Spul toevoegen</button>
            </section>
          )
        ) : (
          documenten.length ? (
            <ul className="lijst sp-lijst">
              {documenten.map(d => (
                <li key={d.id} className="rij">
                  <button type="button" className="rij-knop" onClick={() => openSpullen(`document/${encodeURIComponent(d.id)}`)}>
                    <span className="lid-avatar vak-icoon" aria-hidden="true"><IcDocument width={20} height={20} /></span>
                    <span className="rij-inhoud">
                      <span className="rij-titel">{d.titel}</span>
                      <span className="rij-sub"><span className="plek">{documentSub(sp, d)}</span></span>
                    </span>
                    <IcPijl className="rij-pijl" />
                  </button>
                </li>
              ))}
            </ul>
          ) : zoek ? <p className="stil-tekst sp-leeg">Niets gevonden voor "{zoek}".</p> : (
            <section className="rust" aria-label="Nog geen documenten">
              <p className="rust-titel">Nog geen documenten.</p>
              <p className="rust-tekst">Een foto van een bon of een PDF-factuur is genoeg.</p>
              <button type="button" className="knop" onClick={() => bestand.current?.click()}>Document toevoegen</button>
            </section>
          )
        )}
      </div>

      {tab === 'documenten' && (sp.onvoltooid?.length ?? 0) > 0 && (
        <section className="sp-prullenbak" aria-labelledby="h-onvoltooid">
          <h2 id="h-onvoltooid" className="sectie-kop">Niet afgerond</h2>
          <ul className="lijst">
            {sp.onvoltooid!.map(d => (
              <li key={d.id} className="rij sp-weg">
                <span className="rij-inhoud">
                  <span className="rij-titel">{d.titel}</span>
                  <span className="rij-sub"><span className="plek">{d.upload === 'mislukt' ? 'Geweigerd: dit bestand kon niet worden bewaard' : 'Het bestand is nog niet (goed) aangekomen'}. Kies het bestand opnieuw.</span></span>
                </span>
                <button type="button" className="knop klein stil" onClick={() => sp.documentVerwijderen(d.id)}>Weghalen</button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {prullenbak.length > 0 && (
        <section className="sp-prullenbak" aria-labelledby="h-prullenbak">
          <h2 id="h-prullenbak" className="sectie-kop">
            <button type="button" className="link uitklap" aria-expanded={toonPrullenbak} onClick={() => zetToonPrullenbak(x => !x)}>
              Prullenbak <span className="teller">{prullenbak.length}</span> <IcPijl className={'uitklap-pijl' + (toonPrullenbak ? ' open' : '')} width={16} height={16} />
            </button>
          </h2>
          {toonPrullenbak && (
            <ul className="lijst">
              {prullenbak.map(p => (
                <li key={p.id} className="rij sp-weg">
                  <span className="rij-inhoud">
                    <span className="rij-titel">{p.naam}</span>
                    <span className="rij-sub"><span className="plek">Terug te zetten tot {datumMetJaar(terugzettenTot(p.op))}</span></span>
                  </span>
                  <button type="button" className="knop klein stil" onClick={p.terug}>Terugzetten</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <BestandKiezer invoer={bestand} sp={sp} />
      {nieuwSpul && <SpulVenster sluit={() => zetNieuwSpul(false)} opBewaard={id => openSpullen(`spul/${encodeURIComponent(id)}`)} />}
    </div>
  );
}

/** Een verborgen bestandskeuze (PDF of foto); de invoer zelf staat in SpullenLaag. */
function BestandKiezer({ invoer, sp, spulId }: { invoer: React.RefObject<HTMLInputElement | null>; sp: SpullenContext; spulId?: string }) {
  return (
    <input ref={invoer} type="file" hidden accept="application/pdf,image/*" data-testid="bestand-kiezen"
      onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) sp.startInvoer({ soort: 'bestand', bestand: f }, { spulId }); }} />
  );
}

function spulSub(s: Spul): string {
  const delen = [s.aankoopdatum && `Gekocht ${datumMetJaar(s.aankoopdatum)}`, s.winkel].filter(Boolean);
  return delen.length ? delen.join(' · ') : 'Nog geen aankoopgegevens';
}
function documentSub(sp: SpullenContext, d: Document): string {
  const bij = spullenVan(sp.gegevens, d.id).map(s => s.naam);
  return [SOORT_NAAM[d.soort], d.datum && datumMetJaar(d.datum), bij.length ? `bij ${bij.join(', ')}` : 'niet gekoppeld',
    d.zichtbaarheid === 'persoonlijk' ? 'alleen voor jou' : null].filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------- Het aankoopdossier

const PRODUCT: SpulVeld[] = ['categorie', 'merk', 'model', 'serienummer'];
const AANKOOP: SpulVeld[] = ['aankoopdatum', 'winkel', 'prijs', 'bestelnummer'];

function VeldRij({ s, veld }: { s: Spul; veld: SpulVeld }) {
  const status = veldStatus(s, veld);
  return (
    <div className="detail-rij statisch">
      <span className="detail-label">{VELD_NAAM[veld]}</span>
      <span className="detail-waarde">
        {status === 'ontbreekt' ? <span className="sp-ontbreekt">ontbreekt</span> : veldWaarde(s, veld)}
        {status === 'voorstel' && <span className="sp-voorstel">controleer</span>}
      </span>
    </div>
  );
}

function SpulPagina({ sp, id }: { sp: SpullenContext; id: string }) {
  const { openSpullen } = useApp();
  const s = sp.gegevens.spullen.find(x => x.id === id && !x.verwijderdOp);
  const [bewerk, zetBewerk] = useState(false);
  const [koppel, zetKoppel] = useState(false);
  const [weg, zetWeg] = useState(false);
  const bestand = useRef<HTMLInputElement>(null);
  if (!s) return <NietGevonden wat="Dit spul" />;
  const docs = documentenVan(sp.gegevens, s.id);
  return (
    <div className="scherm spullen">
      <header className="kop">
        <button type="button" className="terug-link" onClick={() => openSpullen('')}><IcLinks width={18} height={18} /> Spullen</button>
        <h1 className="sp-titel">{s.naam}</h1>
        {s.zichtbaarheid === 'persoonlijk' && <p className="kop-sub">Alleen voor jou</p>}
      </header>
      <DemoNoot sp={sp} />

      <section className="vak-blok" aria-labelledby="h-product">
        <h2 id="h-product" className="sp-blok-kop">Product</h2>
        <div className="detail-rijen">{PRODUCT.map(v => <VeldRij key={v} s={s} veld={v} />)}</div>
      </section>
      <section className="vak-blok" aria-labelledby="h-aankoop">
        <h2 id="h-aankoop" className="sp-blok-kop">Aankoop</h2>
        <div className="detail-rijen">{AANKOOP.map(v => <VeldRij key={v} s={s} veld={v} />)}</div>
      </section>
      <section className="vak-blok" aria-labelledby="h-garantie">
        <h2 id="h-garantie" className="sp-blok-kop">Garantie</h2>
        <div className="detail-rijen">
          <VeldRij s={s} veld="garantieTot" />
          {(s.extraGarantieTot || s.extraGarantieAanbieder) && <><VeldRij s={s} veld="extraGarantieTot" /><VeldRij s={s} veld="extraGarantieAanbieder" /></>}
        </div>
        <p className="stil-tekst sp-uitleg">{WETTELIJKE_UITLEG}</p>
      </section>
      <section className="vak-blok" aria-labelledby="h-documenten">
        <div className="vak-blok-kop"><h2 id="h-documenten" className="sp-blok-kop">Documenten</h2></div>
        {docs.length ? (
          <ul className="lijst sp-docs">
            {docs.map(d => (
              <li key={d.id} className="rij">
                <button type="button" className="rij-knop" onClick={() => openSpullen(`document/${encodeURIComponent(d.id)}`)}>
                  <span className="lid-avatar vak-icoon" aria-hidden="true"><IcDocument width={20} height={20} /></span>
                  <span className="rij-inhoud">
                    <span className="rij-titel">{d.titel}</span>
                    <span className="rij-sub"><span className="plek">{SOORT_NAAM[d.soort]}</span></span>
                  </span>
                  <IcPijl className="rij-pijl" />
                </button>
              </li>
            ))}
          </ul>
        ) : <p className="stil-tekst">Nog geen bon of factuur bij dit spul.</p>}
        <div className="keuzes sp-acties">
          <button type="button" className="knop klein stil" onClick={() => bestand.current?.click()}>Bestand toevoegen</button>
          <button type="button" className="knop klein stil" onClick={() => zetKoppel(true)}>Bestaand document koppelen</button>
        </div>
      </section>

      <SpulTaken spulId={s.id} naam={s.naam} persoonlijk={s.zichtbaarheid === 'persoonlijk'} />

      <div className="detail-acties sp-onder">
        <button type="button" className="knop breed stil" onClick={() => zetBewerk(true)}>Aanpassen</button>
        {!weg ? <button type="button" className="knop breed gevaar" onClick={() => zetWeg(true)}>Verwijderen</button> : (
          <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
            <p className="stil-tekst">{s.naam} gaat naar de prullenbak (30 dagen terug te zetten). De documenten blijven bewaard, tenzij je ze meeneemt.</p>
            <button type="button" className="knop breed gevaar" onClick={() => { sp.spulVerwijderen(s.id); openSpullen(''); }}>Alleen het spul</button>
            {docs.length > 0 && <button type="button" className="knop breed stil-gevaar" onClick={() => { sp.spulVerwijderen(s.id, true); openSpullen(''); }}>Ook de documenten</button>}
            <button type="button" className="knop breed stil" onClick={() => zetWeg(false)}>Niet verwijderen</button>
          </div>
        )}
      </div>

      <BestandKiezer invoer={bestand} sp={sp} spulId={s.id} />
      {bewerk && <SpulVenster bestaand={s} sluit={() => zetBewerk(false)} />}
      {koppel && <KoppelVenster spulId={s.id} sluit={() => zetKoppel(false)} />}
    </div>
  );
}

/**
 * Taken bij een spul (onderhoud, garantie): gewone taken met een verwijzing naar het spul (tasks.possession_id). Ze staan
 * ook in de Agenda en op Vandaag, zoals elke taak; hier alleen de taken van dit spul.
 */
function SpulTaken({ spulId, naam, persoonlijk }: { spulId: string; naam: string; persoonlijk: boolean }) {
  const app = useApp();
  const [titel, zetTitel] = useState('');
  const taken = app.staat.items.filter(isTaak).filter(t => t.spulId === spulId);
  const open = taken.filter(t => !t.klaar), klaar = taken.filter(t => t.klaar);
  const voegToe = (e: React.FormEvent) => {
    e.preventDefault();
    const tekst = titel.trim().replace(/\s+/g, ' ');
    if (!tekst) return;
    const t: Taak = { id: nieuwId('t'), soort: 'taak', titel: tekst, datum: null, voor: null, klaar: false, klaarOp: null, spulId };
    app.toevoegen([t], `${tekst} staat bij de taken van ${naam}`);
    zetTitel('');
  };
  // Taken zijn voor iedereen zichtbaar: een persoonlijk spul krijgt er geen (ook de database weigert dat).
  if (persoonlijk) {
    return (
      <section className="vak-blok" aria-labelledby="h-taken">
        <h2 id="h-taken" className="sp-blok-kop">Taken</h2>
        <p className="stil-tekst">{TAKEN_ALLEEN_GEDEELD}</p>
      </section>
    );
  }
  return (
    <section className="vak-blok" aria-labelledby="h-taken">
      <h2 id="h-taken" className="sp-blok-kop">Taken</h2>
      {taken.length ? (
        <ul className="lijst sp-docs">{[...open, ...klaar].map(t => <TaakRij key={t.id} t={t} />)}</ul>
      ) : <p className="stil-tekst">Nog geen taken bij dit spul, zoals onderhoud.</p>}
      <form className="sp-taak-nieuw" onSubmit={voegToe} noValidate>
        <label className="sr-only" htmlFor="sp-taak">Nieuwe taak bij {naam}</label>
        <input id="sp-taak" value={titel} onChange={e => zetTitel(e.target.value)} placeholder="Bijvoorbeeld: filter schoonmaken" maxLength={200} autoComplete="off" />
        <button type="submit" className="knop klein stil" disabled={!titel.trim()}>Toevoegen</button>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- Eén document

function DocumentPagina({ sp, id }: { sp: SpullenContext; id: string }) {
  const { openSpullen, meld } = useApp();
  const d = sp.gegevens.documenten.find(x => x.id === id && !x.verwijderdOp);
  const [koppel, zetKoppel] = useState(false);
  const [bewerk, zetBewerk] = useState(false);
  const [weg, zetWeg] = useState(false);
  const bestand = useBestand(sp, d);
  if (!d) return <NietGevonden wat="Dit document" />;
  const bij = spullenVan(sp.gegevens, d.id);
  const label = d.type === 'application/pdf' ? 'PDF openen' : 'Openen';
  return (
    <div className="scherm spullen">
      <header className="kop">
        <button type="button" className="terug-link" onClick={() => openSpullen('documenten')}><IcLinks width={18} height={18} /> Documenten</button>
        <h1 className="sp-titel">{d.titel}</h1>
        <p className="kop-sub">{SOORT_NAAM[d.soort]}{d.datum ? ` · ${datumMetJaar(d.datum)}` : ''}{d.zichtbaarheid === 'persoonlijk' ? ' · alleen voor jou' : ''}</p>
      </header>
      <DemoNoot sp={sp} />

      {bestand.url && d.type !== 'application/pdf' && <img className="sp-afbeelding" src={bestand.url} alt={`Afbeelding van ${d.titel}`} />}
      {/* Een echte link waar je zelf op tikt: een klik na een await blokkeert Safari op de iPhone als pop-up. */}
      {bestand.url ? (
        <a className="knop breed" href={bestand.url} target="_blank" rel="noopener noreferrer" download={d.type === 'application/pdf' ? undefined : d.titel}>{label}</a>
      ) : (
        <button type="button" className="knop breed" disabled={bestand.staat === 'laden'}
          onClick={() => meld(bestand.staat === 'niet-bewaard' ? 'In de demo wordt je eigen bestand niet bewaard; alleen de voorbeelden zijn te openen.' : 'Het bestand kon niet worden geopend.')}>{label}</button>
      )}
      <p className="stil-tekst sp-uitleg">{d.type === 'application/pdf' ? 'Een PDF opent buiten de app, in de viewer van je toestel.' : 'Opent buiten de app.'}</p>

      <section className="vak-blok" aria-labelledby="h-bij">
        <h2 id="h-bij" className="sp-blok-kop">Hoort bij</h2>
        {bij.length ? (
          <ul className="lijst sp-docs">
            {bij.map(s => (
              <li key={s.id} className="rij sp-bij">
                <button type="button" className="rij-knop" onClick={() => openSpullen(`spul/${encodeURIComponent(s.id)}`)}>
                  <span className="rij-inhoud"><span className="rij-titel">{s.naam}</span></span>
                </button>
                <button type="button" className="tekstknop" onClick={() => sp.ontkoppel(d.id, s.id)} aria-label={`Ontkoppelen van ${s.naam}`}>Ontkoppelen</button>
              </li>
            ))}
          </ul>
        ) : <p className="stil-tekst">Nog aan geen spul gekoppeld.</p>}
        <div className="keuzes sp-acties"><button type="button" className="knop klein stil" onClick={() => zetKoppel(true)}>Koppelen aan…</button></div>
      </section>

      <div className="detail-acties sp-onder">
        <button type="button" className="knop breed stil" onClick={() => zetBewerk(true)}>Aanpassen</button>
        {!weg ? <button type="button" className="knop breed gevaar" onClick={() => zetWeg(true)}>Verwijderen</button> : (
          <div className="detail-bevestig" role="group" aria-label="Verwijderen bevestigen">
            <p className="stil-tekst">Het document gaat naar de prullenbak en is 30 dagen terug te zetten. Daarna zijn het document en het bestand echt weg.</p>
            <button type="button" className="knop breed gevaar" onClick={() => { sp.documentVerwijderen(d.id); openSpullen('documenten'); }}>Naar de prullenbak</button>
            <button type="button" className="knop breed stil" onClick={() => zetWeg(false)}>Niet verwijderen</button>
          </div>
        )}
      </div>
      {koppel && <KoppelVenster documentId={d.id} sluit={() => zetKoppel(false)} />}
      {bewerk && <DocumentVenster bestaand={d} magZichtbaarheid={magZichtbaarheidWisselen(d, sp.ik)} sluit={() => zetBewerk(false)} />}
    </div>
  );
}

/**
 * Het bestand als blob-adres, klaargezet zodra het document opent (nooit een publieke URL, niets in de browseropslag);
 * vrijgegeven bij het sluiten. Het echte pad haalt hier later een kort geldige ondertekende link op (§6.2).
 */
function useBestand(sp: SpullenContext, d: Document | undefined): { url: string | null; staat: 'laden' | 'klaar' | 'niet-bewaard' | 'fout' } {
  const [st, zetSt] = useState<{ url: string | null; staat: 'laden' | 'klaar' | 'niet-bewaard' | 'fout' }>({ url: null, staat: 'laden' });
  useEffect(() => {
    if (!d) return;
    let weg = false, u: string | null = null;
    void sp.openBestand(d).then(b => {
      if (weg) return;
      if (b instanceof Blob) { u = URL.createObjectURL(b); zetSt({ url: u, staat: 'klaar' }); }
      else zetSt({ url: null, staat: b === 'niet-bewaard' ? 'niet-bewaard' : 'fout' });
    }, () => { if (!weg) zetSt({ url: null, staat: 'fout' }); });
    return () => { weg = true; if (u) URL.revokeObjectURL(u); };
    // Alleen opnieuw bij een ander document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d?.id]);
  return st;
}

function NietGevonden({ wat }: { wat: string }) {
  const { openSpullen } = useApp();
  return (
    <div className="scherm spullen">
      <header className="kop"><button type="button" className="terug-link" onClick={() => openSpullen('')}><IcLinks width={18} height={18} /> Spullen</button></header>
      <p className="stil-tekst" role="status">{wat} bestaat niet (meer), of je kunt het niet zien.</p>
    </div>
  );
}
