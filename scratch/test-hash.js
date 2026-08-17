const crypto = require('crypto');

const key = "wacrm_live_9kWYK_CZUwgC2bnLdcgXLunyJI5tmydW76UDtb1tIsg";
const hash = crypto.createHash('sha256').update(key).digest('hex');

console.log("Plaintext Key:", key);
console.log("SHA256 Hash:", hash);
console.log("Prefix:", key.slice(0, 19));
