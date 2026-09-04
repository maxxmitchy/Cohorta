const crypto = require('crypto');
function generateSecret() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  let result = '';
  const randomBytes = crypto.randomBytes(32);
  for (let i = 0; i < 32; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}
const fs = require('fs');
const secret = generateSecret();
const envLocalContent = fs.existsSync('.env.local') ? fs.readFileSync('.env.local', 'utf8') : '';
let newEnvLocalContent = envLocalContent;
if (newEnvLocalContent.includes('TELEGRAM_WEBHOOK_SECRET=')) {
  newEnvLocalContent = newEnvLocalContent.replace(/^TELEGRAM_WEBHOOK_SECRET=.*$/m, `TELEGRAM_WEBHOOK_SECRET=${secret}`);
} else {
  newEnvLocalContent += `\nTELEGRAM_WEBHOOK_SECRET=${secret}\n`;
}
fs.writeFileSync('.env.local', newEnvLocalContent);
console.log('Secret generated and saved to .env.local');
