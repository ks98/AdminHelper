use serde::{Deserialize, Serialize};
use std::{
  fs,
  path::{Path, PathBuf},
  process::Command,
};
use url::Url;

#[cfg(unix)]
use std::io::{Read, Write};
#[cfg(unix)]
use std::net::{TcpStream, ToSocketAddrs};
#[cfg(unix)]
use std::time::Duration;

#[cfg(unix)]
use std::process::Stdio;
use tauri::{Emitter, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Connection {
  id: String,
  name: String,
  kind: String,
  host: Option<String>,
  port: Option<u16>,
  username: Option<String>,
  domain: Option<String>,
  key_path: Option<String>,
  url: Option<String>,
  notes: Option<String>,
  #[serde(default)]
  tags: Vec<String>,
  #[serde(default)]
  trust_cert: bool,
  last_used: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Settings {
  mode: String,
  url: Option<String>,
  #[serde(default = "default_sync_interval_minutes")]
  interval_minutes: u32,
  #[serde(default)]
  language: Option<String>,
  #[serde(default)]
  store_passwords: bool,
}

impl Default for Settings {
  fn default() -> Self {
    Self {
      mode: "local".to_string(),
      url: None,
      interval_minutes: default_sync_interval_minutes(),
      language: None,
      store_passwords: false,
    }
  }
}

fn default_sync_interval_minutes() -> u32 {
  1
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct ClientInfo {
  screen_width: Option<u32>,
  screen_height: Option<u32>,
  scale_factor: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct PasswordState {
  stored: bool,
  password: Option<String>,
  can_store: bool,
}

#[tauri::command]
fn load_connections(app: tauri::AppHandle) -> Result<Vec<Connection>, String> {
  let path = data_path(&app)?;
  if !path.exists() {
    return Ok(Vec::new());
  }
  let data = fs::read_to_string(&path).map_err(|err| err.to_string())?;
  let connections: Vec<Connection> =
    serde_json::from_str(&data).map_err(|err| err.to_string())?;
  Ok(connections)
}

#[tauri::command]
fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
  let path = settings_path(&app)?;
  if !path.exists() {
    return Ok(Settings::default());
  }
  let data = fs::read_to_string(&path).map_err(|err| err.to_string())?;
  let settings: Settings = serde_json::from_str(&data).map_err(|err| err.to_string())?;
  Ok(settings)
}

#[tauri::command]
fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
  let path = settings_path(&app)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  let serialized = serde_json::to_string_pretty(&settings).map_err(|err| err.to_string())?;
  fs::write(&path, serialized).map_err(|err| err.to_string())?;
  harden_permissions(&path);
  Ok(())
}

#[tauri::command]
fn sync_connections(app: tauri::AppHandle, url: String) -> Result<Vec<Connection>, String> {
  validate_https_url(&url)?;
  let response = reqwest::blocking::get(url).map_err(|err| err.to_string())?;
  if !response.status().is_success() {
    return Err(format!("HTTP {}", response.status()));
  }
  let connections: Vec<Connection> = response.json().map_err(|err| err.to_string())?;
  write_connections(&app, &connections)?;
  Ok(connections)
}

#[tauri::command]
fn save_connections(app: tauri::AppHandle, connections: Vec<Connection>) -> Result<(), String> {
  write_connections(&app, &connections)?;
  Ok(())
}

#[tauri::command]
fn open_connection(
  app: tauri::AppHandle,
  connection: Connection,
  password: Option<String>,
  client: Option<ClientInfo>,
) -> Result<(), String> {
  match connection.kind.as_str() {
    "ssh" => open_ssh(&connection),
    "rdp" => open_rdp(&connection, password.as_deref(), client.as_ref(), &app),
    "web" => open_web(&connection),
    other => Err(format!("Unbekannter Typ: {other}")),
  }
}

#[tauri::command]
fn password_state(connection: Connection) -> Result<PasswordState, String> {
  if connection.kind != "rdp" {
    return Ok(PasswordState {
      stored: false,
      password: None,
      can_store: false,
    });
  }

  #[cfg(target_os = "windows")]
  {
    let target = rdp_windows_target(&connection)?;
    let stored = windows_credential_exists(&target)?;
    return Ok(PasswordState {
      stored,
      password: None,
      can_store: true,
    });
  }

  #[cfg(unix)]
  {
    let password = load_password_keyring(&connection)?;
    return Ok(PasswordState {
      stored: password.is_some(),
      password,
      can_store: true,
    });
  }

  #[cfg(not(any(target_os = "windows", unix)))]
  {
    return Ok(PasswordState {
      stored: false,
      password: None,
      can_store: false,
    });
  }
}

#[tauri::command]
fn save_password(connection: Connection, password: String) -> Result<(), String> {
  if connection.kind != "rdp" {
    return Ok(());
  }

  #[cfg(target_os = "windows")]
  {
    let target = rdp_windows_target(&connection)?;
    let username = rdp_windows_username(&connection)?;
    return windows_store_credential(&target, &username, &password);
  }

  #[cfg(unix)]
  {
    return save_password_keyring(&connection, &password);
  }

  #[cfg(not(any(target_os = "windows", unix)))]
  {
    let _ = password;
    return Ok(());
  }
}

#[tauri::command]
fn delete_password(connection: Connection) -> Result<(), String> {
  if connection.kind != "rdp" {
    return Ok(());
  }

  #[cfg(target_os = "windows")]
  {
    let target = rdp_windows_target(&connection)?;
    return windows_delete_credential(&target);
  }

  #[cfg(unix)]
  {
    return delete_password_keyring(&connection);
  }

  #[cfg(not(any(target_os = "windows", unix)))]
  {
    return Ok(());
  }
}

fn normalized(value: &Option<String>) -> String {
  value.as_deref().unwrap_or("").trim().to_string()
}

fn required(value: &Option<String>, label: &str) -> Result<String, String> {
  let trimmed = normalized(value);
  if trimmed.is_empty() {
    return Err(format!("{label} fehlt"));
  }
  Ok(trimmed)
}

fn rdp_port(connection: &Connection) -> u16 {
  connection.port.unwrap_or(3389)
}

fn rdp_storage_key(connection: &Connection) -> Option<String> {
  let host = normalized(&connection.host);
  let username = normalized(&connection.username);
  if host.is_empty() || username.is_empty() {
    return None;
  }
  let domain = normalized(&connection.domain);
  let port = rdp_port(connection);
  Some(format!(
    "rdp|{}|{}|{}|{}",
    host.to_lowercase(),
    port,
    username.to_lowercase(),
    domain.to_lowercase()
  ))
}

fn rdp_storage_key_required(connection: &Connection) -> Result<String, String> {
  let host = required(&connection.host, "Host")?;
  let username = required(&connection.username, "Benutzer")?;
  let domain = normalized(&connection.domain);
  let port = rdp_port(connection);
  Ok(format!(
    "rdp|{}|{}|{}|{}",
    host.to_lowercase(),
    port,
    username.to_lowercase(),
    domain.to_lowercase()
  ))
}

#[cfg(unix)]
fn load_password_keyring(connection: &Connection) -> Result<Option<String>, String> {
  use keyring::{Entry, Error as KeyringError};
  const PASSWORD_SERVICE: &str = "com.simpleremote.manager";

  let key = match rdp_storage_key(connection) {
    Some(value) => value,
    None => return Ok(None),
  };

  let entry = Entry::new(PASSWORD_SERVICE, &key).map_err(|err| err.to_string())?;
  match entry.get_password() {
    Ok(password) => Ok(Some(password)),
    Err(KeyringError::NoEntry) => Ok(None),
    Err(err) => Err(err.to_string()),
  }
}

#[cfg(unix)]
fn save_password_keyring(connection: &Connection, password: &str) -> Result<(), String> {
  use keyring::Entry;
  const PASSWORD_SERVICE: &str = "com.simpleremote.manager";

  let key = rdp_storage_key_required(connection)?;
  let entry = Entry::new(PASSWORD_SERVICE, &key).map_err(|err| err.to_string())?;
  entry.set_password(password).map_err(|err| err.to_string())?;
  Ok(())
}

#[cfg(unix)]
fn delete_password_keyring(connection: &Connection) -> Result<(), String> {
  use keyring::{Entry, Error as KeyringError};
  const PASSWORD_SERVICE: &str = "com.simpleremote.manager";

  let key = match rdp_storage_key(connection) {
    Some(value) => value,
    None => return Ok(()),
  };
  let entry = Entry::new(PASSWORD_SERVICE, &key).map_err(|err| err.to_string())?;
  match entry.delete_password() {
    Ok(_) => Ok(()),
    Err(KeyringError::NoEntry) => Ok(()),
    Err(err) => Err(err.to_string()),
  }
}

#[cfg(target_os = "windows")]
fn rdp_windows_target(connection: &Connection) -> Result<String, String> {
  let host = required(&connection.host, "Host")?;
  let port = rdp_port(connection);
  if port == 3389 {
    Ok(format!("TERMSRV/{host}"))
  } else {
    Ok(format!("TERMSRV/{host}:{port}"))
  }
}

#[cfg(target_os = "windows")]
fn rdp_windows_username(connection: &Connection) -> Result<String, String> {
  let username = required(&connection.username, "Benutzer")?;
  let domain = normalized(&connection.domain);
  if domain.is_empty() {
    Ok(username)
  } else {
    Ok(format!("{domain}\\{username}"))
  }
}

#[cfg(target_os = "windows")]
fn to_utf16_null(value: &str) -> Vec<u16> {
  use std::os::windows::prelude::OsStrExt;
  let mut utf16: Vec<u16> = std::ffi::OsStr::new(value).encode_wide().collect();
  utf16.push(0);
  utf16
}

#[cfg(target_os = "windows")]
fn utf16_bytes(value: &str) -> Vec<u8> {
  let mut bytes = Vec::with_capacity(value.encode_utf16().count() * 2);
  for unit in value.encode_utf16() {
    bytes.extend_from_slice(&unit.to_le_bytes());
  }
  bytes
}

#[cfg(target_os = "windows")]
fn windows_credential_exists(target: &str) -> Result<bool, String> {
  use std::ptr::null_mut;
  use windows::core::PCWSTR;
  use windows::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
  use windows::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};

  let target_w = to_utf16_null(target);
  let mut credential_ptr: *mut CREDENTIALW = null_mut();
  let ok =
    unsafe { CredReadW(PCWSTR(target_w.as_ptr()), CRED_TYPE_GENERIC, 0, &mut credential_ptr) }
      .as_bool();
  if ok {
    unsafe { CredFree(credential_ptr as *const _) };
    return Ok(true);
  }
  let err = unsafe { GetLastError() };
  if err == ERROR_NOT_FOUND {
    return Ok(false);
  }
  Err(format!("Credential Manager Fehler: {}", err.0))
}

#[cfg(target_os = "windows")]
fn windows_store_credential(target: &str, username: &str, password: &str) -> Result<(), String> {
  use windows::core::PWSTR;
  use windows::Win32::Foundation::GetLastError;
  use windows::Win32::Security::Credentials::{CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC};

  let target_w = to_utf16_null(target);
  let username_w = to_utf16_null(username);
  let mut secret_bytes = utf16_bytes(password);

  let mut credential = CREDENTIALW::default();
  credential.Type = CRED_TYPE_GENERIC;
  credential.TargetName = PWSTR(target_w.as_ptr() as *mut _);
  credential.UserName = PWSTR(username_w.as_ptr() as *mut _);
  credential.CredentialBlobSize = secret_bytes.len() as u32;
  credential.CredentialBlob = secret_bytes.as_mut_ptr();
  credential.Persist = CRED_PERSIST_LOCAL_MACHINE;

  let ok = unsafe { CredWriteW(&credential, 0) }.as_bool();
  for byte in &mut secret_bytes {
    *byte = 0;
  }
  if ok {
    Ok(())
  } else {
    let err = unsafe { GetLastError() };
    Err(format!("Credential Manager Fehler: {}", err.0))
  }
}

#[cfg(target_os = "windows")]
fn windows_delete_credential(target: &str) -> Result<(), String> {
  use windows::core::PCWSTR;
  use windows::Win32::Foundation::{GetLastError, ERROR_NOT_FOUND};
  use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

  let target_w = to_utf16_null(target);
  let ok = unsafe { CredDeleteW(PCWSTR(target_w.as_ptr()), CRED_TYPE_GENERIC, 0) }.as_bool();
  if ok {
    return Ok(());
  }
  let err = unsafe { GetLastError() };
  if err == ERROR_NOT_FOUND {
    return Ok(());
  }
  Err(format!("Credential Manager Fehler: {}", err.0))
}

fn data_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let base_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| err.to_string())?;
  Ok(base_dir.join("connections.json"))
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
  let base_dir = app
    .path()
    .app_data_dir()
    .map_err(|err| err.to_string())?;
  Ok(base_dir.join("settings.json"))
}

