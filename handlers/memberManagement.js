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
// RENDER MENU UTAMA MANAJEMEN MEMBER
// =========================================================================
async function renderMemberPermissionsMenu(ctx, groupId) {
    try {
        console.log(`[DEBUG] Membaca data perizinan untuk grup ID: ${groupId}`);
        
        const chatInfo = await ctx.telegram.getChat(groupId);
        const currentPermissions = chatInfo.permissions || {};

        // PELACAK 1: Mari kita intip apa yang dikembalikan oleh Telegram ke Vercel Logs kamu
        console.log('[DEBUG] Data Perizinan dari Telegram saat ini:', JSON.stringify(currentPermissions));

        let text = `👥 **MANAJEMEN PERIZINAN ANGGOTA GRUP**\n`;
        text += `📌 **Grup:** ${chatInfo.title}\n`;
        text += `ID: \`${groupId}\`\n\n`;
        text += `Silakan klik tombol di bawah untuk mengubah hak akses member biasa:\n`;
        text += `🟢 = **Diizinkan** | 🔴 = **Dilarang**`;

        const keyboardButtons = [];

        for (const [key, label] of Object.entries(PERMISSION_MAP)) {
            // Jika undefined atau tidak bernilai false, kita anggap true (Hijau)
            const isAllowed = currentPermissions[key] !== false; 
            const indicator = isAllowed ? '🟢' : '🔴';
            
            keyboardButtons.push([
                Markup.button.callback(`${indicator} ${label}`, `manage_perm_${groupId}_${key}`)
            ]);
        }


        keyboardButtons.push([Markup.button.callback('⬅️ Kembali ke Menu Utama', `back_to_main_${groupId}`)]);

        const finalKeyboard = Markup.inlineKeyboard(keyboardButtons);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(text, { parse_mode: 'Markdown', ...finalKeyboard });
        } else {
            await ctx.reply(text, { parse_mode: 'Markdown', ...finalKeyboard });
        }
    } catch (err) {
        console.error('[ERROR] Gagal memuat menu perizinan member:', err);
        await ctx.answerCbQuery('❌ Gagal memuat data grup. Pastikan bot masih menjadi admin!', { show_alert: true });
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
        const chatInfo = await ctx.telegram.getChat(groupId);
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

        console.log(`[DEBUG] Tombol diklik! Key: ${permissionKey} pada Grup: ${groupId}`);

        const chatInfo = await ctx.telegram.getChat(groupId);
        const tgPermissions = chatInfo.permissions || {};


        const currentPermissions = {
            can_send_messages: tgPermissions.can_send_messages !== false,
            can_send_audios: tgPermissions.can_send_audios !== false,
            can_send_documents: tgPermissions.can_send_documents !== false,
            can_send_photos: tgPermissions.can_send_photos !== false,
            can_send_videos: tgPermissions.can_send_videos !== false,
            can_send_video_notes: tgPermissions.can_send_video_notes !== false,
            can_send_voice_notes: tgPermissions.can_send_voice_notes !== false,
            can_send_polls: tgPermissions.can_send_polls !== false,
            can_send_other_messages: tgPermissions.can_send_other_messages !== false,
            can_add_web_page_previews: tgPermissions.can_add_web_page_previews !== false,
            can_invite_users: tgPermissions.can_invite_users !== false,
            can_pin_messages: tgPermissions.can_pin_messages !== false,
        };

        // Balikkan nilainya
        const nextStatus = !currentPermissions[permissionKey];
        currentPermissions[permissionKey] = nextStatus;


        if (permissionKey === 'can_send_messages' && nextStatus === false) {
            currentPermissions.can_send_audios = false;
            currentPermissions.can_send_documents = false;
            currentPermissions.can_send_photos = false;
            currentPermissions.can_send_videos = false;
            currentPermissions.can_send_voice_notes = false;
            currentPermissions.can_send_video_notes = false;

            currentPermissions.can_send_polls = false;
            currentPermissions.can_send_other_messages = false;
        }


        const anyMediaActive = 
            currentPermissions.can_send_photos || currentPermissions.can_send_videos || 
            currentPermissions.can_send_audios || currentPermissions.can_send_documents || 
            currentPermissions.can_send_voice_notes || currentPermissions.can_send_video_notes;

        currentPermissions.can_send_media_messages = anyMediaActive;

        // PELACAK 2: Intip konfigurasi baru sebelum ditembakkan ke Telegram
        console.log('[DEBUG] Mengirimkan Payload Perizinan Baru ke Telegram:', JSON.stringify(currentPermissions));

        // Tembak ke Telegram
        const success = await ctx.telegram.setChatPermissions(groupId, currentPermissions);
        
        // PELACAK 3: Lihat respon balik Telegram, apakah true (berhasil) atau false (diabaikan)
        console.log(`[DEBUG] Hasil eksekusi Telegram setChatPermissions: ${success}`);

        await ctx.answerCbQuery(`⚡ Perizinan diperbarui: ${nextStatus ? '🟢 Diizinkan' : '🔴 Dilarang'}`);

        // Beri jeda 500 milidetik (0.5 detik) sebelum render ulang untuk meminimalisir Caching API Telegram
        await new Promise(resolve => setTimeout(resolve, 500));

        return renderMemberPermissionsMenu(ctx, groupId);

    } catch (err) {
        // PELACAK 4: Jika Telegram melempar error tertulis (misalnya masalah hak admin)
        console.error('[ERROR FATAL] Gagal eksekusi saklar perizinan:', err.message);
        await ctx.answerCbQuery(`❌ Gagal: ${err.message}`, { show_alert: true });
    }
});

module.exports = { renderMemberPermissionsMenu };