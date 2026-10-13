// Typen voor scripts/lokaal-platform.mjs (gebruikt door vite.config.ts en de tests).
import type { NetworkInterfaceInfo } from 'node:os';
import type { ProxyOptions } from 'vite';

export function isHoofdscript(url: string, argv1: string | undefined): boolean;
export function viteOpdracht(args: string[]): [string, string[]];
export function supabaseOpdracht(supabase: string | undefined): string;
export function leesStatus(uit: string): { API_URL?: string; ANON_KEY?: string; SERVICE_ROLE_KEY?: string };
export function supabaseProxy(doel: string | undefined): Record<string, ProxyOptions>;
export function isPriveAdres(adres: string): boolean;
export function lanAdressen(interfaces?: NodeJS.Dict<NetworkInterfaceInfo[]>): { naam: string; adres: string }[];
