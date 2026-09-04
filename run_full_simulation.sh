#!/bin/bash
set -e

CHAT_ID="-5456731754"
SECRET=$(node -e "console.log((process.env.TELEGRAM_WEBHOOK_SECRET || '').replace(/\+/g, '-').replace(/=/g, ''))")

echo "--- Sending Root Message ---"
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

sleep 1

echo -e "\n--- Sending Reply ---"
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

echo -e "\n--- Sending Edit ---"
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

echo -e "\n--- Sending Unauthorized ---"
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

echo -e "\n\n--- RESULTS ---"
node -e "
const fs = require('fs');
const hist = JSON.parse(fs.readFileSync('.data/community_history.json'));
const ing = JSON.parse(fs.readFileSync('.data/ingestion_events.json'));
console.log('Ingestion Events Count:', Object.keys(ing.events).length);
const discussions = Object.values(hist.discussions);
console.log('Discussions Count:', discussions.length);
if (discussions.length > 0) {
  console.log('Discussion Content:', discussions[0].content);
  console.log('Replies Count:', discussions[0].replies.length);
  if (discussions[0].replies.length > 0) {
    console.log('Reply 1 Content:', discussions[0].replies[0].content);
  }
}
"

