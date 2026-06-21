#!/usr/bin/env bash
#
# repo_build_test.sh — verifies apps/agent/build-repo.sh end to end with a
# throwaway GPG key and dummy .deb/.rpm: the built APT + YUM trees must be
# structurally complete and carry valid signatures in the right key formats.
#
# Runs natively when all tools are present (dpkg-dev, apt-utils, createrepo-c,
# rpm, gnupg). createrepo_c ships only on rpm distros / Debian universe, so when
# it is missing the test re-execs itself inside an ubuntu container that installs
# the toolchain — identical to what release.yml does in CI. Set AH_REPO_TEST_NATIVE=1
# to force the native path (used by the container re-exec to avoid a loop).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_REPO="${REPO_ROOT}/apps/agent/build-repo.sh"
VERSION="9.9.9"
KEY_ID="repo-test@adminhelper.invalid"
IMAGE="ubuntu:24.04"

# --- Container re-exec when createrepo_c is unavailable ----------------------
if ! command -v createrepo_c >/dev/null 2>&1 && [ "${AH_REPO_TEST_NATIVE:-0}" != 1 ]; then
    command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1 || {
        echo "FEHLER: createrepo_c fehlt und Docker ist nicht nutzbar — Test kann die RPM-Repo-Seite nicht verifizieren." >&2
        echo "        Installiere 'createrepo-c' (apt) oder starte Docker." >&2
        exit 1
    }
    echo "[repo-test] createrepo_c fehlt lokal → Re-Exec im Container ${IMAGE} ..."
    exec docker run --rm -v "${REPO_ROOT}:/src:ro" -w /src "$IMAGE" bash -c '
        set -e
        export DEBIAN_FRONTEND=noninteractive
        apt-get update -qq
        apt-get install -y -qq dpkg-dev apt-utils createrepo-c rpm gnupg gzip >/dev/null
        export AH_REPO_TEST_NATIVE=1
        exec bash scripts/tests/repo_build_test.sh
    '
fi

# --- Native run -------------------------------------------------------------
WORK="$(mktemp -d)"
export GNUPGHOME="${WORK}/gnupg"
mkdir -p "$GNUPGHOME"; chmod 700 "$GNUPGHOME"
trap 'rm -rf "$WORK"' EXIT

fail() { echo "FAIL: $*" >&2; exit 1; }
ok()   { echo "  ok: $*"; }

echo "[repo-test] Werkzeuge: $(command -v dpkg-scanpackages apt-ftparchive createrepo_c rpm gpg | tr '\n' ' ')"

# 1) Throwaway, passphrase-less signing key.
echo "[repo-test] Erzeuge Wegwerf-GPG-Schluessel ..."
gpg --batch --gen-key >/dev/null 2>&1 <<EOF
%no-protection
Key-Type: RSA
Key-Length: 3072
Name-Real: AdminHelper Repo Test
Name-Email: ${KEY_ID}
Expire-Date: 0
%commit
EOF

# 2) Dummy .deb (valid metadata, trivial payload).
echo "[repo-test] Baue Dummy-.deb ..."
DEBDIR="${WORK}/deb/adminhelper-agent_${VERSION}_amd64"
mkdir -p "${DEBDIR}/DEBIAN" "${DEBDIR}/usr/share/adminhelper-agent"
cat > "${DEBDIR}/DEBIAN/control" <<EOF
Package: adminhelper-agent
Version: ${VERSION}
Architecture: amd64
Maintainer: Repo Test <${KEY_ID}>
Section: net
Priority: optional
Description: dummy package for repo_build_test
EOF
echo "marker" > "${DEBDIR}/usr/share/adminhelper-agent/marker"
dpkg-deb --root-owner-group --build "$DEBDIR" "${WORK}/adminhelper-agent_${VERSION}_amd64.deb" >/dev/null

# 3) Dummy .rpm (x86_64, no debuginfo just like the real spec).
echo "[repo-test] Baue Dummy-.rpm ..."
RPMTOP="${WORK}/rpmbuild"
mkdir -p "${RPMTOP}"/{BUILD,RPMS,SOURCES,SPECS,SRPMS}
cat > "${RPMTOP}/SPECS/adminhelper-agent.spec" <<EOF
Name:           adminhelper-agent
Version:        ${VERSION}
Release:        1
Summary:        dummy package for repo_build_test
License:        GPL-3.0-or-later
%global debug_package %{nil}
%description
dummy
%install
mkdir -p %{buildroot}/usr/share/adminhelper-agent
echo marker > %{buildroot}/usr/share/adminhelper-agent/marker
%files
/usr/share/adminhelper-agent/marker
EOF
rpmbuild --define "_topdir ${RPMTOP}" -bb "${RPMTOP}/SPECS/adminhelper-agent.spec" >/dev/null 2>&1
RPM_BUILT="$(ls "${RPMTOP}"/RPMS/*/adminhelper-agent-${VERSION}-1.*.rpm | head -1)"
cp "$RPM_BUILT" "${WORK}/"

