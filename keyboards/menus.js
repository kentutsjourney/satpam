const { Markup } = require('telegraf');

/**
 * 1. Menu Utama Pengaturan Grup (diakses privat)
 * DISERAGAMKAN: Semua callback_data menggunakan pemisah titik dua (:) agar sinkron dengan setting.js
 */
function getMainSettingsMenu(settings, groupId) {
    const welcomeIndicator = settings.welcome_status ? '🟢' : '🔴';
    const antiFloodIndicator = settings.anti_flood_status ? '🟢' : '🔴';
    const antiLinkIndicator = settings.anti_link_status ? '🟢' : '🔴';

    return Markup.inlineKeyboard([
        [
            Markup.button.callback(`${welcomeIndicator} Fitur Sambutan`, `toggle_welcome:${groupId}`),
            Markup.button.callback(`${antiFloodIndicator} Anti-Flood`, `toggle_flood:${groupId}`)
        ],
        [
            Markup.button.callback(`${antiLinkIndicator} Anti-Link`, `toggle_link:${groupId}`),
            Markup.button.callback('⚙️ Konfigurasi Sambutan', `menu_welcome_config:${groupId}`)
        ],
        [
            Markup.button.callback('👥 Hak Akses Admin', `manage_admins:${groupId}`),
            Markup.button.callback('🔑 Otoritas Owner', `manage_owner_rules:${groupId}`)
        ],
        [
            Markup.button.callback('⌨️ Panduan Command', `view_commands:${groupId}`),
            // KUNCI UTAMA: Format diubah ke titik dua (:) agar sinkron ke memberManagement.js
            Markup.button.callback('👥 Pengaturan Member', `manage_member:${groupId}`)
        ],
        // Tombol tambahan agar owner bisa kembali ke menu utama daftar grup kapan saja
        [Markup.button.callback('⬅️ Kembali ke Daftar Grup', 'back_to_groups')]
    ]);
}

/**
 * 2. SUB-MENU KHUSUS SAMBETAN (WELCOME CONFIG)
 */
function getWelcomeConfigMenu(groupId, currentButtonsCount = 0) {
    const buttons = [
        [
            Markup.button.callback('📸 Atur Foto Sambutan', `edit_welcome_photo:${groupId}`),
            Markup.button.callback('📝 Atur Teks Sambutan', `edit_welcome_text:${groupId}`)
        ]
    ];

    if (currentButtonsCount < 10) {
        buttons.push([Markup.button.callback('➕ Tambah Tombol Link', `add_welcome_btn:${groupId}`)]);
    } else {
        buttons.push([Markup.button.callback('⚠️ Tombol Link Penuh (Maks 10)', `noop`)]);
    }

    if (currentButtonsCount > 0) {
        buttons.push([
            Markup.button.callback('✏️ Edit Tombol', `edit_welcome_btn_list:${groupId}`),
            Markup.button.callback('🗑️ Hapus Tombol', `del_welcome_btn_list:${groupId}`)
        ]);
    }

    buttons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `manage_group:${groupId}`)]);

    return Markup.inlineKeyboard(buttons);
}

/**
 * 3. Menu Daftar Grup + Tombol Tambah Grup + SAKLAR DEWA ON/OFF GLOBAL
 */
function getGroupSelectionMenu(groups, userId, maintenanceStatus = false) {
    const buttons = [];
    const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama Bot

    if (!groups || groups.length === 0) {
        buttons.push([Markup.button.callback('❌ Tidak ada grup anda yang terdaftar', 'noop')]);
    } else {
        groups.forEach(g => {
            if (userId === OWNER_ID) {
                // Format pemicu masuk ke grup: manage_group:ID_GRUP
                buttons.push([
                    Markup.button.callback(`📁 ${g.group_name || `Grup (${g.group_id})`}`, `manage_group:${g.group_id}`),
                    Markup.button.callback(`❌ Hapus`, `confirm_delete:${g.group_id}`)
                ]);
            } else {
                buttons.push([Markup.button.callback(`📁 ${g.group_name || `Grup (${g.group_id})`}`, `manage_group:${g.group_id}`)]);
            }
        });
    }

    if (userId === OWNER_ID) {
        buttons.push([Markup.button.callback('➕ Tambahkan Grup Chat Owner Bot', 'start_whitelist_process')]);
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
        
        return [Markup.button.callback(`${indicator} ${name}`, `toggle_admin:${groupId}:${admin.user.id}`)];
    });

    buttons.push([Markup.button.callback('⬅️ Kembali', `manage_group:${groupId}`)]);
    return Markup.inlineKeyboard(buttons);
}

module.exports = {
    getMainSettingsMenu,
    getWelcomeConfigMenu,
    getGroupSelectionMenu,
    getAdminAccessMenu
};