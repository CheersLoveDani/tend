const COMMANDS: &[&str] = &[
    "set_state",
    "get_permissions",
    "request_permission",
    "take_launch_action",
    "take_pending_actions",
    "download_update",
    "install_update",
    "move_to_back",
    "choose_backup_file",
    "backup_target",
    "write_backup",
    "open_backup_file",
    "health_status",
    "health_request",
    "health_read",
    // Needed so `addPluginListener('tend-native', ...)` passes the ACL.
    "register_listener",
    "remove_listener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
