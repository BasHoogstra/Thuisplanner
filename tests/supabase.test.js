// Stap 1.1: Supabase-migraties in de repository en geen geheime sleutels.
// Deze tests hebben geen browser of netwerk nodig.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');
const { assert } = require('./lib');

const ROOT = path.resolve(__dirname, '..');
const MIG = path.join(ROOT, 'supabase', 'migrations');

// Migraties die al in productie zijn uitgevoerd mogen nooit meer veranderen: een wijziging hoort in
// een nieuwe migratie. md5 zoals in productie (supabase_migrations.schema_migrations, 2 okt 2026).
//
// Bewuste uitzondering: 20261002064401. De productie-md5 van dat bestand is
//   d8f582e182523642a7c907c69f8190f7
// Het bestand is daarna aangepast (pgcrypto expliciet + extensions.gen_random_bytes), omdat de
// Supabase CLI migraties uitvoert als cli_login_postgres zonder 'extensions' in het search_path en
// `db reset --linked` er anders op vastliep. Het resulterende schema is gelijk: in productie wijst de
// standaardwaarde van household_invites.token al naar extensions.gen_random_bytes, en pgcrypto
// staat er al. Productie voert deze versie nooit opnieuw uit (de CLI kijkt alleen naar versienummers),
// dus de opgeslagen tekst in productie wijkt tekstueel af van Git. Zie supabase/README.md.
const APPLIED = {
  '20261002064401_huishoudens_leden_items.sql': '8e265fb9a05a12149af7737e43174b6b',
  '20261002064437_beveiliging_en_indexen_aanscherpen.sql': '32cf478016b4de85290fcd63032cafb7',
};

// Functies uit extensies die op Supabase in schema 'extensions' staan. Zonder schemanaam vindt de CLI
// ze niet (zie hierboven). gen_random_uuid() hoort hier niet bij: die zit sinds Postgres 13 in de kern.
const EXTENSION_FUNCS = ['gen_random_bytes', 'gen_salt', 'crypt', 'digest', 'hmac', 'pgp_sym_encrypt',
  'pgp_sym_decrypt', 'pgp_pub_encrypt', 'pgp_pub_decrypt', 'armor', 'dearmor', 'encrypt', 'decrypt',
  'uuid_generate_v1', 'uuid_generate_v1mc', 'uuid_generate_v3', 'uuid_generate_v4', 'uuid_generate_v5',
  'uuid_nil', 'uuid_ns_dns', 'uuid_ns_url', 'uuid_ns_oid', 'uuid_ns_x500'];

module.exports = {
  async 'migraties: geldige namen, oplopende versies, toegepaste bestanden ongewijzigd'() {
    const files = fs.readdirSync(MIG).filter(f => f.endsWith('.sql'));
    assert(files.length >= 2, 'Verwacht minstens de twee bestaande migraties');
    const versions = files.map(f => {
      const m = /^(\d{14})_([a-z0-9_]+)\.sql$/.exec(f);
      assert(m, 'Ongeldige migratienaam: ' + f + ' (verwacht JJJJMMDDUUMMSS_naam.sql)');
      return m[1];
    });
    assert(new Set(versions).size === versions.length, 'Dubbele migratieversie');
    Object.keys(APPLIED).forEach(f => {
      assert(files.includes(f), 'Toegepaste migratie ontbreekt: ' + f);
      const md5 = crypto.createHash('md5').update(fs.readFileSync(path.join(MIG, f))).digest('hex');
      assert(md5 === APPLIED[f], f + ' is gewijzigd na toepassen (md5 ' + md5 + '); maak een nieuwe migratie');
    });
    // Nieuwe migraties moeten na de laatst toegepaste komen.
    const last = Object.keys(APPLIED).map(f => f.slice(0, 14)).sort().pop();
    versions.filter(v => !Object.keys(APPLIED).some(f => f.startsWith(v)))
      .forEach(v => assert(v > last, 'Nieuwe migratie ' + v + ' ligt vóór de laatst toegepaste ' + last));
  },

  async 'migraties: extensiefuncties altijd met schemanaam extensions.'() {
    const bad = [];
    fs.readdirSync(MIG).filter(f => f.endsWith('.sql')).forEach(f => {
      // Commentaar weglaten; daarin mag de naam gewoon voorkomen.
      const sql = fs.readFileSync(path.join(MIG, f), 'utf8').replace(/--[^\n]*/g, '');
      EXTENSION_FUNCS.forEach(fn => {
        const re = new RegExp('(^|[^A-Za-z0-9_."])' + fn + '\\s*\\(', 'gi');
        let m;
        while ((m = re.exec(sql))) {
          const line = sql.slice(0, m.index).split('\n').length;
          bad.push(f + ':' + line + ' ' + fn + '() zonder extensions.');
        }
      });
    });
    assert(bad.length === 0, 'Gebruik extensions.<functie>() in migraties:\n    ' + bad.join('\n    '));
  },

  async 'geen service-role- of secret-sleutels in de repository'() {
    const files = execSync('git ls-files -co --exclude-standard', { cwd: ROOT }).toString().split('\n').filter(Boolean)
      .filter(f => !/\.(png|jpg|jpeg|webp|ico|woff2?)$/i.test(f) && fs.existsSync(path.join(ROOT, f)));
    const bad = [];
    const jwt = /eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
    files.forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      if (/sb_secret_[A-Za-z0-9_-]{8,}/.test(s)) bad.push(f + ': secret key (sb_secret)');
      if (/SERVICE_ROLE_KEY\s*[=:]\s*['"]?[A-Za-z0-9._-]{20,}/.test(s)) bad.push(f + ': SERVICE_ROLE_KEY met waarde');
      let m;
      while ((m = jwt.exec(s))) {
        try {
          const payload = JSON.parse(Buffer.from(m[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
          if (payload.role === 'service_role') bad.push(f + ': JWT met role service_role');
        } catch (e) { /* geen JWT */ }
      }
    });
    assert(bad.length === 0, 'Geheime sleutel gevonden:\n    ' + bad.join('\n    '));
    const ignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
    assert(/^\.env$/m.test(ignore), '.env staat niet in .gitignore');
  },

  async 'de app gebruikt nog geen Supabase (stap 1.1 raakt geen app-code)'() {
    ['index.html', 'test/index.html'].forEach(f => {
      const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
      assert(!/supabase/i.test(s), f + ' verwijst al naar Supabase');
    });
  },
};