fn write_connections(app: &tauri::AppHandle, connections: &Vec<Connection>) -> Result<(), String> {
  let path = data_path(app)?;
  if let Some(parent) = path.parent() {
    fs::create_dir_all(parent).map_err(|err| err.to_string())?;
  }
  let serialized = serde_json::to_string_pretty(connections).map_err(|err| err.to_string())?;
  fs::write(&path, serialized).map_err(|err| err.to_string())?;
  harden_permissions(&path);
  Ok(())
}

fn validate_https_url(raw: &str) -> Result<(), String> {
  let url = Url::parse(raw).map_err(|err| err.to_string())?;
  if url.scheme() != "https" {
    return Err("Nur https:// URLs sind erlaubt".to_string());
  }
  Ok(())
}

#[cfg(unix)]
fn harden_permissions(path: &Path) {
  use std::os::unix::fs::PermissionsExt;
  if let Ok(metadata) = fs::metadata(path) {
    let mut permissions = metadata.permissions();
    permissions.set_mode(0o600);
    let _ = fs::set_permissions(path, permissions);
  }
}

#[cfg(not(unix))]
fn harden_permissions(_path: &Path) {}

fn open_ssh(connection: &Connection) -> Result<(), String> {
  let host = connection
    .host
    .as_ref()
    .ok_or_else(|| "Host fehlt".to_string())?;
  let port = connection.port.unwrap_or(22);
  let mut args: Vec<String> = Vec::new();
  if port != 22 {
    args.push("-p".to_string());
    args.push(port.to_string());
  }
  if let Some(key_path) = connection.key_path.as_ref() {
    if !key_path.trim().is_empty() {
      args.push("-i".to_string());
      args.push(key_path.clone());
    }
  }
  let target = if let Some(username) = connection.username.as_ref() {
    if !username.trim().is_empty() {
      format!("{username}@{host}")
    } else {
      host.to_string()
    }
  } else {
    host.to_string()
  };
  args.push(target);

  if cfg!(target_os = "windows") {
    open_windows_terminal("ssh", &args)
  } else {
    open_linux_terminal("ssh", &args)
  }
}

