-- Herstelronde (review): bezorgmeldingen die vóór het opslaan van het verzendantwoord binnenkomen, en dubbele meldingen.
-- Draait na de migraties (run.sh of een eigen tijdelijke database), in één transactie die wordt teruggedraaid.
-- Rijen worden zonder huishouden/uitnodiging aangemaakt: session_replication_role = replica slaat de sleutelcontroles
-- over, de hele toets lang (PostgreSQL controleert de sleutel opnieuw bij een tweede update van een rij uit dezelfde
-- transactie). Wat hier getest wordt, de toestanden en de vroege meldingen, hangt daar niet van af.
begin;
set local session_replication_role = replica;
insert into private.uitnodigingsmails (id, invite_id, household_id, nummer, status, pogingen, bezig_tot)
values ('00000000-0000-0000-0000-0000000000a1', gen_random_uuid(), gen_random_uuid(), 1, 'bezig', 1, now() + interval '2 minutes'),
       ('00000000-0000-0000-0000-0000000000a2', gen_random_uuid(), gen_random_uuid(), 1, 'bezig', 1, now() + interval '2 minutes'),
       ('00000000-0000-0000-0000-0000000000a3', gen_random_uuid(), gen_random_uuid(), 1, 'bezig', 1, now() + interval '2 minutes'),
       ('00000000-0000-0000-0000-0000000000a4', gen_random_uuid(), gen_random_uuid(), 1, 'bezig', 1, now() + interval '2 minutes');

create function pg_temp.moet(ok boolean, wat text) returns void language plpgsql as $$
begin if not coalesce(ok, false) then raise exception 'MISLUKT: %', wat; end if; end $$;
create function pg_temp.status(p uuid) returns text language sql as $$ select status from private.uitnodigingsmails where id = p $$;

-- B1: "bezorgd" komt binnen vóór het verzendantwoord; daarna het antwoord: de mail is bezorgd.
select pg_temp.moet(public.uitnodigingsmail_bezorging('lm-a1', 'bezorgd') = 0, 'B1 melding vóór antwoord geeft 0 (nog geen mail)');
select public.uitnodigingsmail_klaar('00000000-0000-0000-0000-0000000000a1', 'aangenomen', 'lm-a1', null, false);
select pg_temp.moet(pg_temp.status('00000000-0000-0000-0000-0000000000a1') = 'bezorgd', 'B1 na het antwoord: bezorgd');
select pg_temp.moet((select bezorgd_op is not null from private.uitnodigingsmails where id = '00000000-0000-0000-0000-0000000000a1'), 'B1 bezorgd_op gezet');
select pg_temp.moet(not exists (select 1 from private.uitnodigingsmail_vroege_meldingen where bericht_id = 'lm-a1'), 'B1 vroege melding opgeruimd');

-- B2: "niet bezorgd" vóór het antwoord, twee keer (dubbele melding): niet bezorgd, één bewaarde rij.
select public.uitnodigingsmail_bezorging('lm-a2', 'niet_bezorgd');
select public.uitnodigingsmail_bezorging('lm-a2', 'niet_bezorgd');
select pg_temp.moet((select count(*) from private.uitnodigingsmail_vroege_meldingen where bericht_id = 'lm-a2') = 1, 'B2 dubbel: één bewaarde rij');
select public.uitnodigingsmail_klaar('00000000-0000-0000-0000-0000000000a2', 'aangenomen', 'lm-a2', null, false);
select pg_temp.moet(pg_temp.status('00000000-0000-0000-0000-0000000000a2') = 'niet_bezorgd', 'B2 na het antwoord: niet bezorgd');

-- B3: "bezorgd" en daarna "niet bezorgd", beide vóór het antwoord: niet bezorgd gaat voor; omgekeerd blijft niet bezorgd.
select public.uitnodigingsmail_bezorging('lm-a3', 'bezorgd');
select public.uitnodigingsmail_bezorging('lm-a3', 'niet_bezorgd');
select public.uitnodigingsmail_bezorging('lm-a3', 'bezorgd');
select public.uitnodigingsmail_klaar('00000000-0000-0000-0000-0000000000a3', 'aangenomen', 'lm-a3', null, false);
select pg_temp.moet(pg_temp.status('00000000-0000-0000-0000-0000000000a3') = 'niet_bezorgd', 'B3 niet bezorgd gaat voor bezorgd');

-- B4: de gewone volgorde (eerst het antwoord, dan de melding), plus een dubbele melding achteraf.
select public.uitnodigingsmail_klaar('00000000-0000-0000-0000-0000000000a4', 'aangenomen', 'lm-a4', null, false);
select pg_temp.moet(public.uitnodigingsmail_bezorging('lm-a4', 'bezorgd') = 1, 'B4 melding na antwoord: 1 rij');
select pg_temp.moet(public.uitnodigingsmail_bezorging('lm-a4', 'bezorgd') = 0, 'B4 dubbele melding: 0 rijen');
select pg_temp.moet(pg_temp.status('00000000-0000-0000-0000-0000000000a4') = 'bezorgd', 'B4 bezorgd');
select pg_temp.moet(not exists (select 1 from private.uitnodigingsmail_vroege_meldingen where bericht_id = 'lm-a4'), 'B4 een dubbele melding van een bekende mail wordt niet bewaard');
select pg_temp.moet(public.uitnodigingsmail_bezorging('lm-a4', 'niet_bezorgd') = 1, 'B4 bounce na aflevering: 1 rij');
select pg_temp.moet(pg_temp.status('00000000-0000-0000-0000-0000000000a4') = 'niet_bezorgd', 'B4 bounce na bezorgd: niet bezorgd');

-- B5: een melding voor een onbekend bericht (bijvoorbeeld een codemail) blijft hoogstens 1 dag bewaard.
select public.uitnodigingsmail_bezorging('lm-onbekend-oud', 'bezorgd');
update private.uitnodigingsmail_vroege_meldingen set ontvangen = now() - interval '2 days' where bericht_id = 'lm-onbekend-oud';
select public.uitnodigingsmail_bezorging('lm-onbekend-nieuw', 'bezorgd');
select pg_temp.moet(not exists (select 1 from private.uitnodigingsmail_vroege_meldingen where bericht_id = 'lm-onbekend-oud'), 'B5 ouder dan 1 dag opgeruimd');
select pg_temp.moet(exists (select 1 from private.uitnodigingsmail_vroege_meldingen where bericht_id = 'lm-onbekend-nieuw'), 'B5 recente bewaard');

-- B6: de bewaarde meldingen zijn niet leesbaar voor de app-rollen.
select pg_temp.moet(not has_table_privilege('authenticated', 'private.uitnodigingsmail_vroege_meldingen', 'select'), 'B6 authenticated leest niet');
select pg_temp.moet(not has_table_privilege('anon', 'private.uitnodigingsmail_vroege_meldingen', 'select'), 'B6 anon leest niet');

select 'herstel_bezorgmeldingen: 6 van 6 scenario''s geslaagd' as uitslag;
rollback;