# 4) Run the real build-repo.sh.
echo "[repo-test] Rufe build-repo.sh ..."
(
    cd "$WORK"
    VERSION="$VERSION" REPO_GPG_KEY_ID="$KEY_ID" OUT_DIR="${WORK}/repo" \
        DEB="${WORK}/adminhelper-agent_${VERSION}_amd64.deb" \
        RPM="${WORK}/$(basename "$RPM_BUILT")" \
        bash "$BUILD_REPO"
)
APT="${WORK}/repo/apt"; RPM_REPO="${WORK}/repo/rpm"

# 5) APT assertions ----------------------------------------------------------
echo "[repo-test] Pruefe APT-Repo ..."
for f in "pool/main/adminhelper-agent_${VERSION}_amd64.deb" \
         "dists/stable/main/binary-amd64/Packages" \
         "dists/stable/main/binary-amd64/Packages.gz" \
         "dists/stable/Release" "dists/stable/InRelease" "dists/stable/Release.gpg" \
         "adminhelper-archive-keyring.gpg"; do
    [ -s "${APT}/${f}" ] || fail "APT-Datei fehlt/leer: $f"
done
ok "APT-Baum vollständig"
grep -q "^Package: adminhelper-agent$" "${APT}/dists/stable/main/binary-amd64/Packages" \
    || fail "Packages enthält das Paket nicht"
grep -q "^Filename: pool/main/adminhelper-agent_${VERSION}_amd64.deb$" \
    "${APT}/dists/stable/main/binary-amd64/Packages" || fail "Packages: Filename-Pfad falsch"
ok "Packages-Index korrekt"
# Release must carry the SHA256 of the Packages index (chain root → package hash).
PKG_SHA=$(sha256sum "${APT}/dists/stable/main/binary-amd64/Packages" | cut -d' ' -f1)
grep -q "$PKG_SHA" "${APT}/dists/stable/Release" || fail "Release deckt Packages-SHA256 nicht"
grep -q "^SHA256:" "${APT}/dists/stable/Release" || fail "Release ohne SHA256-Sektion"
ok "Release deckt Packages-SHA256"
gpg --verify "${APT}/dists/stable/InRelease" >/dev/null 2>&1 || fail "InRelease-Signatur ungültig"
gpg --verify "${APT}/dists/stable/Release.gpg" "${APT}/dists/stable/Release" >/dev/null 2>&1 \
    || fail "Release.gpg-Signatur ungültig"
ok "APT-Signaturen gültig (InRelease + Release.gpg)"
# apt keyring must be DEARMORED (binary), not ASCII-armored.
head -c 40 "${APT}/adminhelper-archive-keyring.gpg" | grep -q "BEGIN PGP" \
    && fail "apt-Keyring ist armored — muss dearmored (binär) sein"
ok "apt-Keyring ist dearmored (binär)"

# 6) RPM assertions ----------------------------------------------------------
echo "[repo-test] Pruefe RPM-Repo ..."
RPM_PKG="${RPM_REPO}/$(basename "$RPM_BUILT")"
for f in "$RPM_PKG" "${RPM_REPO}/repodata/repomd.xml" \
         "${RPM_REPO}/repodata/repomd.xml.asc" "${RPM_REPO}/RPM-GPG-KEY-adminhelper"; do
    [ -s "$f" ] || fail "RPM-Datei fehlt/leer: $f"
done
ok "RPM-Baum vollständig"
# Package signature: import key into a scratch rpmdb, then checksig must say OK.
RPMDB="${WORK}/rpmdb"; mkdir -p "$RPMDB"
rpm --dbpath "$RPMDB" --import "${RPM_REPO}/RPM-GPG-KEY-adminhelper"
rpm --dbpath "$RPMDB" --checksig "$RPM_PKG" | grep -Eqi 'signatures OK|pgp.*OK' \
    || fail "RPM-Paketsignatur nicht OK ($(rpm --dbpath "$RPMDB" --checksig "$RPM_PKG"))"
ok "RPM-Paketsignatur gültig (rpm --checksig)"
gpg --verify "${RPM_REPO}/repodata/repomd.xml.asc" "${RPM_REPO}/repodata/repomd.xml" >/dev/null 2>&1 \
    || fail "repomd.xml-Signatur ungültig"
ok "repomd.xml-Signatur gültig"
# dnf gpgkey must be ARMORED (ASCII).
head -c 40 "${RPM_REPO}/RPM-GPG-KEY-adminhelper" | grep -q "BEGIN PGP PUBLIC KEY" \
    || fail "RPM-GPG-KEY ist nicht armored — dnf gpgkey erwartet ASCII-armored"
ok "RPM-GPG-KEY ist armored (ASCII)"

echo "[repo-test] PASS — APT- und RPM-Repo korrekt gebaut und signiert."