fn open_rdp(
  connection: &Connection,
  password: Option<&str>,
  client: Option<&ClientInfo>,
  app: &tauri::AppHandle,
) -> Result<(), String> {
  let host = connection
    .host
    .as_ref()
    .ok_or_else(|| "Host fehlt".to_string())?;
  let port = connection.port.unwrap_or(3389);
  let username = connection.username.as_ref().map(|value| value.trim()).unwrap_or("");
  let domain = connection.domain.as_ref().map(|value| value.trim()).unwrap_or("");

  #[cfg(not(unix))]
  let _ = password;
  #[cfg(not(unix))]
  let _ = app;
  #[cfg(not(unix))]
  let _ = client;

  #[cfg(target_os = "windows")]
  {
    if connection.trust_cert || !username.is_empty() || !domain.is_empty() {
      let rdp_path = write_rdp_file(host, port, username, domain, connection.trust_cert)?;
      Command::new("mstsc")
        .arg(rdp_path)
        .spawn()
        .map_err(|err| err.to_string())?;
    } else {
      let target = if port == 3389 {
        host.to_string()
      } else {
        format!("{host}:{port}")
      };
      Command::new("mstsc")
        .arg(format!("/v:{target}"))
        .spawn()
        .map_err(|err| err.to_string())?;
    }
    return Ok(());
  }

  #[cfg(unix)]
  {
    let rdp_binary = if which("xfreerdp3").is_some() {
      "xfreerdp3"
    } else if which("xfreerdp").is_some() {
      "xfreerdp"
    } else {
      return Err("xfreerdp ist nicht installiert".to_string());
    };

    preflight_rdp(host, port)?;

    let mut args = vec![format!("/v:{host}:{port}")];
    args.push("/dynamic-resolution".to_string());
    if connection.trust_cert {
      args.push("/cert:ignore".to_string());
    }
    let password = password.filter(|value| !value.is_empty());
    if let Some(secret) = password {
      if username.is_empty() {
        return Err("Benutzer fehlt".to_string());
      }
      match check_rdp_auth(rdp_binary, host, port, username, domain, connection.trust_cert, secret)
      {
        Ok(true) => {}
        Ok(false) => {}
        Err(message) => return Err(message),
      }
      args.push(format!("/u:{username}"));
      if !domain.is_empty() {
        args.push(format!("/d:{domain}"));
      }
      if let Some(scale) = hdpi_scale(client) {
        args.push(format!("/scale:{scale}"));
      }
      args.push("/from-stdin:force".to_string());
      args.push("/log-level:INFO".to_string());

      let started_at = std::time::Instant::now();
      let mut command = Command::new(rdp_binary);
      command
        .args(args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .env("WLOG_APPENDER", "console");
      let mut child = command.spawn().map_err(|err| err.to_string())?;

      if let Some(mut stdin) = child.stdin.take() {
        let payload = format!("{secret}\n");
        stdin.write_all(payload.as_bytes()).map_err(|err| err.to_string())?;
      }

      let emitted = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
      let connected_at_ms = std::sync::Arc::new(std::sync::atomic::AtomicU64::new(0));
      let app_handle = app.clone();

      if let Some(stdout) = child.stdout.take() {
        let emitted = emitted.clone();
        let connected_at_ms = connected_at_ms.clone();
        let started_at = started_at;
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
          let mut reader = stdout;
          let mut buffer: Vec<u8> = Vec::new();
          let mut chunk = [0u8; 1024];
          loop {
            let read = match reader.read(&mut chunk) {
              Ok(0) => break,
              Ok(count) => count,
              Err(_) => break,
            };
            buffer.extend_from_slice(&chunk[..read]);
            if buffer.len() > 8192 {
              buffer.drain(0..buffer.len().saturating_sub(8192));
            }
            if connected_at_ms.load(std::sync::atomic::Ordering::SeqCst) == 0
              && buffer_has_connected(&buffer)
            {
              let elapsed_ms = started_at.elapsed().as_millis() as u64;
              connected_at_ms.store(elapsed_ms, std::sync::atomic::Ordering::SeqCst);
            }
            if let Some(message) = parse_freerdp_error(&buffer) {
              if !emitted.swap(true, std::sync::atomic::Ordering::SeqCst) {
                let _ = app_handle.emit("rdp-error", message);
              }
              break;
            }
          }
        });
      }

      if let Some(stderr) = child.stderr.take() {
        let emitted = emitted.clone();
        let connected_at_ms = connected_at_ms.clone();
        let started_at = started_at;
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
          let mut reader = stderr;
          let mut buffer: Vec<u8> = Vec::new();
          let mut chunk = [0u8; 1024];
          loop {
            let read = match reader.read(&mut chunk) {
              Ok(0) => break,
              Ok(count) => count,
              Err(_) => break,
            };
            buffer.extend_from_slice(&chunk[..read]);
            if buffer.len() > 8192 {
              buffer.drain(0..buffer.len().saturating_sub(8192));
            }
            if connected_at_ms.load(std::sync::atomic::Ordering::SeqCst) == 0
              && buffer_has_connected(&buffer)
            {
              let elapsed_ms = started_at.elapsed().as_millis() as u64;
              connected_at_ms.store(elapsed_ms, std::sync::atomic::Ordering::SeqCst);
            }
            if let Some(message) = parse_freerdp_error(&buffer) {
              if !emitted.swap(true, std::sync::atomic::Ordering::SeqCst) {
                let _ = app_handle.emit("rdp-error", message);
              }
              break;
            }
          }
        });
      }

      {
        let emitted = emitted.clone();
        let connected_at_ms = connected_at_ms.clone();
        let app_handle = app_handle.clone();
        std::thread::spawn(move || {
          std::thread::sleep(std::time::Duration::from_secs(12));
          if connected_at_ms.load(std::sync::atomic::Ordering::SeqCst) == 0
            && !emitted.swap(true, std::sync::atomic::Ordering::SeqCst)
          {
            let _ = app_handle.emit(
              "rdp-error",
              "RDP Anmeldung fehlgeschlagen. Bitte Benutzer, Passwort und Domaene pruefen."
                .to_string(),
            );
          }
        });
      }

      std::thread::spawn(move || {
        if child.wait().is_ok() {
          if !emitted.load(std::sync::atomic::Ordering::SeqCst) {
            let elapsed_ms = started_at.elapsed().as_millis() as u64;
            let connected_ms = connected_at_ms.load(std::sync::atomic::Ordering::SeqCst);
            if connected_ms == 0 {
              let _ = app_handle.emit(
                "rdp-error",
                "RDP Verbindung fehlgeschlagen. Bitte Host, Port und Netzwerk pruefen."
                  .to_string(),
              );
            } else if elapsed_ms.saturating_sub(connected_ms) < 8000 {
              let _ = app_handle.emit(
                "rdp-error",
                "RDP Anmeldung fehlgeschlagen. Bitte Benutzer, Passwort und Domaene pruefen."
                  .to_string(),
              );
            }
          }
        }
      });
      return Ok(());
    }

    if !username.is_empty() {
      args.push(format!("/u:{username}"));
    }
    if !domain.is_empty() {
      args.push(format!("/d:{domain}"));
    }
    if let Some(scale) = hdpi_scale(client) {
      args.push(format!("/scale:{scale}"));
    }
    args.push("/log-level:INFO".to_string());

    let mut command = Command::new(rdp_binary);
    command
      .args(args)
      .stdout(Stdio::piped())
      .stderr(Stdio::piped())
      .env("WLOG_APPENDER", "console");
    let child = command.spawn().map_err(|err| err.to_string())?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
      if let Ok(output) = child.wait_with_output() {
        let mut combined = output.stderr;
        combined.extend_from_slice(&output.stdout);
        let parsed = parse_freerdp_error(&combined);
        if let Some(message) = parsed {
          let _ = app_handle.emit("rdp-error", message);
        } else if !buffer_has_connected(&combined) {
          let _ = app_handle.emit(
            "rdp-error",
            "RDP Verbindung fehlgeschlagen. Bitte Host, Port und Netzwerk pruefen."
              .to_string(),
          );
        }
      }
    });
    return Ok(());
  }

  #[cfg(not(any(target_os = "windows", unix)))]
  {
    Err("RDP wird auf diesem Betriebssystem nicht unterstuetzt".to_string())
  }
}

