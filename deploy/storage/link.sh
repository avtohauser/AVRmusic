#!/usr/bin/env bash
# Main server: its own SSH key for the storage server (used through the tunnel only); prints the public key.
set -euo pipefail
install -d -m 700 /root/.ssh
[ -s /root/.ssh/avr_storage ] || ssh-keygen -q -t ed25519 -N '' -C avr-main -f /root/.ssh/avr_storage
echo "PUBKEY=$(cat /root/.ssh/avr_storage.pub)"
