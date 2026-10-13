import { useApp, type Scherm } from '../lib/context';
import { IcAgenda, IcBoodschappen, IcMeer, IcPlus, IcVandaag } from './Iconen';

const ITEMS: { id: Scherm; label: string; Icoon: typeof IcVandaag }[] = [
  { id: 'vandaag', label: 'Vandaag', Icoon: IcVandaag },
  { id: 'agenda', label: 'Agenda', Icoon: IcAgenda },
  { id: 'boodschappen', label: 'Boodschappen', Icoon: IcBoodschappen },
  { id: 'meer', label: 'Meer', Icoon: IcMeer },
];

/**
 * Mobiel: een tabbalk onderaan met de toevoegknop in het midden.
 * Desktop: dezelfde vier bestemmingen als zijbalk, met de toevoegknop bovenaan.
 */
export function Navigatie({ actief }: { actief: Scherm }) {
  const { gaNaar, openToevoegen, huishouden } = useApp();
  const link = ({ id, label, Icoon }: (typeof ITEMS)[number]) => (
    <a key={id} href={`#/${id}`} className="nav-item" aria-current={actief === id ? 'page' : undefined}
      onClick={e => { e.preventDefault(); gaNaar(id); }}>
      <Icoon />
      <span>{label}</span>
    </a>
  );
  return (
    <nav className="nav" aria-label="Hoofdnavigatie">
      <div className="nav-merk" aria-hidden="true">
        <span className="merk-teken">K</span>
        <span className="merk-naam">KomtGoed<small>{huishouden.naam}</small></span>
      </div>
      <button className="nav-plus" onClick={() => openToevoegen()} aria-label="Toevoegen">
        <IcPlus />
        <span className="nav-plus-tekst">Toevoegen</span>
      </button>
      <div className="nav-lijst">
        {link(ITEMS[0])}
        {link(ITEMS[1])}
        <span className="nav-gat" aria-hidden="true" />
        {link(ITEMS[2])}
        {link(ITEMS[3])}
      </div>
    </nav>
  );
}