#[cfg(unix)]
fn parse_freerdp_error(stderr: &[u8]) -> Option<String> {
  let output = String::from_utf8_lossy(stderr);
  for line in output.lines() {
    let lower = line.to_lowercase();
    let is_auth = lower.contains("authentication") && lower.contains("failed");
    let is_logon =
      lower.contains("logon") && (lower.contains("failure") || lower.contains("failed"));
    let has_errconnect = lower.contains("errconnect_");

    if lower.contains("errconnect_logon_failure")
      || lower.contains("errconnect_authentication_failed")
      || lower.contains("errconnect_password_expired")
      || lower.contains("errconnect_account_locked_out")
      || lower.contains("errconnect_account_disabled")
      || lower.contains("errconnect_username_password_missing")
      || lower.contains("nt_status_logon_failure")
      || lower.contains("status_logon_failure")
      || lower.contains("status_password_expired")
      || lower.contains("status_account_locked_out")
      || lower.contains("status_account_disabled")
      || is_auth
      || is_logon
      || (has_errconnect && lower.contains("auth"))
      || (lower.contains("credssp") && lower.contains("failed"))
      || (lower.contains("account") && lower.contains("locked"))
      || (lower.contains("password") && lower.contains("expired"))
    {
      return Some(
        "RDP Anmeldung fehlgeschlagen. Bitte Benutzer, Passwort und Domaene pruefen.".to_string(),
      );
    }

    if has_errconnect
      || (lower.contains("connect") && (lower.contains("failed") || lower.contains("failure")))
      || (lower.contains("transport") && lower.contains("failed"))
      || (lower.contains("dns") && lower.contains("error"))
      || (lower.contains("name") && lower.contains("resolve") && lower.contains("fail"))
      || lower.contains("connection timeout")
      || lower.contains("connection timed out")
    {
      return Some(
        "RDP Verbindung fehlgeschlagen. Bitte Host, Port und Netzwerk pruefen.".to_string(),
      );
    }
  }
  None
}

