-- Thuisplanner: alleen voor de LOKALE ontwikkelstack (supabase start / supabase db reset). Supabase
-- voert dit bestand nooit uit bij `db push` naar een online project (verbinding.ps1 gebruikt geen --include-seed).
--
-- De fictieve lokale accounts (scripts/lokaal.mjs, de integratietests) loggen met een wachtwoord in, en maken vrij
-- huishoudens aan. Op staging, bèta en productie staan beide uit (standaardwaarden van de migratie
-- 20261021120000_toegangspoort.sql); de nacontrole (staging/verbinding-controle.mjs na) controleert dat.
update private.instellingen set wachtwoordsessies_toegestaan = true, huishouden_open = true;
