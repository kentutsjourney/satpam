const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { getGroupSelectionMenu } = require('../keyboards/menus'); // Panggil menu terpusat kita

const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama Bot
const userState = {}; 

// =========================================================================
// FUNCTION UTAMA UNTUK MERENDER LIST GRUP DI /setting
// =========================================================================
// Tambahkan parameter forcedStatus = null di paling atas
async function renderSettingsMenu(ctx, userId, forcedStatus = null) {
    try {
        let allowedGroups = [];
        const cleanUserId = userId.toString().trim(); 

       
        let isMaintenance = false;

        // JIKA FORCEDSTATUS DIISI, LANGSUNG PAKAI. JIKA TIDAK, BARU AMBIL DARI DB
        if (forcedStatus !== null) {
            isMaintenance = forcedStatus;
        } else {
            try {
                const { data: statusData } = await supabase.from('bot_status').select('maintenance_status').eq('id', 1).maybeSingle();
                if (statusData) isMaintenance = statusData.maintenance_status;
            } catch (e) {
                console.error('Gagal mengambil status maintenance:', e);
            }
        }

        if (cleanUserId === OWNER_ID) {
            const { data, error } = await supabase.from('group_settings').select('group_id, group_name');
            if (!error && data) allowedGroups = data;
        } else {
            const { data, error } = await supabase.from('group_settings').select('group_id, group_name').eq('group_owner_id', cleanUserId);
            if (!error && data) allowedGroups = data;
        }

       
        if (allowedGroups.length === 0 && cleanUserId !== OWNER_ID) {
            const noGroupText = `WELKAM TO BOT SATPAM KENTUT\nPILIH GC MANA YANG ANDA MAU ATUR\n\n⚠️ Anda belum memiliki grup yang terdaftar di sistem kami.`;
            const errorKeyboard = [[Markup.button.url('📞 Hubungi Owner Bot', 'https://t.me/arikamukunaon')]];
            if (ctx.callbackQuery) {
                return await ctx.editMessageText(noGroupText, Markup.inlineKeyboard(errorKeyboard));
            } else {
                return await ctx.reply(noGroupText, Markup.inlineKeyboard(errorKeyboard));
            }
        }

      const welcomeText = `WELKAM TO BOT SATPAM KENTUT\nPILIH GC MANA YANG ANDA MAU ATUR`;
        const finalKeyboard = getGroupSelectionMenu(allowedGroups, cleanUserId, isMaintenance);

        if (ctx.callbackQuery) {
            await ctx.editMessageText(welcomeText, finalKeyboard);
        } else {
            await ctx.reply(welcomeText, finalKeyboard);
        }
    } catch (err) {
        console.error('Error rendering main menu:', err);
    }
}

// Handler Command /setting
bot.command('setting', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await renderSettingsMenu(ctx, ctx.from.id);
});

// Command /start untuk mengarahkan ke /setting
bot.command('start', async (ctx) => {
    if (ctx.chat.type !== 'private') return;
    await ctx.reply('Selamat datang di Bot Satpam Kentut!\n\nSilakan ketik /setting untuk melihat dan mengonfigurasi grup chat Anda.');
});