#[cfg(unix)]
fn buffer_has_connected(buffer: &[u8]) -> bool {
  let output = String::from_utf8_lossy(buffer);
  let lower = output.to_lowercase();
  lower.contains("connected to") || lower.contains("connection established")
}

#[cfg(unix)]
fn hdpi_scale(client: Option<&ClientInfo>) -> Option<u32> {
  let info = client?;
  let scale_factor = info.scale_factor.unwrap_or(1.0);
  let width = info.screen_width.unwrap_or(0) as f64;
  let height = info.screen_height.unwrap_or(0) as f64;

  let is_hdpi = scale_factor >= 1.5 || (width >= 3000.0 && height >= 1600.0);
  if !is_hdpi {
    return None;
  }

  if scale_factor >= 2.0 || width >= 3800.0 || height >= 2100.0 {
    Some(180)
  } else {
    Some(140)
  }
}

#[cfg(unix)]
fn preflight_rdp(host: &str, port: u16) -> Result<(), String> {
  let addr = format!("{host}:{port}");
  let addrs = addr
    .to_socket_addrs()
    .map_err(|_| format!("Host konnte nicht aufgeloest werden: {host}"))?;
  let timeout = Duration::from_secs(3);
  for socket in addrs {
    if TcpStream::connect_timeout(&socket, timeout).is_ok() {
      return Ok(());
    }
  }
  Err("RDP Verbindung fehlgeschlagen. Bitte Host, Port und Netzwerk pruefen.".to_string())
}

