-- Thuisplanner: inzage en kopie op verzoek (AVG, docs/thuisplanner-beta-voorbereiding.md §5.4). ALLEEN LEZEND.
--
-- Gebruik: de producteigenaar opent de SQL-editor van het juiste project (kijk het kenmerk na), vervangt hieronder
-- VUL-HIER-HET-ADRES-IN door het adres van het account dat om inzage vraagt, en voert de query uit. De uitkomst is één
-- JSON-document; dat gaat per mail naar dat adres, en naar niemand anders. Bewaar het daarna niet.
-- Alleen een verzoek vanaf het adres van het account zelf (§5.4, identiteit).
--
-- Wat erin staat: het account (adres, data), het profiel, of het adres op de testerslijst staat, de bekende toestellen
-- (alleen data, geen token), en per huishouden waarvan het account actief lid is: het huishouden, de leden, de
-- afspraken, taken, boodschappen, vakanties (met paklijsten), spullen, documenten (zonder de bestanden zelf; die
-- staan in de opslag en gaan apart mee als daarom gevraagd wordt) en plannen. Daarnaast de uitnodigingen die het
-- account maakte (zonder het adres van een ander) en de open uitnodigingen aan dit adres.
--
-- De grens: NOOIT MEER DAN HET ACCOUNT IN DE APP MAG ZIEN. Privé-afspraken, persoonlijke spullen en persoonlijke
-- documenten van een ander lid staan er niet in, ook niet als "Bezet". Ook geen account-id's of adressen van anderen,
-- en geen codes, hashes of tokens. Een gearchiveerd lidmaatschap geeft alleen de naam van het huishouden en de datum.
--
-- Eén select: schrijft niets (de test voert hem uit in een alleen-lezende transactie). Geen account bij het adres:
-- de uitkomst zegt dat, met alleen de testerslijst en de open uitnodigingen.
with invoer as (
  select lower(btrim('VUL-HIER-HET-ADRES-IN')) as adres
),
acc as (
  select u.id, u.email, u.created_at, u.email_confirmed_at, u.last_sign_in_at
  from auth.users u, invoer i where lower(u.email) = i.adres
),
mijn_lid as (   -- actieve lidmaatschappen: daar ziet het account de inhoud
  select m.household_id, m.id as lid_id, m.role, m.display_name
  from public.household_members m join acc on m.user_id = acc.id
  where m.status = 'active'
),
weg_lid as (    -- gearchiveerde lidmaatschappen: daar ziet het account niets meer
  select m.household_id, m.archived_at
  from public.household_members m join acc on m.user_id = acc.id
  where m.status = 'archived'
),
-- Afspraken die het account mag zien: gedeeld, of de eigen privé-afspraak (zoals events_select en event_details_visible).
mijn_afspraak as (
  select e.* from public.events e join mijn_lid l on l.household_id = e.household_id
  where e.visibility = 'household' or e.owner_member_id = l.lid_id
)
select jsonb_pretty(jsonb_build_object(
  'soort', 'Thuisplanner: kopie van de eigen gegevens (AVG)',
  'gemaakt', now(),
  'adres', (select adres from invoer),
  'account', (select jsonb_build_object('adres', email, 'aangemaakt', created_at, 'bevestigd', email_confirmed_at,
                                         'laatst_ingelogd', last_sign_in_at) from acc),
  'opmerking', case when not exists (select 1 from acc) then 'Bij dit adres hoort geen account.' end,
  'profiel', (select jsonb_build_object('weergavenaam', p.display_name, 'aangemaakt', p.created_at, 'gewijzigd', p.updated_at)
              from public.profiles p join acc on p.user_id = acc.id),
  -- Besluit 20 (migratie 20261124120000): de persoonlijke instellingen van dit account.
  'persoonlijke_instellingen', (select jsonb_build_object('instellingen', a.prefs, 'aangemaakt', a.created_at, 'gewijzigd', a.updated_at)
                                from public.account_preferences a join acc on a.user_id = acc.id),
  'op_de_testerslijst', exists (select 1 from private.testers t, invoer i where t.email = i.adres),
  'bekende_toestellen', coalesce((select jsonb_agg(jsonb_build_object('sinds', t.gemaakt, 'laatst_gebruikt', t.laatst_gebruikt,
                                     'ingetrokken', t.ingetrokken) order by t.gemaakt)
                                  from private.k1_toestellen t join acc on t.user_id = acc.id), '[]'::jsonb),
  'open_uitnodigingen_aan_dit_adres', coalesce((select jsonb_agg(jsonb_build_object('huishouden', h.name, 'gemaakt', i.created_at,
                                     'verloopt', i.expires_at) order by i.created_at)
                                  from public.household_invites i join public.households h on h.id = i.household_id, invoer v
                                  where i.invited_email = v.adres), '[]'::jsonb),
  'vroegere_huishoudens', coalesce((select jsonb_agg(jsonb_build_object('huishouden', h.name, 'gearchiveerd', w.archived_at))
                                  from weg_lid w join public.households h on h.id = w.household_id), '[]'::jsonb),
  'huishoudens', coalesce((select jsonb_agg(jsonb_build_object(
      'naam', h.name,
      'aangemaakt', h.created_at,
      'mijn_rol', l.role,
      'mijn_naam_in_het_huishouden', l.display_name,
      'leden', (select jsonb_agg(jsonb_build_object('naam', m.display_name, 'soort', m.kind, 'rol', m.role, 'status', m.status,
                  'met_account', m.user_id is not null, 'id', m.id) order by m.sort, m.display_name)
                from public.household_members m where m.household_id = h.id),
      'afspraken', coalesce((select jsonb_agg(
                  (to_jsonb(e) - array['household_id', 'owner_user_id'])
                  || jsonb_build_object('titel', d.title, 'locatie', d.location, 'notities', d.notes, 'voorbereiding', d.preparation,
                       'voor_wie', (select jsonb_agg(p.member_id) from public.event_participants p where p.event_id = e.id),
                       'overgeslagen_data', (select jsonb_agg(x.occurrence_date order by x.occurrence_date)
                                             from public.event_exceptions x where x.series_id = e.id))
                  order by e.start_date, e.start_time)
                from mijn_afspraak e left join public.event_details d on d.event_id = e.id
                where e.household_id = h.id), '[]'::jsonb),
      'taken', coalesce((select jsonb_agg(to_jsonb(t) - 'household_id' order by t.created_at)
                from public.tasks t where t.household_id = h.id), '[]'::jsonb),
      'boodschappen', coalesce((select jsonb_agg(to_jsonb(s) - array['household_id', 'name_key'] order by s.created_at)
                from public.shopping_items s where s.household_id = h.id), '[]'::jsonb),
      'vakanties', coalesce((select jsonb_agg((to_jsonb(v) - 'household_id') || jsonb_build_object(
                    'paklijsten', (select jsonb_agg(to_jsonb(pl) - array['household_id', 'name_key'] order by pl.created_at)
                                   from public.trip_packing_lists pl where pl.trip_id = v.id and pl.household_id = h.id),
                    'inpakken', (select jsonb_agg(to_jsonb(pi) - array['household_id', 'name_key'] order by pi.created_at)
                                 from public.trip_packing_items pi where pi.trip_id = v.id and pi.household_id = h.id),
                    'boodschappen_voor_de_vakantie', (select jsonb_agg(to_jsonb(sl) - 'household_id' order by sl.created_at)
                                 from public.trip_shopping_links sl where sl.trip_id = v.id and sl.household_id = h.id))
                  order by v.start_date, v.created_at)
                from public.trips v where v.household_id = h.id), '[]'::jsonb),
      'spullen', coalesce((select jsonb_agg(to_jsonb(p) - array['household_id', 'owner_user_id'] order by p.created_at)
                from public.possessions p
                where p.household_id = h.id and (p.visibility = 'household' or p.owner_member_id = l.lid_id)), '[]'::jsonb),
      'documenten', coalesce((select jsonb_agg((to_jsonb(d) - array['household_id', 'owner_user_id'])
                  || jsonb_build_object('bij_spullen', (select jsonb_agg(k.possession_id) from public.document_links k
                                                        where k.document_id = d.id and k.household_id = h.id and k.deleted_at is null))
                  order by d.created_at)
                from public.documents d
                where d.household_id = h.id and (d.visibility = 'household' or d.owner_member_id = l.lid_id)), '[]'::jsonb),
      'plannen', coalesce((select jsonb_agg((to_jsonb(p) - 'household_id') || jsonb_build_object(
                    'onderdelen', (select jsonb_agg(to_jsonb(s) - 'household_id' order by s.position)
                                   from public.plan_sections s where s.plan_id = p.id and s.household_id = h.id))
                  order by p.created_at)
                from public.plans p where p.household_id = h.id), '[]'::jsonb),
      'uitnodigingen_die_ik_maakte', coalesce((select jsonb_agg(jsonb_build_object('gemaakt', i.created_at, 'verloopt', i.expires_at,
                  'rol', i.role, 'met_adres', i.invited_email is not null, 'geaccepteerd', i.accepted_at, 'ingetrokken', i.revoked_at)
                  order by i.created_at)
                from public.household_invites i join acc on i.created_by = acc.id where i.household_id = h.id), '[]'::jsonb)
    ) order by h.name)
    from mijn_lid l join public.households h on h.id = l.household_id), '[]'::jsonb)
)) as avg_export;
