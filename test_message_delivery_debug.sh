#!/bin/bash
set -e

PORT=3000 node dist/server.cjs > server_run.log 2>&1 &
SERVER_PID=$!
sleep 2

SECRET=$(node -e "console.log((process.env.TELEGRAM_WEBHOOK_SECRET || '').replace(/\+/g, '-').replace(/=/g, ''))")
CHAT_ID=$(node -e "console.log(process.env.TELEGRAM_ALLOWED_CHAT_IDS)")

echo "SECRET: $SECRET"

curl -v -X POST "http://localhost:3000/api/webhooks/telegram" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
  -d "{
    \"update_id\": 999991,
    \"message\": {
      \"message_id\": 1001,
      \"from\": {
        \"id\": 88888,
        \"is_bot\": false,
        \"first_name\": \"Test\",
        \"username\": \"testuser\"
      },
      \"chat\": {
        \"id\": $CHAT_ID,
        \"type\": \"group\",
        \"title\": \"Test Group\"
      },
      \"date\": $(date +%s),
      \"text\": \"Cohorta live integration test — 2026-09-04\"
    }
  }"

kill $SERVER_PID || true