#[cfg(unix)]
fn check_rdp_auth(
  rdp_binary: &str,
  host: &str,
  port: u16,
  username: &str,
  domain: &str,
  trust_cert: bool,
  password: &str,
) -> Result<bool, String> {
  let mut args = vec![
    format!("/v:{host}:{port}"),
    "+auth-only".to_string(),
    "/from-stdin:force".to_string(),
    "/log-level:ERROR".to_string(),
  ];
  if trust_cert {
    args.push("/cert:ignore".to_string());
  }
  if !username.is_empty() {
    args.push(format!("/u:{username}"));
  }
  if !domain.is_empty() {
    args.push(format!("/d:{domain}"));
  }

  let mut command = Command::new(rdp_binary);
  command
    .args(args)
    .stdin(Stdio::piped())
    .stdout(Stdio::piped())
    .stderr(Stdio::piped())
    .env("WLOG_APPENDER", "console");
  let mut child = command.spawn().map_err(|err| err.to_string())?;

  if let Some(mut stdin) = child.stdin.take() {
    let payload = format!("{password}\n");
    stdin.write_all(payload.as_bytes()).map_err(|err| err.to_string())?;
  }

  let output = child.wait_with_output().map_err(|err| err.to_string())?;
  let mut combined = output.stderr;
  combined.extend_from_slice(&output.stdout);
  let output_text = String::from_utf8_lossy(&combined);
  let output_lower = output_text.to_lowercase();

  if output_lower.contains("unknown option") && output_lower.contains("auth-only") {
    return Ok(false);
  }
  if output_lower.contains("unrecognized option") && output_lower.contains("auth-only") {
    return Ok(false);
  }
  if output_lower.contains("invalid option") && output_lower.contains("auth-only") {
    return Ok(false);
  }

  if output.status.success() {
    return Ok(true);
  }

  if let Some(message) = parse_freerdp_error(combined.as_slice()) {
    return Err(message);
  }

  Err("RDP Anmeldung fehlgeschlagen. Bitte Benutzer, Passwort und Domaene pruefen.".to_string())
}

