const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase');

const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama Bot
const userState = {}; 

// =========================================================================
// FUNCTION UTAMA UNTUK MERENDER LIST GRUP DI /setting
// =========================================================================
async function renderSettingsMenu(ctx, userId) {
    try {
        let allowedGroups = [];
        const cleanUserId = userId.toString().trim(); 

        if (cleanUserId === OWNER_ID) {
            // DEWA: Ambil SEMUA grup dari tabel group_settings
            const { data, error } = await supabase
                .from('group_settings')
                .select('group_id, group_name');
            
            if (!error && data) allowedGroups = data;
        } else {
            // OWNER LAIN: Cari di group_settings yang kolom group_owner_id-nya COCOK
            const { data, error } = await supabase
                .from('group_settings')
                .select('group_id, group_name')
                .eq('group_owner_id', cleanUserId); // Mencari berdasarkan kolom group_owner_id
                
            if (!error && data) allowedGroups = data;
        }

        let keyboard = [];

        // JIKA OWNER GRUP LAIN BELUM ADA GRUP YANG TERDAFTAR ATAS ID DIA
        if (allowedGroups.length === 0 && cleanUserId !== OWNER_ID) {
            const noGroupText = `WELKAM TO BOT SATPAM KENTUT\nPILIH GC MANA YANG ANDA MAU ATUR\n\n⚠️ Anda belum memiliki grup yang terdaftar di sistem kami.`;
            
            const errorKeyboard = [
                [Markup.button.url('📞 Hubungi Owner Bot', 'https://t.me/arikamukunaon')]
            ];

            if (ctx.callbackQuery) {
                return await ctx.editMessageText(noGroupText, Markup.inlineKeyboard(errorKeyboard));
            } else {
                return await ctx.reply(noGroupText, Markup.inlineKeyboard(errorKeyboard));
            }
        }

        // ISI KEYBOARD JIKA GRUPNYA ADA
        if (cleanUserId === OWNER_ID) {
            // Layar Dewa: Muncul semua grup + tombol hapus
            allowedGroups.forEach(group => {
                keyboard.push([
                    Markup.button.callback(`📁 ${group.group_name || group.group_id}`, `select_group_${group.group_id}`),
                    Markup.button.callback(`❌ Hapus`, `confirm_delete_${group.group_id}`)
                ]);
            });
            // Tombol tambah grup khusus kamu
            keyboard.push([Markup.button.callback('➕ Tambahkan Grup Chat Owner Bot', 'start_whitelist_process')]);
        } else {
            // Layar Owner Lain: Cuma muncul tombol grup miliknya sendiri
            allowedGroups.forEach(group => {
                keyboard.push([
                    Markup.button.callback(`📁 ${group.group_name || group.group_id}`, `select_group_${group.group_id}`)
                ]);
            });
        }

        const welcomeText = `WELKAM TO BOT SATPAM KENTUT\nPILIH GC MANA YANG ANDA MAU ATUR`;
        
        if (ctx.callbackQuery) {
            await ctx.editMessageText(welcomeText, Markup.inlineKeyboard(keyboard));
        } else {
            await ctx.reply(welcomeText, Markup.inlineKeyboard(keyboard));
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
                        group_owner_id: state.targetOwnerId // Di-insert ke kolom group_owner_id kamu
                    }]);
            } else {
                // JIKA SUDAH ADA BARISNYA: Cukup update nama dan group_owner_id-nya
                await supabase
                    .from('group_settings')
                    .update({ 
                        group_name: chatTitle,
                        group_owner_id: state.targetOwnerId // Di-update kolom group_owner_id kamu yang tadinya NULL
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
        // Karena cuma 1 tabel, hapus langsung dari group_settings
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