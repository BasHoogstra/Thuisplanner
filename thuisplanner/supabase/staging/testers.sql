-- Thuisplanner-staging: één adres op de testerslijst zetten (testpoort G1), zodat dat account een eigen huishouden mag
-- aanmaken. Zie docs/thuisplanner-staging-overstap.md, stap 7.
--
-- Waarom zo: sinds de toegangspoort (migratie 20261021120000) loggen accounts alleen in met een e-mailcode, en mag een
-- eigen huishouden alleen wie op de testerslijst staat (zolang huishouden_open uit staat). Huishouden aanmaken,
-- uitnodigen en accepteren gebeuren daarna gewoon in de app, met alle regels en controles. Dit script maakt dus geen
-- accounts, huishoudens of uitnodigingen aan en zet niets in de inhoudstabellen.
-- Alleen de eigenaar van het huishouden hoeft op de lijst; wie een uitnodiging accepteert (Sanne), niet.
--
-- Gebruik (in het Supabase-dashboard van het STAGINGproject, SQL Editor; nooit op een ander project):
--   1. Controleer bovenin het dashboard dat je in de organisatie Thuisplanner zit, project thuisplanner-staging.
--   2. Plak dit script, vul hieronder het adres in (alleen in het dashboard; niet in de repository of de chat), Run.
--   3. Klaar als de laatste regel "testerslijst: … adres(sen)" toont. Nog eens draaien kan geen kwaad.
-- Weghalen: delete from private.testers where email = lower(btrim('<adres>'));

begin;

-- ▼▼ invullen ▼▼
select set_config('tp.email', 'jouw-adres@example.com', true);
-- ▲▲ invullen ▲▲

do $$
declare
  adres text := lower(btrim(current_setting('tp.email')));
begin
  if to_regclass('private.testers') is null or to_regclass('private.instellingen') is null then
    raise exception 'De toegangspoort (migratie 20261021120000) staat nog niet op dit project: eerst de migraties bijwerken.';
  end if;
  if adres like '%@example.com' then
    raise exception 'Vul eerst het echte adres in (tp.email).';
  end if;
  if (select wachtwoordsessies_toegestaan from private.instellingen where id = 1) then
    raise exception 'Wachtwoordsessies staan aan: dat hoort nooit online. Er is niets gewijzigd.';
  end if;
  insert into private.testers (email) values (adres) on conflict (email) do nothing;
end $$;

select 'testerslijst: ' || count(*) || ' adres(sen); huishouden_open '
       || (select huishouden_open::text from private.instellingen where id = 1)
  from private.testers;

commit;
