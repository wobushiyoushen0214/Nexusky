#[cfg(target_os = "macos")]
mod platform {
    use std::os::raw::{c_int, c_uint, c_void};
    use std::sync::OnceLock;
    use tauri::{Emitter, Manager};

    type OSStatus = c_int;
    type UInt32 = c_uint;
    type OptionBits = UInt32;
    type EventTargetRef = *mut c_void;
    type EventHandlerCallRef = *mut c_void;
    type EventRef = *mut c_void;
    type EventHandlerRef = *mut c_void;
    type EventHotKeyRef = *mut c_void;
    type EventHandlerUPP =
        unsafe extern "C" fn(EventHandlerCallRef, EventRef, *mut c_void) -> OSStatus;

    #[repr(C)]
    #[derive(Clone, Copy)]
    struct EventTypeSpec {
        event_class: UInt32,
        event_kind: UInt32,
    }

    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct EventHotKeyID {
        signature: UInt32,
        id: UInt32,
    }

    #[link(name = "Carbon", kind = "framework")]
    extern "C" {
        fn GetApplicationEventTarget() -> EventTargetRef;
        fn InstallEventHandler(
            target: EventTargetRef,
            handler: EventHandlerUPP,
            num_types: UInt32,
            list: *const EventTypeSpec,
            user_data: *mut c_void,
            out_ref: *mut EventHandlerRef,
        ) -> OSStatus;
        fn RegisterEventHotKey(
            hot_key_code: UInt32,
            hot_key_modifiers: UInt32,
            hot_key_id: EventHotKeyID,
            target: EventTargetRef,
            options: OptionBits,
            out_ref: *mut EventHotKeyRef,
        ) -> OSStatus;
        fn GetEventParameter(
            event: EventRef,
            name: UInt32,
            desired_type: UInt32,
            actual_type: *mut UInt32,
            buffer_size: usize,
            actual_size: *mut usize,
            out_data: *mut c_void,
        ) -> OSStatus;
    }

    static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();
    static HOTKEY_REF: OnceLock<usize> = OnceLock::new();
    static HANDLER_REF: OnceLock<usize> = OnceLock::new();

    const fn fourcc(value: &[u8; 4]) -> UInt32 {
        ((value[0] as UInt32) << 24)
            | ((value[1] as UInt32) << 16)
            | ((value[2] as UInt32) << 8)
            | (value[3] as UInt32)
    }

    const EVENT_CLASS_KEYBOARD: UInt32 = fourcc(b"keyb");
    const EVENT_HOT_KEY_PRESSED: UInt32 = 5;
    const EVENT_PARAM_DIRECT_OBJECT: UInt32 = fourcc(b"----");
    const TYPE_EVENT_HOT_KEY_ID: UInt32 = fourcc(b"hkid");
    const HOTKEY_SIGNATURE: UInt32 = fourcc(b"NXSK");
    const QUICK_CAPTURE_ID: UInt32 = 1;
    const KEY_CODE_N: UInt32 = 45;
    const CMD_KEY: UInt32 = 1 << 8;
    const SHIFT_KEY: UInt32 = 1 << 9;

    unsafe extern "C" fn hotkey_handler(
        _next_handler: EventHandlerCallRef,
        event: EventRef,
        _user_data: *mut c_void,
    ) -> OSStatus {
        let mut hotkey_id = EventHotKeyID::default();
        let status = GetEventParameter(
            event,
            EVENT_PARAM_DIRECT_OBJECT,
            TYPE_EVENT_HOT_KEY_ID,
            std::ptr::null_mut(),
            std::mem::size_of::<EventHotKeyID>(),
            std::ptr::null_mut(),
            &mut hotkey_id as *mut _ as *mut c_void,
        );
        if status != 0
            || hotkey_id.signature != HOTKEY_SIGNATURE
            || hotkey_id.id != QUICK_CAPTURE_ID
        {
            return status;
        }

        if let Some(app) = APP_HANDLE.get() {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            let _ = app.emit("quick-capture", ());
        }
        0
    }

    pub fn register(app: tauri::AppHandle) {
        let _ = APP_HANDLE.set(app);

        let target = unsafe { GetApplicationEventTarget() };
        if target.is_null() {
            eprintln!("[global-shortcut] application event target unavailable");
            return;
        }

        let event_type = EventTypeSpec {
            event_class: EVENT_CLASS_KEYBOARD,
            event_kind: EVENT_HOT_KEY_PRESSED,
        };
        let mut handler_ref: EventHandlerRef = std::ptr::null_mut();
        let handler_status = unsafe {
            InstallEventHandler(
                target,
                hotkey_handler,
                1,
                &event_type,
                std::ptr::null_mut(),
                &mut handler_ref,
            )
        };
        if handler_status != 0 {
            eprintln!("[global-shortcut] InstallEventHandler failed: {handler_status}");
            return;
        }
        let _ = HANDLER_REF.set(handler_ref as usize);

        let mut hotkey_ref: EventHotKeyRef = std::ptr::null_mut();
        let hotkey_status = unsafe {
            RegisterEventHotKey(
                KEY_CODE_N,
                CMD_KEY | SHIFT_KEY,
                EventHotKeyID {
                    signature: HOTKEY_SIGNATURE,
                    id: QUICK_CAPTURE_ID,
                },
                target,
                0,
                &mut hotkey_ref,
            )
        };
        if hotkey_status != 0 {
            eprintln!("[global-shortcut] RegisterEventHotKey failed: {hotkey_status}");
            return;
        }
        let _ = HOTKEY_REF.set(hotkey_ref as usize);
    }
}

#[cfg(not(target_os = "macos"))]
mod platform {
    pub fn register(_app: tauri::AppHandle) {}
}

pub fn register_quick_capture(app: tauri::AppHandle) {
    platform::register(app);
}
