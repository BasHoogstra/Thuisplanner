-- Thuisplanner (map komtgoed) · Architectuurcontrole van 15 oktober 2026, K2: index op
-- event_exceptions voor het ophalen per huishouden. Zie docs/thuisplanner-architectuurcontrole.md.
--
-- Probleem: de primaire sleutel van event_exceptions is (series_id, occurrence_date). De sync haalt bij
-- elke volledige ophaalronde de uitzonderingen per huishouden op (filter op household_id); zonder index
-- die met household_id begint, wordt dat een scan over de uitzonderingen van álle huishoudens. Ook de
-- verwijzing (household_id, series_id) naar events had geen index; het cascaderend verwijderen van een
-- afspraak of huishouden zocht daardoor eveneens de hele tabel af.
--
-- Oplossing: één index die met household_id begint en de verwijzing dekt. Geen gedragswijziging.

create index event_exceptions_household_idx
  on public.event_exceptions (household_id, series_id, occurrence_date);
