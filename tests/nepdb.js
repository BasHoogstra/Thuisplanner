// Een echte, lokale HTTP-nepdatabase in Firebase-stijl (ETag/if-match, CORS), voor wat een
// Playwright-route niet kan nabootsen: een antwoord waarvan de headers binnenkomen maar de body
// blijft hangen (Codex-herreview PR #15, punt 2). Alleen 127.0.0.1, alleen fictieve data.
'use strict';
const http = require('http');

function startNepDb(data) {
  const st = { db: data === undefined ? null : JSON.parse(JSON.stringify(data)), etag: 1, puts: 0, gets: 0,
    bodyHangt: 0,      // aantal volgende GET's waarvan de body blijft hangen (headers wel)
    putAfbreken: 0,    // aantal volgende PUT's die mislukken (503) zonder verwerking. (De verbinding verbreken
                       // werkt niet: de browser herhaalt een PUT dan zelf, want PUT is idempotent.)
    log: [] };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Allow-Methods': 'GET,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'content-type,if-match,x-firebase-etag' };
  const open = new Set();
  const srv = http.createServer((req, res) => {
    open.add(res);
    res.on('close', () => open.delete(res));
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
    if (/\/planners\.json/.test(req.url)) { res.writeHead(401, cors); return res.end('{"error":"Permission denied"}'); }
    if (req.method === 'GET') {
      st.gets++; st.log.push('GET');
      const body = JSON.stringify(st.db);
      if (st.bodyHangt > 0) {
        st.bodyHangt--; st.log.push('GET body hangt');
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) + 100, ETag: 'e' + st.etag }, cors));
        res.write(body.slice(0, 10)); // headers en een begin, de rest komt nooit
        return;
      }
      res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', ETag: 'e' + st.etag }, cors));
      return res.end(body);
    }
    if (req.method === 'PUT') {
      let b = '';
      req.on('data', d => { b += d; });
      req.on('end', () => {
        if (st.putAfbreken > 0) { st.putAfbreken--; st.log.push('PUT mislukt'); res.writeHead(503, cors); return res.end(); }
        const im = req.headers['if-match'];
        if (im && im !== 'e' + st.etag) { st.log.push('PUT 412'); res.writeHead(412, Object.assign({ ETag: 'e' + st.etag }, cors)); return res.end(); }
        st.db = JSON.parse(b); st.etag++; st.puts++; st.log.push('PUT');
        res.writeHead(200, Object.assign({ 'Content-Type': 'application/json', ETag: 'e' + st.etag }, cors));
        res.end(b);
      });
      return;
    }
    res.writeHead(405, cors); res.end();
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => {
    const url = 'http://127.0.0.1:' + srv.address().port;
    r({ url, st, stop: () => new Promise(z => { open.forEach(x => { try { x.destroy(); } catch (e) {} }); srv.close(() => z()); }) });
  }));
}
module.exports = { startNepDb };
