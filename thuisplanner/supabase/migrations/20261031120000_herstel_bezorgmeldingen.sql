-- Thuisplanner, herstelronde (review): een bezorgmelding van de mailaanbieder die binnenkomt VÓÓRDAT het verzendantwoord
-- (het bericht-id) is opgeslagen, ging verloren. uitnodigingsmail_bezorging zocht de mail op bericht_id; dat zet
-- uitnodigingsmail_klaar pas na het antwoord van de aanbieder. Een snelle webhook vond dan geen rij, kreeg toch 200 en
-- de aanbieder herhaalde hem niet. Deze migratie wijzigt geen eerdere migratie; ze vervangt alleen de twee functies.
--
-- Oplossing:
-- 1. Een melding zonder bekende mail wordt kort bewaard (private.uitnodigingsmail_vroege_meldingen: alleen het bericht-id
--    van de aanbieder, de uitkomst en het tijdstip; geen adres of inhoud). Na 1 dag gaat hij weg (er komt dan nooit meer
--    een verzendantwoord, of de melding hoorde bij een andere mail, bijvoorbeeld een code).
-- 2. uitnodigingsmail_klaar past bij "aangenomen" meteen een bewaarde melding toe en ruimt hem op.
-- 3. Beide functies nemen per bericht-id hetzelfde transactieslot (advisory lock), zodat een melding en het opslaan van
--    het antwoord elkaar nooit missen, ook niet als ze tegelijk lopen.
-- 4. Dubbele meldingen zijn onschadelijk: dezelfde uitkomst nog eens verandert niets; "niet bezorgd" gaat voor
--    "bezorgd" (zoals al gold na aflevering: een bounce na een eerdere "bezorgd").

create table private.uitnodigingsmail_vroege_meldingen (
  bericht_id text primary key check (length(bericht_id) between 1 and 200),
  uitkomst   text not null check (uitkomst in ('bezorgd', 'niet_bezorgd')),
  ontvangen  timestamptz not null default now()
);
alter table private.uitnodigingsmail_vroege_meldingen enable row level security;
revoke all on table private.uitnodigingsmail_vroege_meldingen from public, anon, authenticated;

-- Het slot per bericht-id (binnen de transactie; vrij bij commit of rollback).
create function private.uitnodigingsmail_slot(p_bericht text)
returns void language sql security definer set search_path = '' as $$
  select pg_advisory_xact_lock(hashtextextended('thuisplanner-uitnodigingsmail:' || p_bericht, 0))
$$;
revoke all on function private.uitnodigingsmail_slot(text) from public, anon, authenticated;

create or replace function private.uitnodigingsmail_klaar(p_id uuid, p_uitkomst text, p_bericht text, p_wacht_s integer, p_idempotent boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_bericht text := left(p_bericht, 200);
  v_vroeg text;
  n integer;
begin
  if p_uitkomst not in ('aangenomen', 'opnieuw', 'onzeker', 'mislukt') then
    raise exception 'Onbekende uitkomst' using errcode = '22023';
  end if;
  if p_uitkomst = 'aangenomen' and v_bericht is not null then
    perform private.uitnodigingsmail_slot(v_bericht);
  end if;
  update private.uitnodigingsmails m set
    status = case
      when p_uitkomst = 'aangenomen' then 'aangenomen'
      when p_uitkomst = 'mislukt' then 'mislukt'
      when p_uitkomst = 'opnieuw' then case when m.pogingen >= 4 then 'mislukt' else 'wacht' end
      else case when p_idempotent and m.pogingen < 4 then 'wacht' else 'onzeker' end end,
    volgende = case when p_uitkomst = 'opnieuw' or (p_uitkomst = 'onzeker' and p_idempotent)
      then now() + greatest(private.uitnodigingsmail_wachttijd(m.pogingen), make_interval(secs => least(coalesce(p_wacht_s, 0), 3600)))
      else m.volgende end,
    aangenomen_op = case when p_uitkomst = 'aangenomen' then now() else m.aangenomen_op end,
    bericht_id = case when p_uitkomst = 'aangenomen' then v_bericht else m.bericht_id end,
    bezig_tot = null
  where m.id = p_id and m.status = 'bezig';
  get diagnostics n = row_count;
  -- Een melding die al vóór dit antwoord binnenkwam: nu toepassen.
  if n > 0 and p_uitkomst = 'aangenomen' and v_bericht is not null then
    delete from private.uitnodigingsmail_vroege_meldingen v where v.bericht_id = v_bericht returning v.uitkomst into v_vroeg;
    if v_vroeg is not null then
      update private.uitnodigingsmails m set status = v_vroeg,
          bezorgd_op = case when v_vroeg = 'bezorgd' then now() else m.bezorgd_op end
        where m.id = p_id and m.status = 'aangenomen';
    end if;
  end if;
end $$;

create or replace function private.uitnodigingsmail_bezorging(p_bericht text, p_uitkomst text)
returns integer language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  if p_uitkomst not in ('bezorgd', 'niet_bezorgd') then raise exception 'Onbekende uitkomst' using errcode = '22023'; end if;
  if p_bericht is null or length(p_bericht) not between 1 and 200 then raise exception 'Ongeldig bericht' using errcode = '22023'; end if;
  perform private.uitnodigingsmail_slot(p_bericht);
  update private.uitnodigingsmails m set status = p_uitkomst,
      bezorgd_op = case when p_uitkomst = 'bezorgd' then now() else m.bezorgd_op end
    where m.bericht_id = p_bericht
      and (m.status in ('aangenomen', 'onzeker') or (m.status = 'bezorgd' and p_uitkomst = 'niet_bezorgd'));
  get diagnostics n = row_count;
  -- Nog geen mail met dit bericht-id: het verzendantwoord is (nog) niet opgeslagen. Bewaren tot het komt (hoogstens 1 dag).
  if n = 0 and not exists (select 1 from private.uitnodigingsmails m where m.bericht_id = p_bericht) then
    delete from private.uitnodigingsmail_vroege_meldingen v where v.ontvangen < now() - interval '1 day';
    insert into private.uitnodigingsmail_vroege_meldingen as v (bericht_id, uitkomst) values (p_bericht, p_uitkomst)
      on conflict (bericht_id) do update set uitkomst = case when excluded.uitkomst = 'niet_bezorgd' then 'niet_bezorgd' else v.uitkomst end;
  end if;
  return n;
end $$;
