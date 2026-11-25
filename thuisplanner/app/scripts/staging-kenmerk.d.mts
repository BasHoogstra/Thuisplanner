// Typen voor scripts/staging-kenmerk.mjs (gebruikt door scripts/staging-build.ts en de tests).
export type Omgevingen = Record<string, { supabaseRef?: string | null } | string | undefined>;
export const ONLINE: readonly ('staging' | 'beta' | 'productie')[];
export const BUILDNAAM: Record<'staging' | 'beta' | 'productie', string>;
export function leesOmgevingen(): Omgevingen;
export function kenmerkFouten(url: string | undefined, omgevingen: Omgevingen, omgeving?: string): string[];
