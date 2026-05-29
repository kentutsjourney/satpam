const { Markup } = require('telegraf');

/**
 * 1. Menu Utama Pengaturan Grup (diakses privat)
 */
function getMainSettingsMenu(settings, groupId) {
    const welcomeIndicator = settings.welcome_status ? '🟢' : '🔴';
    const antiFloodIndicator = settings.anti_flood_status ? '🟢' : '🔴';
    const antiLinkIndicator = settings.anti_link_status ? '🟢' : '🔴';

    return Markup.inlineKeyboard([
        [
            Markup.button.callback(`${welcomeIndicator} Fitur Sambutan`, `toggle_welcome_${groupId}`),
            Markup.button.callback(`${antiFloodIndicator} Anti-Flood`, `toggle_flood_${groupId}`)
        ],
        [
            Markup.button.callback(`${antiLinkIndicator} Anti-Link`, `toggle_link_${groupId}`),
            Markup.button.callback('⚙️ Konfigurasi Sambutan', `menu_welcome_config_${groupId}`)
        ],
        [
            Markup.button.callback('👥 Hak Akses Admin', `manage_admins_${groupId}`),
            Markup.button.callback('🔑 Otoritas Owner', `manage_owner_rules_${groupId}`)
        ],
        [
            Markup.button.callback('⌨️ Panduan Command', `view_commands_${groupId}`),
            Markup.button.callback('❌ Tutup Menu', 'close_settings')
        ]
    ]);
}

/**
 * 2. SUB-MENU KHUSUS SAMBUTAN (WELCOME CONFIG)
 */
function getWelcomeConfigMenu(groupId, currentButtonsCount = 0) {
    const buttons = [
        [
            Markup.button.callback('📸 Atur Foto Sambutan', `edit_welcome_photo_${groupId}`),
            Markup.button.callback('📝 Atur Teks Sambutan', `edit_welcome_text_${groupId}`)
        ]
    ];

    if (currentButtonsCount < 10) {
        buttons.push([Markup.button.callback('➕ Tambah Tombol Link', `add_welcome_btn_${groupId}`)]);
    } else {
        buttons.push([Markup.button.callback('⚠️ Tombol Link Penuh (Maks 10)', `noop`)]);
    }

    if (currentButtonsCount > 0) {
        buttons.push([
            Markup.button.callback('✏️ Edit Tombol', `edit_welcome_btn_list_${groupId}`),
            Markup.button.callback('🗑️ Hapus Tombol', `del_welcome_btn_list_${groupId}`)
        ]);
    }

    buttons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `back_to_main_${groupId}`)]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * 3. Menu Daftar Grup + Tombol Tambah Grup + SAKLAR DEWA ON/OFF GLOBAL
 * (Menerima parameter tambahan: userId dan maintenanceStatus)
 */
function getGroupSelectionMenu(groups, userId, maintenanceStatus = false) {
    const buttons = [];
    const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama Bot


    if (!groups || groups.length === 0) {
     
        buttons.push([Markup.button.callback('❌ Tidak ada grup anda yang terdaftar', 'noop')]);
    } else {
        // Layar Dewa atau Owner Lain (Tergantung filter data di handler)
        groups.forEach(g => {
            if (userId === OWNER_ID) {
                // Tampilan Khusus Dewa: Ada nama grup dan tombol Hapus di sebelahnya
                buttons.push([
                    Markup.button.callback(`📁 ${g.group_name || `Grup (${g.group_id})`}`, `select_group_${g.group_id}`),
                    Markup.button.callback(`❌ Hapus`, `confirm_delete_${g.group_id}`)
                ]);
            } else {
                // Tampilan Owner Biasa: Hanya daftar grup miliknya saja
                buttons.push([Markup.button.callback(`📁 ${g.group_name || `Grup (${g.group_id})`}`, `select_group_${g.group_id}`)]);
            }
        });
    }

    // Tombol tambah grup (Hanya muncul jika yang akses adalah sang Dewa/Owner Bot)
    if (userId === OWNER_ID) {
        buttons.push([Markup.button.callback('➕ Tambahkan Grup Chat Owner Bot', 'start_whitelist_process')]);
        
        // KIR: FITUR DEWA SAKLAR ON/OFF GLOBAL DI SINI
        const statusEmoji = maintenanceStatus ? '🔴 BOT: OFF (Maintenance)' : '🟢 BOT: ON (Normal)';
        buttons.push([Markup.button.callback(statusEmoji, 'toggle_global_maintenance')]);
    }
    
    return Markup.inlineKeyboard(buttons);
}

/**
 * 4. Menu hak akses admin
 */
function getAdminAccessMenu(admins, allowedAdmins, groupId) {
    const buttons = admins.map(admin => {
        const isAllowed = allowedAdmins.includes(admin.user.id);
        const indicator = isAllowed ? '✅' : '❌';
        const name = admin.user.first_name;
        
        return [Markup.button.callback(`${indicator} ${name}`, `toggle_admin_${groupId}_${admin.user.id}`)];
    });

    buttons.push([Markup.button.callback('⬅️ Kembali', `back_to_main_${groupId}`)]);
    return Markup.inlineKeyboard(buttons);
}

module.exports = {
    getMainSettingsMenu,
    getWelcomeConfigMenu,
    getGroupSelectionMenu,
    getAdminAccessMenu
};