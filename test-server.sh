#!/bin/bash
set -e
echo "Starting server..."
PORT=3000 node dist/server.cjs &
SERVER_PID=$!
sleep 2

echo "Testing /api/health..."
curl -s http://localhost:3000/api/health

echo -e "\nTesting /api/webhooks/telegram..."
curl -s -X POST http://localhost:3000/api/webhooks/telegram

echo -e "\nTesting frontend..."
curl -s -I http://localhost:3000/ | head -n 1

kill $SERVER_PID
echo "Done"