fn open_web(connection: &Connection) -> Result<(), String> {
  let url = connection
    .url
    .as_ref()
    .ok_or_else(|| "URL fehlt".to_string())?;
  let url = ensure_scheme(url.trim());

  if cfg!(target_os = "windows") {
    Command::new("cmd")
      .args(["/C", "start", "", &url])
      .spawn()
      .map_err(|err| err.to_string())?;
    return Ok(());
  }

  Command::new("xdg-open")
    .arg(&url)
    .spawn()
    .map_err(|err| err.to_string())?;
  Ok(())
}

fn open_windows_terminal(command: &str, args: &[String]) -> Result<(), String> {
  if which("wt").is_some() {
    let mut wt_args = vec!["-w".to_string(), "0".to_string(), "new-tab".to_string(), "--".to_string()];
    wt_args.push(command.to_string());
    wt_args.extend(args.iter().cloned());
    Command::new("wt")
      .args(wt_args)
      .spawn()
      .map_err(|err| err.to_string())?;
    return Ok(());
  }

  let cmdline = build_windows_cmdline(command, args);
  Command::new("cmd")
    .args(["/C", "start", "", "cmd", "/K", &cmdline])
    .spawn()
    .map_err(|err| err.to_string())?;
  Ok(())
}

fn open_linux_terminal(command: &str, args: &[String]) -> Result<(), String> {
  let profiles = [
    TerminalProfile::new("x-terminal-emulator", TerminalMode::DashE),
    TerminalProfile::new("gnome-terminal", TerminalMode::DoubleDash),
    TerminalProfile::new("konsole", TerminalMode::DashE),
    TerminalProfile::new("xfce4-terminal", TerminalMode::DashE),
    TerminalProfile::new("xterm", TerminalMode::DashE),
    TerminalProfile::new("alacritty", TerminalMode::DashE),
    TerminalProfile::new("kitty", TerminalMode::DashE),
    TerminalProfile::new("wezterm", TerminalMode::Wezterm),
  ];

  for profile in profiles.iter() {
    if which(profile.bin).is_none() {
      continue;
    }
    let result = match profile.mode {
      TerminalMode::DashE => {
        let mut terminal_args = vec!["-e".to_string(), command.to_string()];
        terminal_args.extend(args.iter().cloned());
        Command::new(profile.bin)
          .args(terminal_args)
          .spawn()
      }
      TerminalMode::DoubleDash => {
        let mut terminal_args = vec!["--".to_string(), command.to_string()];
        terminal_args.extend(args.iter().cloned());
        Command::new(profile.bin)
          .args(terminal_args)
          .spawn()
      }
      TerminalMode::Wezterm => {
        let mut terminal_args = vec!["start".to_string(), "--".to_string(), command.to_string()];
        terminal_args.extend(args.iter().cloned());
        Command::new(profile.bin)
          .args(terminal_args)
          .spawn()
      }
    };

    return result.map(|_| ()).map_err(|err| err.to_string());
  }

  Err("Kein Terminal gefunden".to_string())
}

