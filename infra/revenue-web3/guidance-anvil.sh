#!/bin/sh
set -eu
if [ -e /data/state.json ]; then
  [ -s /data/state.json ] || { echo 'Checkpoint is empty. Restore the local backup; refusing a new chain.' >&2; exit 1; }
  state_time=$(head -c 1024 /data/state.json | sed -n 's/.*"timestamp"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
  [ -n "$state_time" ] || { echo 'Checkpoint timestamp missing; refusing a new chain.' >&2; exit 1; }
  touch /data/initialized
  exec anvil --silent --host 0.0.0.0 --port 8545 --chain-id 20261014 --gas-limit 30000000 --mnemonic "$ANVIL_MNEMONIC" --load-state /data/state.json --timestamp "$((state_time))" --dump-state /data/state.live.json --preserve-historical-states
fi
[ ! -e /data/initialized ] || { echo 'Checkpoint missing on an initialized chain; restore its backup.' >&2; exit 1; }
touch /data/initialized
exec anvil --silent --host 0.0.0.0 --port 8545 --chain-id 20261014 --gas-limit 30000000 --mnemonic "$ANVIL_MNEMONIC" --dump-state /data/state.live.json --preserve-historical-states
