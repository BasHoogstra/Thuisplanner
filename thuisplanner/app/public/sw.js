// De service worker van Thuisplanner (PWA-basis, PR P0; besluit 20, bouwvoorstel §5.3).
//
// Hij doet precies twee dingen:
//   - push:              een melding tonen (titel, korte tekst en een adres binnen de app);
//   - notificationclick: de app openen, of een open venster van de app focussen, op het adres uit de melding.
//
// Bewust GEEN fetch-handler en GEEN cache, ook niet van de statische bestanden (besluit 17: geen echte gegevens in de
// browsercache). Zonder fetch-handler gaat elk verzoek gewoon naar het netwerk, precies zoals zonder service worker.
// De inhoud van een melding komt in P1 van de server en bevat nooit privé-details (besluit 16 en 20); hier wordt hij
// alleen ingekort en nooit naar een adres buiten de app gestuurd.
'use strict';

var STANDAARD_TITEL = 'Thuisplanner';
var STANDAARD_TEKST = 'Er is iets nieuws in Thuisplanner.';

// Een nieuwe versie neemt meteen over (er is geen cache die eerst bijgewerkt moet worden).
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });

/** Het adres als het binnen de eigen app valt (zelfde origin en scope), anders de start van de app. */
function veiligAdres(adres) {
  var scope = self.registration.scope;
  try {
    var u = new URL(typeof adres === 'string' && adres ? adres : './', scope);
    if (u.origin === new URL(scope).origin && u.href.indexOf(scope) === 0) return u.href;
  } catch (e) { /* ongeldig adres: de start van de app */ }
  return scope;
}

// Een klik op een melding opent een expliciet doel. Het merk ?van=melding (vóór de hash) laat de app zien dat het geen
// gewone start is, zodat de startschermvoorkeur dit doel niet vervangt (isNieuweStart in src/lib/voorkeuren.ts).
var HERKOMST = 'van';
var HERKOMST_MELDING = 'melding';
function meldingAdres(adres) {
  var u = new URL(veiligAdres(adres));
  u.searchParams.set(HERKOMST, HERKOMST_MELDING);
  return u.href;
}

function tekst(waarde, max) {
  return typeof waarde === 'string' && waarde.trim() ? waarde.trim().slice(0, max) : '';
}

/** Titel en opties van de melding uit de push-inhoud (JSON {title, body, url, tag}; gewone tekst wordt de tekst). */
function melding(data) {
  var inhoud = {};
  if (data) {
    try { inhoud = data.json(); } catch (e) { inhoud = { body: data.text() }; }
  }
  if (!inhoud || typeof inhoud !== 'object') inhoud = {};
  var opties = {
    body: tekst(inhoud.body, 200) || STANDAARD_TEKST,
    icon: new URL('pictogrammen/icon-192.png', self.registration.scope).href,
    lang: 'nl',
    dir: 'ltr',
    data: { url: veiligAdres(inhoud.url) },
  };
  var tag = tekst(inhoud.tag, 64);
  if (tag) opties.tag = tag;
  return { titel: tekst(inhoud.title, 80) || STANDAARD_TITEL, opties: opties };
}

// Altijd een zichtbare melding, ook bij een lege of kapotte inhoud: Safari en Chrome trekken het abonnement in als een
// push geen melding toont (userVisibleOnly).
self.addEventListener('push', function (event) {
  var m = melding(event.data);
  event.waitUntil(self.registration.showNotification(m.titel, m.opties));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var doel = meldingAdres(event.notification.data && event.notification.data.url);
  var scope = self.registration.scope;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (vensters) {
    var open = vensters.filter(function (c) { return c.url.indexOf(scope) === 0; })[0];
    if (!open) return self.clients.openWindow(doel);
    return open.focus().then(function (venster) {
      var v = venster || open;
      if (v.url === doel || typeof v.navigate !== 'function') return v;
      // navigate() kan alleen een venster dat deze service worker beheert; anders blijft het open venster staan.
      return v.navigate(doel).catch(function () { return v; });
    });
  }));
});
