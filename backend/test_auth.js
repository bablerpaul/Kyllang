const http = require('http');

const options = {
  hostname: 'localhost',
  port: 5000,
  path: '/api/emergency/break-glass',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log('STATUS:', res.statusCode);
  res.on('data', (d) => process.stdout.write(d));
});

req.on('error', (e) => {
  console.error('Error:', e.message);
});

req.write(JSON.stringify({ patientId: '123' }));
req.end();
