const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); 
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
// RENDER MENU UTAMA MANAJEMEN MEMBER (DENGAN FALLBACK OBJECT)
// =========================================================================
async function renderMemberPermissionsMenu(ctx, groupId, forcedPermissions = null) {
    try {
        let currentPermissions = {};
        let chatTitle = 'Grup Chat';

        // Jika dipanggil setelah toggle, gunakan data lokal terbaru agar instan & anti-error
        if (forcedPermissions) {
            currentPermissions = forcedPermissions;
        } else {
            // Jika baru dibuka pertama kali, ambil dari Telegram
            const chatInfo = await ctx.telegram.getChat(groupId);
            chatTitle = chatInfo.title || chatTitle;
            currentPermissions = chatInfo.permissions || {};
        }

        let text = `👥 **MANAJEMEN PERIZINAN ANGGOTA GRUP**\n`;
        text += `📌 **ID Grup:** \`${groupId}\`\n\n`;
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

        keyboardButtons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `back_to_main_${groupId}`)]);

        const finalKeyboard = Markup.inlineKeyboard(keyboardButtons);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...finalKeyboard }).catch(() => {});
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown', ...finalKeyboard }).catch(() => {});
        }
    } catch (err) {
        console.error('[ERROR] Gagal memuat menu perizinan member:', err.message);
        await ctx.answerCbQuery('❌ Gagal memuat menu perizinan.', { show_alert: true });
    }
}

bot.action(/^manage_member_(.+)$/, async (ctx) => {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery('Memuat perizinan anggota... ⏳');
    return renderMemberPermissionsMenu(ctx, groupId);
});

bot.action(/^back_to_main_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        await ctx.answerCbQuery('Kembali... ⏳');
        const { data: settings, error } = await supabase.from('group_settings').select('*').eq('group_id', groupId).single();
        if (error || !settings) return ctx.answerCbQuery('❌ Gagal memuat konfigurasi menu utama.', { show_alert: true });
        const chatInfo = await ctx.telegram.getChat(groupId).catch(() => ({ title: 'Grup Chat' }));
        let text = `⚙️ **PENGATURAN GRUP CHAT**\n📌 **Grup:** ${chatInfo.title}\nID: \`${groupId}\`\n\nSilakan pilih modul di bawah:`;
        return ctx.editMessageText(text, { parse_mode: 'Markdown', ...getMainSettingsMenu(settings, groupId) });
    } catch (err) {
        console.error('Error back handler:', err);
    }
});

// =========================================================================
// ACTION HANDLER: EKSKUSI PERUBAHAN SAKLAR PERIZINAN (TOGGLE)
// =========================================================================
bot.action(/^manage_perm_(-?\d+)_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const permissionKey = ctx.match[2];

        // Ganti pembacaan ke objek tombol inline yang aktif saat ini untuk menghindari getChat error
        const replyMarkup = ctx.callbackQuery.message.reply_markup.inline_keyboard;
        const currentPermissions = {};

        // Rekonstruksi status perizinan berdasarkan warna emoji tombol saat ini di layar
        let index = 0;
        for (const key of Object.keys(PERMISSION_MAP)) {
            const buttonText = replyMarkup[index][0].text;
            currentPermissions[key] = buttonText.startsWith('🟢');
            index++;
        }

        // Jalankan logika pembalikan status (Toggle)
        const nextStatus = !currentPermissions[permissionKey];
        currentPermissions[permissionKey] = nextStatus;

        // Logika Pengaman Induk Pesan Teks
        if (permissionKey === 'can_send_messages' && nextStatus === false) {
            currentPermissions.can_send_audios = false;
            currentPermissions.can_send_documents = false;
            currentPermissions.can_send_photos = false;
            currentPermissions.can_send_videos = false;
            currentPermissions.can_send_video_notes = false;
            currentPermissions.can_send_voice_notes = false;
            currentPermissions.can_send_polls = false;
            currentPermissions.can_send_other_messages = false;
        }

        // Sinkronisasi parameter internal media Telegram
        const anyMediaActive = 
            currentPermissions.can_send_photos || currentPermissions.can_send_videos || 
            currentPermissions.can_send_audios || currentPermissions.can_send_documents || 
            currentPermissions.can_send_voice_notes || currentPermissions.can_send_video_notes;

        currentPermissions.can_send_media_messages = anyMediaActive;

        // Tembak perubahan perizinan ke Telegram grup
        await ctx.telegram.setChatPermissions(groupId, currentPermissions);

        await ctx.answerCbQuery(`⚡ Perizinan diperbarui: ${nextStatus ? '🟢 Diizinkan' : '🔴 Dilarang'}`);

        // Langsung lempar payload currentPermissions ke fungsi render (Anti-Delay, Anti-Error!)
        return renderMemberPermissionsMenu(ctx, groupId, currentPermissions);

    } catch (err) {
        console.error('[ERROR FATAL] Gagal eksekusi saklar perizinan:', err.message);
        await ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
    }
});

module.exports = { renderMemberPermissionsMenu };