// SPDX-FileCopyrightText: 2026 Kevin Stenzel
//
// SPDX-License-Identifier: GPL-3.0-or-later

use std::path::{Component, Path};

use crate::error::AppError;
use crate::models::{Connection, ConnectionKind};
use url::{Host, Url};

pub fn validate_host(host: &str) -> Result<(), AppError> {
    let trimmed = host.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Host fehlt".to_string()));
    }
    if trimmed.starts_with('-') {
        return Err(AppError::Validation("Ungueltiger Hostname".to_string()));
    }
    if trimmed
        .contains(|c: char| c.is_control() || c.is_whitespace() || ";|&$`'\"\\{}()!#".contains(c))
    {
        return Err(AppError::Validation("Ungueltiger Hostname".to_string()));
    }
    Ok(())
}

pub fn validate_no_control_chars(value: &str, label: &str) -> Result<(), AppError> {
    if value.contains(|c: char| c.is_control()) {
        return Err(AppError::Validation(format!(
            "{label} enthaelt ungueltige Zeichen"
        )));
    }
    Ok(())
}

pub fn validate_web_url(raw: &str) -> Result<String, AppError> {
    let trimmed = raw.trim();
    let with_scheme = if !trimmed.contains("://") {
        format!("https://{trimmed}")
    } else {
        trimmed.to_string()
    };
    let parsed = Url::parse(&with_scheme)?;
    match parsed.scheme() {
        "https" | "http" => Ok(parsed.to_string()),
        other => Err(AppError::Validation(format!(
            "Unerlaubtes URL-Schema: {other}"
        ))),
    }
}

pub fn validate_connection_input(connection: &Connection) -> Result<(), AppError> {
    if let Some(ref host) = connection.host {
        let trimmed = host.trim();
        if !trimmed.is_empty() {
            validate_host(trimmed)?;
        }
    }
    if let Some(ref username) = connection.username {
        validate_no_control_chars(username, "Benutzer")?;
    }
    if let Some(ref domain) = connection.domain {
        validate_no_control_chars(domain, "Domaene")?;
    }
    if let Some(ref key_path) = connection.key_path {
        let trimmed = key_path.trim();
        if !trimmed.is_empty() && trimmed.contains("..") {
            return Err(AppError::Validation("Ungueltiger SSH Key Pfad".to_string()));
        }
    }
    if let Some(ref url) = connection.url {
        if connection.kind == ConnectionKind::Web && !url.trim().is_empty() {
            validate_web_url(url)?;
        }
    }
    Ok(())
}

/// True only for hosts whose traffic never leaves the machine: the loopback
/// IPs (127.0.0.0/8, ::1) and the literal `localhost`. Subdomains of
/// `.localhost` are deliberately *not* accepted — not every resolver maps them
/// to loopback (RFC 6761 is advisory), so trusting them could leak to a real host.
fn is_loopback_host(host: Option<Host<&str>>) -> bool {
    match host {
        Some(Host::Ipv4(ip)) => ip.is_loopback(),
        Some(Host::Ipv6(ip)) => ip.is_loopback(),
        Some(Host::Domain(d)) => d.eq_ignore_ascii_case("localhost"),
        None => false,
    }
}

/// Enforces TLS on an AdminHelper server URL before any credential (password,
/// JWT, refresh token) is sent to it. `https://` is always allowed; `http://`
/// is allowed *only* for loopback hosts, so local development keeps working
/// while no secret ever crosses a network in cleartext.
///
/// The public read-only sync URL has its own stricter `validate_https_url`
/// (no loopback exception) in sync.rs; this guards the authenticated JWT path
/// funnelled through `auth::build_client`.
pub fn validate_server_url_secure(raw: &str) -> Result<(), AppError> {
    let url = Url::parse(raw)?;
    match url.scheme() {
        "https" => Ok(()),
        "http" if is_loopback_host(url.host()) => Ok(()),
        _ => Err(AppError::Validation(
            "Server-URL muss https:// verwenden (http:// nur fuer localhost)".to_string(),
        )),
    }
}

