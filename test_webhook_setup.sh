#!/bin/bash
set -e

# 1. Check if the secret is now valid
SECRET_VALID=$(node -e "const s = process.env.TELEGRAM_WEBHOOK_SECRET || ''; console.log(/^[A-Za-z0-9_-]+$/.test(s));")

if [ "$SECRET_VALID" = "false" ]; then
  echo "SECRET_STILL_INVALID"
  # Let's see if we have a .env file we can safely fix
  if [ -f .env ]; then
    echo "Found .env, attempting to sanitize TELEGRAM_WEBHOOK_SECRET..."
    # Replace + with - and remove =
    node -e "
      const fs = require('fs');
      let env = fs.readFileSync('.env', 'utf8');
      const match = env.match(/^TELEGRAM_WEBHOOK_SECRET=(.*)$/m);
      if (match) {
        let secret = match[1];
        // Strip quotes if any
        if (secret.startsWith('\"') && secret.endsWith('\"')) secret = secret.slice(1, -1);
        if (secret.startsWith(\"'\") && secret.endsWith(\"'\")) secret = secret.slice(1, -1);
        
        let sanitized = secret.replace(/\+/g, '-').replace(/=/g, '');
        env = env.replace(/^TELEGRAM_WEBHOOK_SECRET=.*$/m, 'TELEGRAM_WEBHOOK_SECRET=' + sanitized);
        fs.writeFileSync('.env', env);
        console.log('Sanitized secret in .env.');
      }
    "
    # Source the new env variables
    export $(grep -v '^#' .env | xargs)
  fi
fi

# 2. Run the webhook registration
echo "--- Running telegram:set-webhook ---"
npm run telegram:set-webhook > set_webhook.log 2>&1 || true
cat set_webhook.log | grep -v -i "token" | grep -v -i "secret"

