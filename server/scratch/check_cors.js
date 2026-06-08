const http = require('http');

const options = {
  hostname: '127.0.0.1',
  port: 5000,
  path: '/api/ai/agent/chat',
  method: 'OPTIONS',
  headers: {
    'Origin': 'http://localhost:5173',
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'x-xsrf-token'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  console.log('HEADERS:', JSON.stringify(res.headers, null, 2));
});

req.on('error', (e) => {
  console.error('ERROR:', e.message);
});

req.end();
