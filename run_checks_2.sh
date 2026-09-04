#!/bin/bash
set -e

# We need to extract the webhook URL without printing it
WEBHOOK_URL=$(node -e "require('dotenv').config(); console.log(process.env.TELEGRAM_WEBHOOK_URL)")
if [ -n "$WEBHOOK_URL" ]; then
  echo "Curling public webhook URL (unauthenticated)..."
  HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$WEBHOOK_URL")
  echo "Public Webhook HTTP Status: $HTTP_STATUS"
else
  echo "TELEGRAM_WEBHOOK_URL not found."
fi

echo "--- STEP 4: Set Webhook ---"
npm run telegram:set-webhook > set_webhook.log 2>&1 || true
cat set_webhook.log | grep -v -i "token" | grep -v -i "secret"

echo "--- STEP 4.1: Webhook Info (After) ---"
npm run telegram:webhook-info > webhook_after.log 2>&1 || true
cat webhook_after.log | grep -v -i "token"

