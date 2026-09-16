// KYLLANG_V4: Securely erase keys from memory when they are dropped

use zeroize::Zeroize;

pub struct SecureKey {
    pub data: Vec<u8>,
}

impl SecureKey {
    pub fn new(data: Vec<u8>) -> Result<Self, String> {
        crate::crypto::mlock_vault::lock_memory(data.as_ptr(), data.len())?;
        Ok(Self { data })
    }
}

impl Drop for SecureKey {
    fn drop(&mut self) {
        self.data.zeroize();
    }
}
