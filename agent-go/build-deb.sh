#!/bin/bash
# Build .deb package for srm-agent (unified Go agent)
set -euo pipefail

VERSION="${VERSION:-0.8.0}"
PKG_NAME="srm-agent"
BUILD_DIR="build-deb/${PKG_NAME}_${VERSION}_amd64"

echo "=== Building ${PKG_NAME} ${VERSION} (deb) ==="

rm -rf build-deb
mkdir -p "${BUILD_DIR}/DEBIAN"
mkdir -p "${BUILD_DIR}/usr/bin"
mkdir -p "${BUILD_DIR}/usr/local/bin"
mkdir -p "${BUILD_DIR}/etc/systemd/system"
mkdir -p "${BUILD_DIR}/etc/frp"
mkdir -p "${BUILD_DIR}/etc/srm"

# Control file with version
sed "s/__VERSION__/${VERSION}/" agent-go/deb/DEBIAN/control > "${BUILD_DIR}/DEBIAN/control"
cp agent-go/deb/DEBIAN/postinst "${BUILD_DIR}/DEBIAN/"
cp agent-go/deb/DEBIAN/prerm    "${BUILD_DIR}/DEBIAN/"
cp agent-go/deb/DEBIAN/postrm   "${BUILD_DIR}/DEBIAN/"
chmod 755 "${BUILD_DIR}/DEBIAN/postinst" "${BUILD_DIR}/DEBIAN/prerm" "${BUILD_DIR}/DEBIAN/postrm"

# srm-agent Go binary (must exist, built by CI or make)
if [ -f agent-go/bin/srm-agent ]; then
    cp agent-go/bin/srm-agent "${BUILD_DIR}/usr/local/bin/srm-agent"
    chmod 755 "${BUILD_DIR}/usr/local/bin/srm-agent"
else
    echo "FEHLER: agent-go/bin/srm-agent nicht gefunden. Bitte zuerst bauen."
    exit 1
fi

# frpc binary (downloaded by CI)
if [ -f frpc ]; then
    cp frpc "${BUILD_DIR}/usr/bin/frpc"
    chmod 755 "${BUILD_DIR}/usr/bin/frpc"
else
    echo "WARNUNG: frpc Binary nicht gefunden. Dummy wird erstellt."
    echo '#!/bin/sh' > "${BUILD_DIR}/usr/bin/frpc"
    echo 'echo "frpc placeholder"' >> "${BUILD_DIR}/usr/bin/frpc"
    chmod 755 "${BUILD_DIR}/usr/bin/frpc"
fi

# systemd units
cp agent-go/systemd/frpc.service       "${BUILD_DIR}/etc/systemd/system/"
cp agent-go/systemd/srm-agent.service  "${BUILD_DIR}/etc/systemd/system/"
cp agent-go/systemd/srm-agent.timer    "${BUILD_DIR}/etc/systemd/system/"

# Build
dpkg-deb --root-owner-group --build "${BUILD_DIR}"
mv "build-deb/${PKG_NAME}_${VERSION}_amd64.deb" .

echo "=== Paket erstellt: ${PKG_NAME}_${VERSION}_amd64.deb ==="