/// Validates a server-supplied PKI filename before it is joined onto the local
/// pki directory. The frp visitor bundle only ever contains `ca.crt`,
/// `<user>.crt` and `<user>.key`. A malicious or compromised server must not be
/// able to smuggle path separators, `..`, or an absolute path: `pki_dir.join()`
/// would otherwise escape the pki directory (zip-slip / path traversal) and let
/// the server write arbitrary files onto the client's disk.
pub fn validate_pki_filename(name: &str) -> Result<(), AppError> {
    let reject = || AppError::Validation(format!("Ungueltiger PKI-Dateiname vom Server: {name}"));
    // Reject separators of *both* platforms and control chars up front, so a
    // Windows-targeted "..\\.." payload is rejected even on a Unix client, where
    // '\\' is not a Path separator and would otherwise pass the check below.
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains(|c: char| c.is_control())
    {
        return Err(reject());
    }
    // Must be exactly one normal path component: rules out `.`, `..`, root and
    // (Windows) drive prefixes, and verifies the component round-trips to the
    // exact input (guards against any path normalization).
    let mut components = Path::new(name).components();
    match (components.next(), components.next()) {
        (Some(Component::Normal(c)), None) if c == std::ffi::OsStr::new(name) => Ok(()),
        _ => Err(reject()),
    }
}

/// True if two URLs point at the same server origin (scheme + host + port),
/// ignoring path, trailing slash and host case. Used to pin `api_proxy`'s token
/// destination to the logged-in server: a request URL that differs from the
/// session's server origin must not receive the JWT. Falls back to a
/// trailing-slash-insensitive exact match if either URL fails to parse.
pub fn same_server_destination(requested: &str, stored: &str) -> bool {
    fn origin(raw: &str) -> Option<(String, String, u16)> {
        let url = Url::parse(raw).ok()?;
        let host = url.host_str()?.to_ascii_lowercase();
        let port = url.port_or_known_default()?;
        Some((url.scheme().to_string(), host, port))
    }
    match (origin(requested), origin(stored)) {
        (Some(a), Some(b)) => a == b,
        _ => requested.trim_end_matches('/') == stored.trim_end_matches('/'),
    }
}

