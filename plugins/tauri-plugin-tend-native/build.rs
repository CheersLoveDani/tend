const COMMANDS: &[&str] = &[
    "set_state",
    "get_permissions",
    "request_permission",
    "take_launch_action",
    "take_pending_actions",
    "download_update",
    "install_update",
    // Needed so `addPluginListener('tend-native', ...)` passes the ACL.
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
