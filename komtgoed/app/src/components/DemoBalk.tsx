import { useApp } from '../lib/context';

/** Altijd zichtbaar, maar klein: dit is een demo met verzonnen gegevens. */
export function DemoBalk() {
  const { gaNaar } = useApp();
  return (
    <div className="demobalk" role="note">
      <span className="demo-label">Demo</span>
      <span className="demobalk-tekst">Fictief gezin · niets wordt opgeslagen</span>
      <a href="#/meer" onClick={e => { e.preventDefault(); gaNaar('meer'); }}>Uitleg</a>
    </div>
  );
}
