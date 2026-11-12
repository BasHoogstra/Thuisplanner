// Typen voor spullen-opslag.js (Mijn spullen & Documenten: bestanden bewaren en openen).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Sync } from './thuisplanner-sync.js';

export declare const BUCKET: 'documenten';
export declare const LINK_SECONDEN: number;
export declare function padVan(huishoudenId: string, documentId: string): string;

export interface OpslagResultaat {
  ok: boolean;
  /** Bij een fout: welke stap (offline, spul, begin, upload, controle, bevestigen, koppelen). */
  fase?: string;
  /** Heeft opnieuw proberen zin (met hetzelfde document)? */
  opnieuw?: boolean;
  /** Een vaste Nederlandse melding, nooit de ruwe fout. */
  tekst?: string;
  documentId?: string;
  spulId?: string;
  /** Bij een fout bij het koppelen: het document zelf is wel bewaard. */
  bewaard?: boolean;
}

export interface SpullenOpslagSupabase {
  padVan(documentId: string): string;
  bewaarDocument(n: { documentId: string; velden: Record<string, unknown>; bytes: Blob | Uint8Array; spullen?: string[];
    nieuwSpul?: { id: string; velden: Record<string, unknown> } | null }): Promise<OpslagResultaat>;
  opnieuwUploaden(documentId: string, bytes: Blob | Uint8Array, mime: string): Promise<OpslagResultaat>;
  openBestand(documentId: string): Promise<{ ok: true; blob: Blob } | { ok: false; tekst: string }>;
}

export declare function maakSpullenOpslag(o: { supabase: SupabaseClient; sync: Pick<Sync, 'acties' | 'vernieuw'>; huishoudenId: string;
  nieuweId: () => string }): SpullenOpslagSupabase;
