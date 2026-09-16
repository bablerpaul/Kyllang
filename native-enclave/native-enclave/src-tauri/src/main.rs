// KYLLANG_V4: Tauri Native Enclave Entry Point
#![cfg_attr(
  all(not(debug_assertions), target_os = "windows"),
  windows_subsystem = "windows"
)]

mod crypto;

#[tauri::command]
fn encrypt_key_enclave(payload: String, recipient_pub_b64: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    
    // Decode recipient pubkey
    let pubkey_bytes = STANDARD.decode(&recipient_pub_b64).map_err(|e| e.to_string())?;
    let secure_pubkey = crypto::key_zeroize::SecureKey::new(pubkey_bytes)?;
    
    let encrypted = crypto::tpre_ops::encrypt_tpre(payload.as_bytes(), &secure_pubkey.data)?;
    Ok(STANDARD.encode(encrypted))
}

#[tauri::command]
fn decrypt_key_enclave(payload_b64: String, my_priv_b64: String) -> Result<String, String> {
    use base64::{engine::general_purpose::STANDARD, Engine};
    
    // Decode private key
    let privkey_bytes = STANDARD.decode(&my_priv_b64).map_err(|e| e.to_string())?;
    // SecureKey locks the memory upon creation, and zeroizes upon drop.
    let secure_privkey = crypto::key_zeroize::SecureKey::new(privkey_bytes)?;
    
    // Decode cipher
    let cipher_bytes = STANDARD.decode(&payload_b64).map_err(|e| e.to_string())?;
    
    let decrypted = crypto::tpre_ops::decrypt_tpre(&cipher_bytes, &secure_privkey.data)?;
    String::from_utf8(decrypted).map_err(|e| e.to_string())
}

fn main() {
  tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![encrypt_key_enclave, decrypt_key_enclave])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