/// Sanitizes a connection name for safe use as an RDP window title
/// (xfreerdp `/title:`). Defense-in-depth: passing via argv already prevents
/// argument splitting, but sanitization guards against control characters,
/// X11 escapes, and future code paths that might shell-format the value.
pub fn sanitize_window_title(name: &str) -> String {
    let filtered: String = name
        .chars()
        .filter(|c| c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.' | ':' | '(' | ')'))
        .take(64)
        .collect();
    filtered.trim().to_string()
}

pub fn sanitize_synced_connections(connections: Vec<Connection>) -> Vec<Connection> {
    connections
        .into_iter()
        .filter(|c| validate_connection_input(c).is_ok())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::ConnectionKind;

    fn ssh_connection_with_key_path(key_path: &str) -> Connection {
        Connection {
            id: "id".to_string(),
            name: "name".to_string(),
            kind: ConnectionKind::Ssh,
            host: Some("example.com".to_string()),
            port: None,
            username: None,
            domain: None,
            key_path: Some(key_path.to_string()),
            url: None,
            notes: None,
            tags: Vec::new(),
            trust_cert: false,
            last_used: None,
        }
    }

    #[test]
    fn validate_host_accepts_plain_hostname() {
        assert!(validate_host("host.example.com").is_ok());
        assert!(validate_host("192.168.0.1").is_ok());
    }

    #[test]
    fn validate_host_rejects_shell_metacharacters() {
        for c in [';', '|', '&', '$', '`'] {
            let host = format!("host{c}evil");
            assert!(
                validate_host(&host).is_err(),
                "Host mit '{c}' muss abgelehnt werden"
            );
        }
    }

    #[test]
    fn validate_host_rejects_whitespace() {
        assert!(validate_host("host name").is_err());
    }

    #[test]
    fn validate_host_rejects_control_chars() {
        assert!(validate_host("host\x00name").is_err());
        assert!(validate_host("host\x1fname").is_err());
        assert!(validate_host("host\nname").is_err());
    }

    #[test]
    fn validate_host_rejects_empty_and_leading_dash() {
        assert!(validate_host("").is_err());
        assert!(validate_host("   ").is_err());
        assert!(validate_host("-oProxyCommand=evil").is_err());
    }

    #[test]
    fn validate_web_url_allows_http_and_https() {
        assert!(validate_web_url("http://example.com").is_ok());
        assert!(validate_web_url("https://example.com").is_ok());
        // Without a scheme, https:// is prepended.
        assert!(validate_web_url("example.com").is_ok());
    }

    #[test]
    fn validate_web_url_rejects_ftp_and_other_schemes() {
        assert!(validate_web_url("ftp://example.com").is_err());
        assert!(validate_web_url("file:///etc/passwd").is_err());
        assert!(validate_web_url("javascript:alert(1)").is_err());
    }

    #[test]
    fn validate_connection_input_rejects_path_traversal_in_key_path() {
        let connection = ssh_connection_with_key_path("../../etc/passwd");
        assert!(validate_connection_input(&connection).is_err());
    }

    #[test]
    fn validate_connection_input_accepts_plain_key_path() {
        let connection = ssh_connection_with_key_path("/home/user/.ssh/id_ed25519");
        assert!(validate_connection_input(&connection).is_ok());
    }

    #[test]
    fn validate_no_control_chars_rejects_null_and_unit_separator() {
        assert!(validate_no_control_chars("user\x00name", "Benutzer").is_err());
        assert!(validate_no_control_chars("user\x1fname", "Benutzer").is_err());
    }

    #[test]
    fn validate_no_control_chars_accepts_plain_text() {
        assert!(validate_no_control_chars("administrator", "Benutzer").is_ok());
    }

    #[test]
    fn validate_server_url_secure_accepts_https_and_loopback_http() {
        for url in [
            "https://example.com",
            "https://example.com:8443/api",
            "http://localhost",
            "http://localhost:8000/api",
            "http://LOCALHOST:8000",
            "http://127.0.0.1",
            "http://127.0.0.5:9000", // whole 127.0.0.0/8 is loopback
            "http://[::1]:8000",
        ] {
            assert!(
                validate_server_url_secure(url).is_ok(),
                "{url} must be accepted"
            );
        }
    }

    #[test]
    fn validate_server_url_secure_rejects_cleartext_network_and_other_schemes() {
        for url in [
            "http://example.com",        // cleartext over the network
            "http://192.168.1.10:8000",  // private LAN IP, still a network
            "http://10.0.0.1",           // private LAN IP
            "http://attacker.localhost", // subdomain is not guaranteed loopback
            "http://localhost.evil.com", // looks loopback, is not
            "ftp://example.com",         // wrong scheme
        ] {
            assert!(
                validate_server_url_secure(url).is_err(),
                "{url} must be rejected"
            );
        }
    }

    #[test]
    fn same_server_destination_matches_same_origin_ignoring_path_and_slash() {
        let stored = "https://adminhelper.example:8443";
        for requested in [
            "https://adminhelper.example:8443",
            "https://adminhelper.example:8443/",
            "https://adminhelper.example:8443/api/connections",
            "https://ADMINHELPER.example:8443/api", // host case-insensitive
        ] {
            assert!(
                same_server_destination(requested, stored),
                "{requested} must match {stored}"
            );
        }
        // Implicit vs explicit default port are the same origin.
        assert!(same_server_destination(
            "https://adminhelper.example/api",
            "https://adminhelper.example:443"
        ));
    }

    #[test]
    fn same_server_destination_rejects_foreign_origin() {
        let stored = "https://adminhelper.example:8443";
        for requested in [
            "https://attacker.example:8443/api",         // different host
            "https://adminhelper.example:9443/api",      // different port
            "http://adminhelper.example:8443/api",       // different scheme
            "https://adminhelper.example.evil.com:8443", // suffix trick
        ] {
            assert!(
                !same_server_destination(requested, stored),
                "{requested} must NOT match {stored}"
            );
        }
    }

    #[test]
    fn validate_pki_filename_accepts_real_bundle_names() {
        // Exactly what apps/server generate_router.py emits.
        for name in ["ca.crt", "kevin.crt", "kevin.key"] {
            assert!(
                validate_pki_filename(name).is_ok(),
                "{name} must be accepted"
            );
        }
        // Realistic usernames with dot/dash/underscore and non-ASCII letters.
        for name in [
            "first.last.crt",
            "kevin-stenzel.key",
            "user_1.crt",
            "müller.crt",
        ] {
            assert!(
                validate_pki_filename(name).is_ok(),
                "{name} must be accepted"
            );
        }
    }

    #[test]
    fn validate_pki_filename_rejects_path_traversal() {
        for name in [
            "../../etc/passwd",       // unix traversal
            "../ca.crt",              // single parent
            "/etc/cron.d/evil",       // absolute unix path
            "..\\..\\system32\\evil", // windows traversal (must fail on unix too)
            "C:\\Windows\\evil.crt",  // windows absolute (backslash)
            "sub/dir.crt",            // nested separator
            "..",                     // bare parent
            ".",                      // bare current
            "",                       // empty
            "ca\0.crt",               // NUL byte
            "ca\n.crt",               // newline / control char
        ] {
            assert!(
                validate_pki_filename(name).is_err(),
                "{name:?} must be rejected"
            );
        }
    }
}
