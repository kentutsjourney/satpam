const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); 

// Mapping key perizinan ke teks Bahasa Indonesia
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
// RENDER MENU UTAMA MANAJEMEN MEMBER
// =========================================================================
async function renderMemberPermissionsMenu(ctx, groupId, forcedPermissions = null) {
    try {
        let currentPermissions = {};

        if (forcedPermissions) {
            currentPermissions = forcedPermissions;
        } else {
            // Ambil data perizinan asli dari server Telegram secara real-time
            const chatInfo = await ctx.telegram.getChat(groupId);
            currentPermissions = chatInfo.permissions || {};
        }

        let text = `👥 **MANAJEMEN PERIZINAN ANGGOTA GRUP**\n`;
        text += `📌 **ID Grup:** \`${groupId}\`\n\n`;
        text += `Silakan klik tombol di bawah untuk mengubah hak akses member biasa:\n`;
        text += `🟢 = **Diizinkan** | 🔴 = **Dilarang**`;

        const keyboardButtons = [];

        // Susun tombol saklar perizinan dengan format callback dipisah titik dua (:)
        for (const [key, label] of Object.entries(PERMISSION_MAP)) {
            const isAllowed = currentPermissions[key] !== false; 
            const indicator = isAllowed ? '🟢' : '🔴';
            
            // Format callback baru: manage_perm:IDGRUP:KEYPERIZINAN
            keyboardButtons.push([
                Markup.button.callback(`${indicator} ${label}`, `manage_perm:${groupId}:${key}`)
            ]);
        }

        // Tombol kembali diselaraskan dengan format setting.js kamu
        keyboardButtons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `manage_group:${groupId}`)]);

        const finalKeyboard = Markup.inlineKeyboard(keyboardButtons);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...finalKeyboard }).catch(() => {});
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown', ...finalKeyboard }).catch(() => {});
        }
    } catch (err) {
        console.error('[ERROR] Gagal memuat menu perizinan member:', err.message);
        await ctx.answerCbQuery('❌ Gagal memuat menu perizinan. Pastikan bot adalah admin grup!', { show_alert: true });
    }
}

// Trigger ketika tombol member diklik (Format disesuaikan dengan menus.js yang memakai format ':')
bot.action(/^manage_member:(.+)$/, async (ctx) => {
    const groupId = ctx.match[1];
    await ctx.answerCbQuery('Memuat perizinan anggota... ⏳');
    return renderMemberPermissionsMenu(ctx, groupId);
});

// =========================================================================
// ACTION HANDLER: EKSKUSI PERUBAHAN SAKLAR PERIZINAN (TOGGLE)
// =========================================================================
bot.action(/^manage_perm:(.+):(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const permissionKey = ctx.match[2];

        const replyMarkup = ctx.callbackQuery.message.reply_markup.inline_keyboard;
        const currentPermissions = {};

        // 1. Ekstrak data status dari teks tombol UI saat ini
        let index = 0;
        for (const key of Object.keys(PERMISSION_MAP)) {
            const buttonText = replyMarkup[index][0].text;
            currentPermissions[key] = buttonText.startsWith('🟢');
            index++;
        }

        // 2. Balikkan nilai perizinan yang ditekan
        const nextStatus = !currentPermissions[permissionKey];
        currentPermissions[permissionKey] = nextStatus;

        // 3. Hitung kondisi media aktif
        const anyMediaActive = 
            currentPermissions.can_send_photos || 
            currentPermissions.can_send_videos || 
            currentPermissions.can_send_audios || 
            currentPermissions.can_send_documents || 
            currentPermissions.can_send_voice_notes || 
            currentPermissions.can_send_video_notes;

        currentPermissions.can_send_media_messages = anyMediaActive;

        // 4. Pengaman: Jika izin kirim pesan teks dimatikan, matikan seluruh turunan hak akses
        if (permissionKey === 'can_send_messages' && nextStatus === false) {
            Object.keys(PERMISSION_MAP).forEach(key => {
                currentPermissions[key] = false;
            });
            currentPermissions.can_send_media_messages = false;
        }

        // 5. Eksekusi perubahan nyata langsung ke API Telegram grup
        await ctx.telegram.setChatPermissions(groupId, currentPermissions);

        await ctx.answerCbQuery(`⚡ Perizinan diperbarui: ${nextStatus ? '🟢 Diizinkan' : '🔴 Dilarang'}`);

        // 6. Segarkan tampilan UI tombol menggunakan data lokal terbaru yang valid
        return renderMemberPermissionsMenu(ctx, groupId, currentPermissions);

    } catch (err) {
        console.error('[ERROR FATAL] Gagal eksekusi saklar perizinan:', err.message);
        await ctx.answerCbQuery(`❌ Gagal merubah perizinan: ${err.message}`, { show_alert: true });
    }
});

module.exports = { renderMemberPermissionsMenu };