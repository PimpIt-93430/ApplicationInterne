-- Ajoute une référence à l'enregistrement Airtable d'origine (pour recaler les photos
-- après coup, les pièces jointes Airtable n'étant accessibles que via des URLs signées
-- temporaires) et crée le bucket de stockage public pour les photos de pins.

alter table public.stock_pins
  add column if not exists airtable_record_id text unique;

insert into storage.buckets (id, name, public)
values ('stock-pins', 'stock-pins', true)
on conflict (id) do nothing;
