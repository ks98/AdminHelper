#!/bin/sh
set -e

CERT=/etc/nginx/certs/cert.pem
KEY=/etc/nginx/certs/key.pem
DOMAIN="${DOMAIN:-localhost}"

if [ -f "$CERT" ] && [ -f "$KEY" ]; then
    echo "[entrypoint] Vorhandene Zertifikate werden verwendet"
else
    echo "[entrypoint] Generiere selbstsigniertes Zertifikat für '${DOMAIN}'..."
    mkdir -p /etc/nginx/certs
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "$KEY" -out "$CERT" \
        -subj "/CN=${DOMAIN}" \
        -addext "subjectAltName=DNS:${DOMAIN},DNS:localhost,IP:127.0.0.1"
    echo "[entrypoint] Zertifikat generiert."
fi

export NGINX_DOMAIN="${DOMAIN}"
envsubst '${NGINX_DOMAIN}' < /etc/nginx/conf.d/default.conf.template \
                           > /etc/nginx/conf.d/default.conf

exec nginx -g "daemon off;"
