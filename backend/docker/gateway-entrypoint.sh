#!/bin/sh
# Entrypoint of a gateway container: the same three processes as on a FelCloud gateway VM.
# gwagent writes haproxy.cfg and keepalived.conf, HAProxy and keepalived start, then gwagent
# syncs the routes from cpd. Env: GW_NAME (gw1|gw2), CPD_URL, CSTAM_GATEWAY_TOKEN.
set -eu
: "${GW_NAME:?GW_NAME is required (gw1 or gw2)}"
: "${CPD_URL:=http://10.20.0.5:8443}"
: "${VRRP_IFACE:=eth0}"
B=/opt/cstam/bin
rm -f /run/haproxy/*.sock # left by the previous run after a docker restart
install -d /run/haproxy /run/cstam /var/lib/cstam /etc/haproxy /etc/keepalived

# vrrp_track_process needs the host PID namespace: off in a container
"$B/gwagent" -bootstrap -name "$GW_NAME" -cpd "$CPD_URL" -vrrp-iface "$VRRP_IFACE" -vrrp-track-process=false
haproxy -W -db -S /run/haproxy/master.sock,mode,600 -f /etc/haproxy/haproxy.cfg &
keepalived -n -l -D -f /etc/keepalived/keepalived.conf &
# like After=haproxy.service on a gateway VM: the agent talks to HAProxy as soon as it starts
for _ in $(seq 50); do [ -S /run/haproxy/admin.sock ] && break; sleep 0.1; done
exec "$B/gwagent" -name "$GW_NAME" -cpd "$CPD_URL"
