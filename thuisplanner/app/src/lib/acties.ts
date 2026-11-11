// KG-5E licht: één datapad. De schermen lezen `Staat` en roepen `Acties` aan; ze weten niet of de demo (store.ts, alles
// in het geheugen van dit tabblad) of de echte opslag (lokaal/staat.ts, via de sync-module en de server) erachter zit.
//
// Regels:
// - Elke domeinhandeling staat hier één keer, met dezelfde betekenis in de demo en online. Beide kanten zijn met
//   `satisfies Acties` aan dit contract gebonden: een handeling die er aan één kant ontbreekt, is een typefout.
//   Een nieuw domein (Plannen) voegt zijn handelingen hier toe en bouwt ze aan beide kanten; geen tweede datapad.
// - Wat alleen voor de demo bestaat (een andere voorbeelddag kiezen, alles vervangen), staat in `DemoExtra` en bereikt
//   de schermen alleen via `AppContext.demo`. Online is dat er niet, ook niet als lege functie.
// - "Ongedaan maken" is een mogelijkheid, geen belofte: een melding met `ongedaan: true` betekent dat `ongedaan()`
//   precies die wijziging terugdraait. Een handeling die dat (online) niet veilig kan, meldt zonder `ongedaan`; de knop
//   verschijnt dan niet. Zie tests/acties-contract.test.tsx.
import type { Scenario } from '../data/demo';
import type { Gegevens, Groep, Melding } from './store';
import type { Afspraak, Boodschap, Datum, Item, PakDoel, Pakitem, Paklijst, Plan, PlanOnderdeel, Vakantie, VakantieKoppeling } from './types';

/** Wat de schermen lezen: de gedeelde gegevens plus wat alleen dit toestel weet (weggeklikt, de melding). */
export interface Staat extends Gegevens {
  /** Weggeklikte meedenk-signalen (alleen op dit toestel). */
  weggeklikt: Set<string>;
  melding: Melding | null;
}

/** Alle domeinhandelingen, in de demo en online. */
export interface Acties {
  // ---- Afspraken, taken en boodschappen ----
  toevoegen: (items: Item[], melding?: string) => void;
  bijwerken: (item: Item, melding?: string) => void;
  /** Afvinken of weer openzetten (taak of boodschap). */
  wissel: (id: string, melding?: string) => void;
  verwijder: (ids: string[], melding?: string) => void;
  voegBoodschappenToe: (namen: string[], vakantieId?: string, later?: boolean) => void;
  /** Tussen "Nu te kopen" en "Later nodig". */
  boodschapLater: (b: Boodschap, later: boolean) => void;
  wijzigVoorkomen: (reeksId: string, datum: Datum, afspraak: Afspraak, melding?: string) => void;
  verwijderVoorkomen: (reeksId: string, datum: Datum, melding?: string) => void;
  verwijderReeks: (reeksId: string, melding?: string) => void;

  // ---- Meldingen en meedenk-signalen ----
  /** Draait de wijziging van de huidige melding terug; alleen zinvol als die melding `ongedaan` heeft. */
  ongedaan?: () => void;
  wegklikken: (id: string) => void;
  meld: (tekst: string) => void;
  meldingWeg: (id: number) => void;

  // ---- Vakanties (F8) ----
  /** Geeft het id van de nieuwe vakantie (om haar meteen te openen), of null. */
  vakantieToevoegen: (v: Omit<Vakantie, 'id'>) => Promise<string | null>;
  vakantieBijwerken: (v: Vakantie, melding?: string) => void;
  vakantieVerwijderen: (v: Vakantie) => void;
  pakitemToevoegen: (vakantieId: string, doel: PakDoel, naam: string) => void;
  pakitemWissel: (p: Pakitem) => void;
  pakitemBijwerken: (p: Pakitem, wijziging: { naam?: string; doel?: PakDoel }) => void;
  pakitemVerwijderen: (p: Pakitem) => void;
  /** lijsten: extra lijsten van de bron die mee moeten (alleen bij iedereen). */
  paklijstOvernemen: (van: string, naar: string, groep: Groep, lijsten?: string[]) => void;
  /** Geeft het id van de nieuwe lijst, of null (een naam die niet kan, geeft een melding). */
  paklijstToevoegen: (vakantieId: string, naam: string) => Promise<string | null>;
  paklijstHernoemen: (l: Paklijst, naam: string) => void;
  paklijstVerwijderen: (l: Paklijst) => void;
  vinkjesOpnieuw: (vakantieId: string, groep: Groep) => void;
  boodschapOntkoppelen: (k: VakantieKoppeling, naam: string) => void;
  /** Een afgelopen vakantie tonen (online: haar paklijst ophalen). */
  vakantieOpenen: (id: string) => Promise<void>;
  vakantieSluiten: (id: string) => void;

  // ---- Plannen (besluit 18). De taken van een plan zijn gewone items (toevoegen, bijwerken, wissel). ----
  /** Geeft het id van het nieuwe plan (om het meteen te openen), of null. */
  planToevoegen: (p: Omit<Plan, 'id'>) => Promise<string | null>;
  planBijwerken: (p: Plan, melding?: string) => void;
  /** metTaken: ook de taken weg (anders blijven ze als losse taken). */
  planVerwijderen: (p: Plan, metTaken: boolean) => void;
  /** Geeft het id van het nieuwe onderdeel, of null. */
  onderdeelToevoegen: (planId: string, naam: string) => Promise<string | null>;
  onderdeelHernoemen: (o: PlanOnderdeel, naam: string) => void;
  onderdeelVerplaatsen: (o: PlanOnderdeel, richting: -1 | 1) => void;
  onderdeelVerwijderen: (o: PlanOnderdeel) => void;
}

/** Alleen in de demo: voorbeelddagen kiezen en alles vervangen. Nooit online. */
export interface DemoExtra {
  scenario: Scenario;
  kiesScenario: (scenario: Scenario, melding: string) => void;
  vervangAlles: (items: Item[], melding?: string) => void;
}
