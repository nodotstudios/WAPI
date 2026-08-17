const https = require('https');
const crypto = require('crypto');

const key = "wacrm_live_9kWYK_CZUwgC2bnLdcgXLunyJI5tmydW76UDtb1tIsg";
const hash = crypto.createHash('sha256').update(key).digest('hex');

console.log("Looking up hash:", hash);

const url = "https://jwstfsmocluvtrlxwemw.supabase.co/rest/v1/api_keys?select=*";
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp3c3Rmc21vY2x1dnRybHh3ZW13Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NjYxODM3OCwiZXhwIjoyMTAyMTk0Mzc4fQ.hpjxjMKkeQimn664cIc2oj7ogbXdG3cvwxKRQTkImSo";

const req = https.request(url, {
  headers: {
    'apikey': serviceKey,
    'Authorization': 'Bearer ' + serviceKey
  }
}, (res) => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log("Status:", res.statusCode);
    console.log("Keys in DB:", body);
  });
});

req.on('error', (e) => console.error(e));
req.end();
