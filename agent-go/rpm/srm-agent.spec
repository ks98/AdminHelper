Name:           srm-agent
Version:        __VERSION__
Release:        1%{?dist}
Summary:        SRM Agent — FRPC Sync + Monitoring
License:        Proprietary
URL:            https://gitlab.local/srm/simpleremotemanager

Source0:        %{name}-%{version}.tar.gz

Requires:       systemd
Obsoletes:      srm-frpc-client < %{version}
Obsoletes:      srm-monitor-agent < %{version}

%description
Unified agent for Simple Remote Manager (SRM). Combines FRP Client
(frpc) with automatic config sync and system monitoring in a single
Go binary. Replaces srm-frpc-client and srm-monitor-agent packages.

%prep
%setup -q

%install
mkdir -p %{buildroot}/usr/bin
mkdir -p %{buildroot}/usr/local/bin
mkdir -p %{buildroot}/etc/systemd/system
mkdir -p %{buildroot}/etc/frp/pki
mkdir -p %{buildroot}/etc/srm

cp usr/local/bin/srm-agent %{buildroot}/usr/local/bin/srm-agent
cp usr/bin/frpc %{buildroot}/usr/bin/frpc

cp etc/systemd/system/frpc.service %{buildroot}/etc/systemd/system/
cp etc/systemd/system/srm-agent.service %{buildroot}/etc/systemd/system/
cp etc/systemd/system/srm-agent.timer %{buildroot}/etc/systemd/system/

%files
%attr(755,root,root) /usr/local/bin/srm-agent
%attr(755,root,root) /usr/bin/frpc
/etc/systemd/system/frpc.service
/etc/systemd/system/srm-agent.service
/etc/systemd/system/srm-agent.timer
%dir %attr(700,root,root) /etc/frp
%dir %attr(700,root,root) /etc/frp/pki
%dir %attr(700,root,root) /etc/srm

%post
systemctl daemon-reload
# Alte Units aufraeumen
for unit in srm-frpc-sync.timer srm-frpc-sync.service srm-monitor-agent.timer srm-monitor-agent.service; do
    if [ -f "/etc/systemd/system/${unit}" ]; then
        systemctl stop "${unit}" 2>/dev/null || true
        systemctl disable "${unit}" 2>/dev/null || true
        rm -f "/etc/systemd/system/${unit}"
    fi
done
systemctl daemon-reload
echo "srm-agent installiert."
echo "FRPC Einrichtung:    sudo srm-agent frpc init --url <SRM_URL> --token <TOKEN> --server-id <ID>"
echo "Monitor Einrichtung: sudo srm-agent monitor init --url <MONITOR_URL> --api-key <KEY> --server-id <ID>"

%preun
systemctl stop srm-agent.timer 2>/dev/null || true
systemctl stop frpc.service 2>/dev/null || true
systemctl disable srm-agent.timer 2>/dev/null || true
systemctl disable frpc.service 2>/dev/null || true

%postun
systemctl daemon-reload