// =========================================================================
// ACTION SAKLAR DEWA: TOGGLE ON/OFF BOT GLOBAL (MAINTENANCE)
// =========================================================================
// =========================================================================
// ACTION SAKLAR DEWA: TOGGLE ON/OFF BOT GLOBAL (MAINTENANCE) - VERSI FIXED
// =========================================================================
// =========================================================================
// ACTION SAKLAR DEWA: TOGGLE ON/OFF BOT GLOBAL (MAINTENANCE) - FIXED RE-ON
// =========================================================================
bot.action('toggle_global_maintenance', async (ctx) => {
    try {
        const userId = ctx.from.id.toString();
        if (userId !== OWNER_ID) return ctx.answerCbQuery('❌ Akses Khusus Owner Utama!', { show_alert: true });

        // 1. Dapatkan status saat ini di DB
        const { data: currentData, error: fetchError } = await supabase
            .from('bot_status')
            .select('maintenance_status')
            .eq('id', 1)
            .maybeSingle();

        if (fetchError) {
            console.error('Error fetch status:', fetchError);
            return ctx.answerCbQuery('❌ Gagal membaca status database.', { show_alert: true });
        }

        // Tentukan status berikutnya secara presisi
        const nextStatus = currentData ? !currentData.maintenance_status : true;

        // 2. Update status baru ke DB sebelum kirim siaran
        const { error: updateError } = await supabase
            .from('bot_status')
            .update({ maintenance_status: nextStatus })
            .eq('id', 1);

        if (updateError) {
            console.error('Error update status:', updateError);
            return ctx.answerCbQuery('❌ Gagal memperbarui status database.', { show_alert: true });
        }

        await ctx.answerCbQuery('Memproses perubahan status & siaran grup... ⏳');

        // 3. Ambil seluruh grup aktif
        const { data: allGroups } = await supabase.from('group_settings').select('group_id');

        const messageBroadcast = nextStatus 
            ? '⚠️ **hampura** ⚠️\n\nBot Kentut lagi anuin anunya di iniin off in dulu yak!!'
            : '✅ **BOT dah siap** ✅\n\ndah nyala kembali normal silakan pakai!';

        if (allGroups && allGroups.length > 0) {
            for (const group of allGroups) {
              
                try {
                   
                    const targetChatId = group.group_id.toString().trim();
                 
                    
                    // Kirim siaran teks terlebih dahulu
                    const sentMsg = await ctx.telegram.sendMessage(targetChatId, messageBroadcast, { parse_mode: 'Markdown' });
                    
                    if (nextStatus) {
                        // Jika diubah ke OFF -> Pin pesan barusan
                        await ctx.telegram.pinChatMessage(targetChatId, sentMsg.message_id).catch((e) => {
                            console.log(`Gagal pin di grup ${targetChatId}:`, e.message);
                        });
                    } else {
                        // Jika diubah ke ON -> Unpin pesan pin teratas di grup tersebut secara universal (Aman & Anti-Crash!)
                        await ctx.telegram.unpinChatMessage(targetChatId).catch((e) => {
                            console.log(`Gagal unpin di grup ${targetChatId}:`, e.message);
                        });
                    }
                } catch (errSend) {
                    console.log(`Gagal siaran ke grup ${group.group_id}:`, errSend.message);
                }
            }
        }

        // 4. Render ulang menu dengan forcedStatus yang presisi agar warna tombol sinkron instan
        return renderSettingsMenu(ctx, ctx.from.id, nextStatus);

    } catch (err) {
        console.error('Error total di handler maintenance:', err);
        await ctx.answerCbQuery('❌ Terjadi kesalahan fatal pada sistem.', { show_alert: true });
    }
});

