#!/bin/bash
set -e

echo "Starting server..."
PORT=3000 node dist/server.cjs > server_run.log 2>&1 &
SERVER_PID=$!
sleep 3

echo "Server started. PID: $SERVER_PID"
# Verify it's up
curl -s http://localhost:3000/api/health

CHAT_ID=$(node -e "console.log(process.env.TELEGRAM_ALLOWED_CHAT_IDS)")
SECRET=$(node -e "console.log((process.env.TELEGRAM_WEBHOOK_SECRET || '').replace(/\+/g, '-').replace(/=/g, ''))")

echo -e "\nSending simulated Telegram message..."
curl -s -X POST "http://localhost:3000/api/webhooks/telegram" \
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

sleep 2

echo -e "\nChecking for ingestion events..."
if [ -f .data/ingestion_events.json ]; then
  cat .data/ingestion_events.json | jq '.events | to_entries | map(.value) | map(select(.externalEventId == "1001"))' || echo "jq failed"
else
  echo ".data/ingestion_events.json not found"
fi

echo -e "\nChecking for created discussions..."
if [ -f .data/community_history.json ]; then
  cat .data/community_history.json | jq '.discussions | to_entries | map(.value) | map(select(.content == "Cohorta live integration test — 2026-09-04"))' || echo "jq failed"
else
  echo ".data/community_history.json not found"
fi

kill $SERVER_PID || true
echo "Done."
