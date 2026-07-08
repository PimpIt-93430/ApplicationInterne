// Script à usage unique (admin) : télécharge la photo de chaque pin depuis Airtable
// (les URLs de pièces jointes Airtable sont signées et expirent après quelques heures,
// donc on ne peut pas juste copier l'URL) et la réhéberge dans le bucket Supabase Storage
// "stock-pins", puis met à jour `stock_pins.photo_url` avec l'URL publique permanente.
//
// Pré-requis : avoir déjà appliqué `migrations/0009_stock_pins_photos.sql` (colonne
// `airtable_record_id` + bucket `stock-pins`) et importé le catalogue via
// `scripts/seed-stock-pins.sql` (qui remplit `airtable_record_id`, utilisé ici pour
// recaler chaque photo sur la bonne ligne).
//
// Usage (PowerShell) :
//   $env:SUPABASE_URL="https://xxxx.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY="xxxx"
//   $env:AIRTABLE_API_KEY="xxxx"
//   node scripts/import-stock-photos.mjs

import { createClient } from '@supabase/supabase-js';

const AIRTABLE_BASE_ID = 'appuB9Pl5sb5ahqy7';
const AIRTABLE_TABLE_ID = 'tblxNvwokhuYLiCHw'; // Pin's à l'unité
const PHOTO_FIELD_ID = 'fldSmRSOtFPeHlrB2'; // Photo
const BUCKET = 'stock-pins';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const airtableApiKey = process.env.AIRTABLE_API_KEY;

if (!supabaseUrl || !serviceRoleKey || !airtableApiKey) {
  console.error(
    'SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY et AIRTABLE_API_KEY doivent être définis dans l\'environnement.',
  );
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function fetchTousLesPins() {
  const enregistrements = [];
  let offset;
  do {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`);
    url.searchParams.set('pageSize', '100');
    url.searchParams.append('fields[]', 'Photo');
    if (offset) url.searchParams.set('offset', offset);

    const reponse = await fetch(url, { headers: { Authorization: `Bearer ${airtableApiKey}` } });
    if (!reponse.ok) throw new Error(`Airtable a répondu ${reponse.status} : ${await reponse.text()}`);
    const donnees = await reponse.json();
    enregistrements.push(...donnees.records);
    offset = donnees.offset;
  } while (offset);
  return enregistrements;
}

function extensionDepuisType(contentType) {
  if (contentType?.includes('png')) return 'png';
  if (contentType?.includes('webp')) return 'webp';
  return 'jpg';
}

const records = await fetchTousLesPins();
const avecPhoto = records.filter((r) => Array.isArray(r.fields?.Photo) && r.fields.Photo[0]?.url);
console.log(`${records.length} pins récupérés, ${avecPhoto.length} avec une photo.`);

let ok = 0;
let echecs = 0;

for (const record of avecPhoto) {
  const photo = record.fields.Photo[0];
  try {
    const reponseImage = await fetch(photo.url);
    if (!reponseImage.ok) throw new Error(`téléchargement échoué (${reponseImage.status})`);
    const octets = new Uint8Array(await reponseImage.arrayBuffer());
    const contentType = reponseImage.headers.get('content-type') ?? photo.type ?? 'image/jpeg';
    const chemin = `${record.id}.${extensionDepuisType(contentType)}`;

    const { error: errorUpload } = await supabase.storage
      .from(BUCKET)
      .upload(chemin, octets, { contentType, upsert: true });
    if (errorUpload) throw errorUpload;

    const { data: urlPublique } = supabase.storage.from(BUCKET).getPublicUrl(chemin);

    const { error: errorMaj, count } = await supabase
      .from('stock_pins')
      .update({ photo_url: urlPublique.publicUrl }, { count: 'exact' })
      .eq('airtable_record_id', record.id);
    if (errorMaj) throw errorMaj;
    if (!count) console.warn(`Aucune ligne stock_pins pour airtable_record_id=${record.id} (photo uploadée quand même).`);

    ok += 1;
  } catch (err) {
    echecs += 1;
    console.error(`Échec pour l'enregistrement ${record.id} (${record.fields?.Name ?? '?'}) :`, err.message ?? err);
  }
}

console.log(`Terminé : ${ok} photos importées, ${echecs} échecs.`);
