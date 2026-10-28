import http from 'node:http';

const FILE = 'inknote.enc.json';
let stored = null;
let stats = { gets: 0, patches: 0, posts: 0, puts: 0 };

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS',
    'Content-Type': 'application/json'
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    const url = req.url.split('?')[0];

    if (url === '/__stats') {
      res.writeHead(200, cors);
      res.end(JSON.stringify({ ...stats, gistId: 'G1', hasContent: !!stored, size: stored ? stored.length : 0 }));
      return;
    }
    if (url === '/__reset') {
      stored = null; stats = { gets: 0, patches: 0, posts: 0, puts: 0 };
      res.writeHead(200, cors); res.end('{}'); return;
    }
    if (url === '/user') { res.writeHead(200, cors); res.end(JSON.stringify({ login: 'tester' })); return; }

    if (url === '/gists' && req.method === 'POST') {
      stats.posts++;
      try { stored = JSON.parse(body).files[FILE].content; } catch { stored = null; }
      res.writeHead(201, cors);
      res.end(JSON.stringify({ id: 'G1' }));
      return;
    }
    if (url === '/gists/G1' && req.method === 'GET') {
      stats.gets++;
      if (!stored) {
        res.writeHead(404, cors); res.end(JSON.stringify({ message: 'Not Found' })); return;
      }
      res.writeHead(200, cors);
      res.end(JSON.stringify({ id: 'G1', files: { [FILE]: { content: stored, truncated: false } } }));
      return;
    }
    if (url === '/gists/G1' && req.method === 'PATCH') {
      stats.patches++;
      try { stored = JSON.parse(body).files[FILE].content; } catch { /* ignore */ }
      res.writeHead(200, cors);
      res.end(JSON.stringify({ id: 'G1' }));
      return;
    }
    res.writeHead(404, cors);
    res.end(JSON.stringify({ message: 'Not Found' }));
  });
});

server.listen(8892, '127.0.0.1', () => console.log('mock gist on 8892'));
