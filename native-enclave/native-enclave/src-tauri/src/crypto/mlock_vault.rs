// KYLLANG_V4: Secure memory vault using mlock
// Prevents secret keys from being paged to disk swap space.

#[cfg(unix)]
pub fn lock_memory(ptr: *const u8, size: usize) -> Result<(), String> {
    unsafe {
        if libc::mlock(ptr as *const libc::c_void, size) != 0 {
            return Err("Failed to lock memory".to_string());
        }
    }
    Ok(())
}

#[cfg(windows)]
pub fn lock_memory(ptr: *const u8, size: usize) -> Result<(), String> {
    use windows_sys::Win32::System::Memory::VirtualLock;
    use std::ffi::c_void;
    
    unsafe {
        let res = VirtualLock(ptr as *const c_void, size);
        if res == 0 {
            return Err("Failed to lock memory using VirtualLock".to_string());
        }
    }
    Ok(())
}

#[cfg(not(any(unix, windows)))]
pub fn lock_memory(_ptr: *const u8, _size: usize) -> Result<(), String> {
    // Fallback for non-unix, non-windows or unimplemented platforms
    Ok(())
}
