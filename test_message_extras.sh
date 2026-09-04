#!/bin/bash
set -e

PORT=3000 node dist/server.cjs > server_run.log 2>&1 &
SERVER_PID=$!
sleep 3

CHAT_ID=$(node -e "console.log(process.env.TELEGRAM_ALLOWED_CHAT_IDS)")
SECRET=$(node -e "console.log((process.env.TELEGRAM_WEBHOOK_SECRET || '').replace(/\+/g, '-').replace(/=/g, ''))")

echo "--- STEP 8: Test Reply Handling ---"
curl -s -X POST "http://localhost:3000/api/webhooks/telegram" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
  -d "{
    \"update_id\": 999992,
    \"message\": {
      \"message_id\": 1002,
      \"from\": {
        \"id\": 99999,
        \"is_bot\": false,
        \"first_name\": \"Replier\"
      },
      \"chat\": {
        \"id\": $CHAT_ID,
        \"type\": \"group\"
      },
      \"reply_to_message\": {
        \"message_id\": 1001,
        \"from\": {
          \"id\": 88888,
          \"is_bot\": false,
          \"first_name\": \"Test\"
        },
        \"chat\": {
          \"id\": $CHAT_ID,
          \"type\": \"group\"
        },
        \"date\": $(date +%s),
        \"text\": \"Cohorta live integration test — 2026-09-04\"
      },
      \"date\": $(date +%s),
      \"text\": \"This is a reply test\"
    }
  }"

sleep 1

echo "--- STEP 9: Test Edit Handling ---"
curl -s -X POST "http://localhost:3000/api/webhooks/telegram" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
  -d "{
    \"update_id\": 999993,
    \"edited_message\": {
      \"message_id\": 1001,
      \"from\": {
        \"id\": 88888,
        \"is_bot\": false,
        \"first_name\": \"Test\"
      },
      \"chat\": {
        \"id\": $CHAT_ID,
        \"type\": \"group\"
      },
      \"date\": $(date +%s),
      \"edit_date\": $(date +%s),
      \"text\": \"Cohorta live integration test — 2026-09-04 (EDITED)\"
    }
  }"

sleep 1

echo "--- STEP 10: Test Unauthorized Chat Isolation ---"
curl -s -X POST "http://localhost:3000/api/webhooks/telegram" \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: $SECRET" \
  -d "{
    \"update_id\": 999994,
    \"message\": {
      \"message_id\": 1003,
      \"from\": {
        \"id\": 88888,
        \"is_bot\": false,
        \"first_name\": \"Attacker\"
      },
      \"chat\": {
        \"id\": -999999999,
        \"type\": \"group\"
      },
      \"date\": $(date +%s),
      \"text\": \"This should be ignored\"
    }
  }"

sleep 2

echo -e "\nChecking Results in JSON..."
cat .data/community_history.json | jq '.discussions | to_entries | map(.value) | map(select(.title == "Cohorta live integration test — 2026-09-04 (EDITED)" or .content == "Cohorta live integration test — 2026-09-04 (EDITED)"))' || echo "jq failed"
echo -e "\nChecking if unauthorized chat made a discussion..."
cat .data/community_history.json | jq '.discussions | to_entries | map(.value) | map(select(.content == "This should be ignored"))' || echo "jq failed"

kill $SERVER_PID || true
echo "Done."
