#!/bin/bash
PID=$(ps aux | grep "[n]ode dist/server.cjs" | awk '{print $2}')
if [ ! -z "$PID" ]; then
  kill -9 $PID
fi
PORT=3000 node dist/server.cjs > server_run.log 2>&1 &
