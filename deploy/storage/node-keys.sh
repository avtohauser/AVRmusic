#!/usr/bin/env bash
# Both servers: this server's WireGuard public key (the private key is made here once and never leaves).
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
command -v wg >/dev/null || { apt-get update -qq >/dev/null; apt-get install -y -qq wireguard-tools >/dev/null; }
install -d -m 700 /etc/wireguard
[ -s /etc/wireguard/avr.key ] || (umask 077; wg genkey > /etc/wireguard/avr.key)
# some container VPSes cannot run WireGuard at all
if ! ip link show avr0 >/dev/null 2>&1; then
  if ip link add avr-probe type wireguard 2>/dev/null; then ip link del avr-probe; else echo "::error::$(hostname): WireGuard не запускается на этом сервере (контейнерная виртуализация?)"; exit 3; fi
fi
echo "PUBKEY=$(wg pubkey < /etc/wireguard/avr.key)"