fn ensure_scheme(url: &str) -> String {
  if url.contains("://") {
    url.to_string()
  } else {
    format!("https://{url}")
  }
}

fn which(binary: &str) -> Option<PathBuf> {
  let path_var = std::env::var_os("PATH")?;
  let paths = std::env::split_paths(&path_var);
  for path in paths {
    let candidate = path.join(binary);
    if candidate.is_file() {
      return Some(candidate);
    }
    if cfg!(target_os = "windows") {
      let candidate_exe = path.join(format!("{binary}.exe"));
      if candidate_exe.is_file() {
        return Some(candidate_exe);
      }
    }
  }
  None
}

fn build_windows_cmdline(command: &str, args: &[String]) -> String {
  let mut parts = Vec::new();
  parts.push(windows_quote(command));
  for arg in args {
    parts.push(windows_quote(arg));
  }
  parts.join(" ")
}

fn windows_quote(value: &str) -> String {
  if value.chars().all(|ch| ch.is_ascii_alphanumeric() || "-._/:@\\".contains(ch)) {
    value.to_string()
  } else {
    format!("\"{}\"", value.replace('"', "\\\""))
  }
}

#[cfg(target_os = "windows")]
fn write_rdp_file(
  host: &str,
  port: u16,
  username: &str,
  domain: &str,
  trust_cert: bool,
) -> Result<PathBuf, String> {
  use std::time::{SystemTime, UNIX_EPOCH};
  let mut path = std::env::temp_dir();
  let suffix = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|value| value.as_nanos())
    .unwrap_or(0);
  path.push(format!("simple-remote-manager-{suffix}.rdp"));

  let mut lines = Vec::new();
  lines.push(format!("full address:s:{host}:{port}"));
  if !username.is_empty() {
    lines.push(format!("username:s:{username}"));
  }
  if !domain.is_empty() {
    lines.push(format!("domain:s:{domain}"));
  }
  if trust_cert {
    lines.push("authentication level:i:0".to_string());
  }
  let contents = lines.join("\r\n");
  fs::write(&path, contents).map_err(|err| err.to_string())?;
  Ok(path)
}

struct TerminalProfile {
  bin: &'static str,
  mode: TerminalMode,
}

impl TerminalProfile {
  const fn new(bin: &'static str, mode: TerminalMode) -> Self {
    Self { bin, mode }
  }
}

enum TerminalMode {
  DashE,
  DoubleDash,
  Wezterm,
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![
      load_connections,
      load_settings,
      save_settings,
      password_state,
      save_password,
      delete_password,
      sync_connections,
      save_connections,
      open_connection
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