// =========================================================================
// PROSES PENDAFTARAN GRUP WHITELIST KE TABEL GROUP_SETTINGS
// =========================================================================
bot.action('start_whitelist_process', async (ctx) => {
    if (ctx.from.id.toString() !== OWNER_ID) return ctx.answerCbQuery('❌ Akses Khusus Owner Utama!', { show_alert: true });
    
    userState[ctx.from.id] = { step: 'WAITING_OWNER_ID' };
    await ctx.editMessageText('🕵️‍♂️ **Pendaftaran Whitelist - Tahap 1**\n\nSilakan masukkan **ID Telegram Owner/Pembuat Grup** yang ingin diberikan izin memakai bot.', { parse_mode: 'Markdown' });
    await ctx.answerCbQuery();
});

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();
    
    const userId = ctx.from.id;
    const state = userState[userId];
    if (!state) return next();

    const text = ctx.message.text.trim();

    if (text === '/cancel') {
        delete userState[userId];
        await ctx.reply('❌ Pendaftaran dibatalkan.');
        return renderSettingsMenu(ctx, userId);
    }

    // TAHAP 1: Ambil ID Owner
    if (state.step === 'WAITING_OWNER_ID') {
        if (isNaN(Number(text))) {
            return ctx.reply('⚠️ ID harus berupa angka! Silakan masukkan kembali atau ketik /cancel.');
        }
        userState[userId] = { step: 'WAITING_GROUP_ID', targetOwnerId: text };
        return ctx.reply('👍 ID Owner Grup berhasil dicatat.\n\n**Tahap 2:** Sekarang silakan masukkan **ID Grup Telegram** miliknya (Contoh: `-100xxxxxxxxxx`):', { parse_mode: 'Markdown' });
    }

    // TAHAP 2: Ambil ID Grup & Eksekusi Simpan/Update ke group_settings
    if (state.step === 'WAITING_GROUP_ID') {
        const targetGroupId = text;

        if (!targetGroupId.startsWith('-100')) {
            return ctx.reply('⚠️ ID Grup Supergroup Telegram harus diawali dengan **-100**\n\nContoh: `-1003712690075`. Silakan ketik ulang:');
        }

        try {
            let chatTitle = 'Grup Chat';
            try {
                const chatInfo = await ctx.telegram.getChat(targetGroupId);
                chatTitle = chatInfo.title;
            } catch (e) {
                return ctx.reply('❌ Bot gagal mendeteksi grup tersebut. Pastikan bot sudah dimasukkan ke dalam grup tersebut sebagai admin, baru daftarkan di sini.');
            }

            // Cek apakah grup sudah ada di tabel group_settings
            const { data: existingSettings } = await supabase
                .from('group_settings')
                .select('*')
                .eq('group_id', targetGroupId)
                .maybeSingle();

            if (!existingSettings) {
                // JIKA BELUM ADA: Langsung insert data baru beserta group_owner_id-nya
                await supabase
                    .from('group_settings')
                    .insert([{ 
                        group_id: targetGroupId, 
                        group_name: chatTitle,
                        group_owner_id: state.targetOwnerId
                    }]);
            } else {
                // JIKA SUDAH ADA BARISNYA: Cukup update nama dan group_owner_id-nya
                await supabase
                    .from('group_settings')
                    .update({ 
                        group_name: chatTitle,
                        group_owner_id: state.targetOwnerId
                    })
                    .eq('group_id', targetGroupId);
            }

            delete userState[userId];
            await ctx.reply(`🎉 **Berhasil!** Grup *${chatTitle}* (${targetGroupId}) resmi dikaitkan ke Owner ID \`${state.targetOwnerId}\`.`, { parse_mode: 'Markdown' });
            
            return renderSettingsMenu(ctx, userId);

        } catch (err) {
            console.error(err);
            return ctx.reply('❌ Terjadi kesalahan internal pada Supabase database.');
        }
    }
});

// =========================================================================
// HANDLER PROSES HAPUS GRUP
// =========================================================================
bot.action(/^confirm_delete_(.+)$/, async (ctx) => {
    const groupId = ctx.match[1];
    if (ctx.from.id.toString() !== OWNER_ID) return ctx.answerCbQuery('❌ Akses Ditolak!');

    const keyboard = [
        [
            Markup.button.callback('✅ Ya, Hapus Dari DB', `execute_delete_${groupId}`),
            Markup.button.callback('⬅️ Gak Jadi', 'back_to_main_menu')
        ]
    ];

    await ctx.editMessageText(`⚠️ **PERINGATAN!**\n\nApakah kamu yakin ingin menghapus grup dengan ID \`${groupId}\` dari database?`, { 
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard(keyboard)
    });
    await ctx.answerCbQuery();
});

bot.action(/^execute_delete_(.+)$/, async (ctx) => {
    const groupId = ctx.match[1];
    if (ctx.from.id.toString() !== OWNER_ID) return ctx.answerCbQuery('❌ Akses Ditolak!');

    try {
        await supabase.from('group_settings').delete().eq('group_id', groupId);

        await ctx.answerCbQuery('🔥 Grup berhasil dihapus dari database!', { show_alert: true });
        return renderSettingsMenu(ctx, ctx.from.id);
    } catch (err) {
        console.error(err);
        await ctx.answerCbQuery('❌ Gagal menghapus data.');
    }
});

bot.action('back_to_main_menu', async (ctx) => {
    await renderSettingsMenu(ctx, ctx.from.id);
    await ctx.answerCbQuery();
});

module.exports = { renderSettingsMenu };