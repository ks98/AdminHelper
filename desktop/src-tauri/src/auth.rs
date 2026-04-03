use serde::Deserialize;

use crate::error::AppError;
use crate::models::AuthSession;

const KEYRING_SERVICE: &str = "com.simpleremote.manager";
const KEYRING_JWT_KEY: &str = "auth|jwt";
const KEYRING_SERVER_URL_KEY: &str = "auth|server_url";

#[derive(Deserialize)]
struct LoginResponse {
    access_token: String,
}

#[derive(Deserialize)]
struct MeResponse {
    username: String,
    #[serde(default)]
    is_admin: bool,
}

pub fn build_client(server_url: &str) -> Result<reqwest::Client, AppError> {
    let accept_invalid = server_url.starts_with("https://localhost")
        || server_url.starts_with("https://127.0.0.1");
    reqwest::Client::builder()
        .danger_accept_invalid_certs(accept_invalid)
        .build()
        .map_err(AppError::from)
}

pub async fn login(server_url: &str, username: &str, password: &str) -> Result<AuthSession, AppError> {
    let url = format!("{}/api/auth/login", server_url.trim_end_matches('/'));
    let client = build_client(server_url)?;
    let body = serde_json::json!({
        "username": username,
        "password": password,
    });

    let response = client
        .post(&url)
        .json(&body)
        .send()
        .await?;

    if !response.status().is_success() {
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        return Err(AppError::Validation(format!(
            "Login fehlgeschlagen ({}): {}",
            status, text
        )));
    }

    let login_resp: LoginResponse = response.json().await?;

    let me = fetch_me(server_url, &login_resp.access_token).await?;

    let session = AuthSession {
        server_url: server_url.trim_end_matches('/').to_string(),
        token: login_resp.access_token,
        username: me.username,
        is_admin: me.is_admin,
    };

    save_session_to_keyring(&session)?;

    Ok(session)
}

async fn fetch_me(server_url: &str, token: &str) -> Result<MeResponse, AppError> {
    let url = format!("{}/api/auth/me", server_url.trim_end_matches('/'));
    let client = build_client(server_url)?;
    let response = client
        .get(&url)
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(AppError::Validation("Session ungültig".to_string()));
    }

    Ok(response.json().await?)
}

pub async fn check_session() -> Result<Option<AuthSession>, AppError> {
    let (server_url, token) = match load_session_from_keyring() {
        Ok(pair) => pair,
        Err(_) => return Ok(None),
    };

    match fetch_me(&server_url, &token).await {
        Ok(me) => Ok(Some(AuthSession {
            server_url,
            token,
            username: me.username,
            is_admin: me.is_admin,
        })),
        Err(_) => {
            let _ = clear_keyring();
            Ok(None)
        }
    }
}

pub fn logout() -> Result<(), AppError> {
    clear_keyring()
}

// ── Keyring helpers ──────────────────────────────────────────────────

fn save_session_to_keyring(session: &AuthSession) -> Result<(), AppError> {
    #[cfg(unix)]
    {
        use keyring::Entry;
        let jwt_entry = Entry::new(KEYRING_SERVICE, KEYRING_JWT_KEY)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        jwt_entry
            .set_password(&session.token)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        let url_entry = Entry::new(KEYRING_SERVICE, KEYRING_SERVER_URL_KEY)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        url_entry
            .set_password(&session.server_url)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use crate::password::{windows_store_credential, to_utf16_null};
        windows_store_credential(KEYRING_JWT_KEY, "srm", &session.token)?;
        windows_store_credential(KEYRING_SERVER_URL_KEY, "srm", &session.server_url)?;
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", unix)))]
    {
        Ok(())
    }
}

fn load_session_from_keyring() -> Result<(String, String), AppError> {
    #[cfg(unix)]
    {
        use keyring::Entry;
        let jwt_entry = Entry::new(KEYRING_SERVICE, KEYRING_JWT_KEY)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        let token = jwt_entry
            .get_password()
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        let url_entry = Entry::new(KEYRING_SERVICE, KEYRING_SERVER_URL_KEY)
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        let server_url = url_entry
            .get_password()
            .map_err(|e| AppError::Keyring(e.to_string()))?;
        Ok((server_url, token))
    }
    #[cfg(target_os = "windows")]
    {
        // TODO: Windows keyring read for JWT
        Err(AppError::Keyring("Nicht implementiert".to_string()))
    }
    #[cfg(not(any(target_os = "windows", unix)))]
    {
        Err(AppError::Keyring("Plattform nicht unterstützt".to_string()))
    }
}

fn clear_keyring() -> Result<(), AppError> {
    #[cfg(unix)]
    {
        use keyring::{Entry, Error as KeyringError};
        for key in [KEYRING_JWT_KEY, KEYRING_SERVER_URL_KEY] {
            if let Ok(entry) = Entry::new(KEYRING_SERVICE, key) {
                match entry.delete_password() {
                    Ok(_) | Err(KeyringError::NoEntry) => {}
                    Err(e) => return Err(AppError::Keyring(e.to_string())),
                }
            }
        }
        Ok(())
    }
    #[cfg(target_os = "windows")]
    {
        use crate::password::windows_delete_credential;
        let _ = windows_delete_credential(KEYRING_JWT_KEY);
        let _ = windows_delete_credential(KEYRING_SERVER_URL_KEY);
        Ok(())
    }
    #[cfg(not(any(target_os = "windows", unix)))]
    {
        Ok(())
    }
}
