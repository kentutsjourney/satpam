const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); 
// Import file menus.js kamu untuk memanggil menu utama saat tombol kembali diklik
const { getMainSettingsMenu } = require('../keyboards/menus'); 

const PERMISSION_MAP = {
    can_send_messages: 'Mengirim Pesan Teks',
    can_send_audios: 'Mengirim Musik/Audio',
    can_send_documents: 'Mengirim File/Berkas',
    can_send_photos: 'Mengirim Foto',
    can_send_videos: 'Mengirim Video',
    can_send_video_notes: 'Mengirim Pesan Video Bulat',
    can_send_voice_notes: 'Mengirim Pesan Suara (VN)',
    can_send_polls: 'Membuat Polling/Kuis',
    can_send_other_messages: 'Stiker, GIF, & Game',
    can_add_web_page_previews: 'Preview Tautan Link',
    can_invite_users: 'Menambahkan Anggota Baru',
    can_pin_messages: 'Menyematkan (Pin) Pesan'
};

// =========================================================================
// RENDER MENU UTAMA MANAJEMEN MEMBER (PERIZINAN GRUP)
// =========================================================================
async function renderMemberPermissionsMenu(ctx, groupId) {
    try {
        const chatInfo = await ctx.telegram.getChat(groupId);
        const currentPermissions = chatInfo.permissions || {};

        let text = `👥 **MANAJEMEN PERIZINAN ANGGOTA GRUP**\n`;
        text += `📌 **Grup:** ${chatInfo.title}\n`;
        text += `ID: \`${groupId}\`\n\n`;
        text += `Silakan klik tombol di bawah untuk mengubah hak akses member biasa:\n`;
        text += `🟢 = **Diizinkan** | 🔴 = **Dilarang**`;

        const keyboardButtons = [];

        for (const [key, label] of Object.entries(PERMISSION_MAP)) {
            const isAllowed = currentPermissions[key] !== false; 
            const indicator = isAllowed ? '🟢' : '🔴';
            
            keyboardButtons.push([
                Markup.button.callback(`${indicator} ${label}`, `manage_perm_${groupId}_${key}`)
            ]);
        }

        // Tombol Kembali mengarah ke back_to_main_
        keyboardButtons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `back_to_main_${groupId}`)]);

        const finalKeyboard = Markup.inlineKeyboard(keyboardButtons);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...finalKeyboard });
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown', ...finalKeyboard });
        }
    } catch (err) {
        console.error('Gagal memuat menu perizinan member:', err);
        await ctx.answerCbQuery('❌ Gagal memuat data grup. Pastikan bot masih menjadi admin!', { show_alert: true });
    }
}

// Trigger ketika tombol "👥 Pengaturan Member" dari menus.js diklik
bot.action(/^manage_member_(.+)$/, async (ctx) => {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery('Memuat perizinan anggota... ⏳');
    return renderMemberPermissionsMenu(ctx, groupId);
});

// =========================================================================
// INTERSEPTOR / BACK HANDLER: KEMBALI KE MENU UTAMA GRUP
// =========================================================================
// Bagian ini sangat krusial untuk mencegah "Terjadi kesalahan internal"!
bot.action(/^back_to_main_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        await ctx.answerCbQuery('Kembali... ⏳');

        // 1. Ambil data konfigurasi grup dari database Supabase terlebih dahulu
        const { data: settings, error } = await supabase
            .from('group_settings') // Sesuaikan dengan nama tabel group settings kamu jika berbeda
            .select('*')
            .eq('group_id', groupId)
            .single();

        if (error || !settings) {
            console.error('Gagal mengambil settings saat tombol kembali diklik:', error);
            return ctx.answerCbQuery('❌ Gagal memuat konfigurasi menu utama.', { show_alert: true });
        }

        // 2. Ambil informasi nama grup langsung dari Telegram
        const chatInfo = await ctx.telegram.getChat(groupId);

        let text = `⚙️ **PENGATURAN GRUP CHAT**\n`;
        text += `📌 **Grup:** ${chatInfo.title}\n`;
        text += `ID: \`${groupId}\`\n\n`;
        text += `Silakan pilih modul fitur yang ingin kamu konfigurasi di bawah ini:`;

        // 3. Render ulang menu utama menggunakan getMainSettingsMenu dari menus.js kamu
        return ctx.editMessageText(text, {
            parse_mode: 'Markdown',
            ...getMainSettingsMenu(settings, groupId)
        });

    } catch (err) {
        console.error('Error pada handler back_to_main:', err);
        await ctx.answerCbQuery('❌ Terjadi kesalahan internal saat kembali.', { show_alert: true });
    }
});

// =========================================================================
// ACTION HANDLER: EKSKUSI PERUBAHAN SAKLAR PERIZINAN (TOGGLE)
// =========================================================================
bot.action(/^manage_perm_(-?\d+)_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const permissionKey = ctx.match[2];

        const chatInfo = await ctx.telegram.getChat(groupId);
        let currentPermissions = { ...chatInfo.permissions };

        const currentStatus = currentPermissions[permissionKey] !== false;
        const nextStatus = !currentStatus;
        
        currentPermissions[permissionKey] = nextStatus;

        // Aturan bawaan Telegram: Jika mematikan teks, semua media otomatis ikut mati
        if (permissionKey === 'can_send_messages' && nextStatus === false) {
            currentPermissions.can_send_media_messages = false;
            currentPermissions.can_send_photos = false;
            currentPermissions.can_send_videos = false;
            currentPermissions.can_send_voice_notes = false;
            currentPermissions.can_send_video_notes = false;
            currentPermissions.can_send_audios = false;
            currentPermissions.can_send_documents = false;
            currentPermissions.can_send_other_messages = false;
            currentPermissions.can_send_polls = false;
        }

        await ctx.telegram.setChatPermissions(groupId, currentPermissions);
        await ctx.answerCbQuery(`⚡ Perizinan diperbarui: ${nextStatus ? '🟢 Diizinkan' : '🔴 Dilarang'}`);

        return renderMemberPermissionsMenu(ctx, groupId);

    } catch (err) {
        console.error('Error saat merubah permission grup:', err);
        await ctx.answerCbQuery('❌ Gagal merubah izin. Pastikan Bot Satpam adalah Admin dengan hak Restrict Users!', { show_alert: true });
    }
});

module.exports = { renderMemberPermissionsMenu };