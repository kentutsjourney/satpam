const bot = require('../config/bot');
const supabase = require('../config/supabase');

// ID Anda sebagai Owner utama bot
const OWNER_ID = 1382446968; 

// Helper untuk cek apakah user punya izin khusus Owner/Admin Whitelist
async function hasAccess(ctx, userId) {
    if (userId === OWNER_ID) return true;

    try {
        const groupId = ctx.chat.id;

        // Cek status jabatan user langsung di Telegram secara real-time
        const chatMember = await ctx.getChatMember(userId);
        const isTelegramAdmin = ['creator', 'administrator'].includes(chatMember.status);

        if (isTelegramAdmin) {
            // Cek di bot_permissions (Otoritas Owner)
            const { data: permData } = await supabase
                .from('bot_permissions')
                .select('user_id')
                .eq('user_id', Number(userId))
                .maybeSingle();
            
            if (permData) return true;

            // Cek di allowed_admins group_settings (Admin Biasa)
            const { data: groupData } = await supabase
                .from('group_settings')
                .select('allowed_admins')
                .eq('group_id', Number(groupId))
                .maybeSingle();

            if (groupData?.allowed_admins?.includes(userId)) return true;
        }
    } catch (e) {
        console.error('Error saat validasi hak akses admin:', e);
    }

    return false;
}

// ==================================================
// 1. HANDLER UNTUK MEMBUAT COMMAND (.setcmd)
// ==================================================
bot.hears(/^\.setcmd(\s+|$)/, async (ctx) => {
    try {
        if (ctx.chat.type === 'private') return;

        const groupId = ctx.chat.id;
        const userId = ctx.from.id;

        const authorized = await hasAccess(ctx, userId);
        if (!authorized) {
            const replyMsg = await ctx.reply('❌ Anda tidak memiliki izin untuk membuat custom command di grup ini.');
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 3000); // Hapus pesan perintah
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000); // Hapus balasan bot
            return;
        }

        const rawText = ctx.message.text.substring(7).trim(); 
        if (!rawText) {
            const replyMsg = await ctx.reply('💡 **Format Salah!**\nCara pakai:\n`.setcmd [kata_kunci] [isi balasan bot]`');
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 5000);
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000);
            return;
        }

        const firstSpaceIndex = rawText.indexOf(' ');
        if (firstSpaceIndex === -1) {
            const replyMsg = await ctx.reply('❌ Gagal: Mohon masukkan isi teks balasan setelah kata kunci pemicu.');
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 5000);
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000);
            return;
        }

        const trigger = rawText.substring(0, firstSpaceIndex).trim().toLowerCase();
        const response = rawText.substring(firstSpaceIndex).trim();

        const bannedTriggers = ['.kick', '.mute', '.unmute', '.ban', '.block', '.unban', '.admin', '.unadmin', '.cek', '.setcmd', '.delcmd', '.listcmd', '.hapuskabeh', '/setting'];
        if (bannedTriggers.includes(trigger)) {
            const replyMsg = await ctx.reply(`❌ Kata kunci \`${trigger}\` dilarang karena merupakan perintah inti bot.`);
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 5000);
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000);
            return;
        }

        const { data: existing } = await supabase
            .from('group_commands')
            .select('id')
            .eq('group_id', groupId)
            .eq('command_trigger', trigger)
            .maybeSingle();

        if (existing) {
            await supabase
                .from('group_commands')
                .update({ response_text: response, created_by: userId })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('group_commands')
                .insert([{ group_id: groupId, command_trigger: trigger, response_text: response, created_by: userId }]);
        }

        await ctx.reply(`✅ **Berhasil disimpan!**\nSekarang jika ada yang mengetik \`${trigger}\`, bot akan otomatis merespons.`);
        
        // Hapus pesan perintah milik admin otomatis
        try { await ctx.deleteMessage(); } catch (e) {}

    } catch (err) {
        console.error('Error setcmd:', err);
    }
});

// ==================================================
// 2. HANDLER UNTUK MENGHAPUS COMMAND (.delcmd)
// ==================================================
bot.hears(/^\.delcmd(\s+|$)/, async (ctx) => {
    try {
        if (ctx.chat.type === 'private') return;

        const groupId = ctx.chat.id;
        const userId = ctx.from.id;

        const authorized = await hasAccess(ctx, userId);
        if (!authorized) {
            try { await ctx.deleteMessage(); } catch (e) {}
            return;
        }

        const trigger = ctx.message.text.substring(8).trim().toLowerCase(); 
        if (!trigger) {
            const replyMsg = await ctx.reply('💡 Cara pakai: `.delcmd [kata_kunci]`');
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 5000);
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000);
            return;
        }

        const { data } = await supabase
            .from('group_commands')
            .delete()
            .eq('group_id', groupId)
            .eq('command_trigger', trigger)
            .select();

        if (data && data.length > 0) {
            await ctx.reply(`🗑️ Kata kunci \`${trigger}\` berhasil dihapus dari database grup ini.`);
        } else {
            await ctx.reply(`⚠️ Kata kunci \`${trigger}\` tidak ditemukan di grup ini.`);
        }

        // Hapus pesan perintah milik admin otomatis
        try { await ctx.deleteMessage(); } catch (e) {}

    } catch (err) {
        console.error('Error delcmd:', err);
    }
});

// ==================================================
// 3. HANDLER UNTUK MELIHAT DAFTAR COMMAND (.listcmd)
// ==================================================
bot.hears('.listcmd', async (ctx) => {
    try {
        if (ctx.chat.type === 'private') return;

        const groupId = ctx.chat.id;
        const userId = ctx.from.id;

        const authorized = await hasAccess(ctx, userId);
        if (!authorized) {
            try { await ctx.deleteMessage(); } catch (e) {}
            return;
        }

        const { data: commands } = await supabase
            .from('group_commands')
            .select('command_trigger')
            .eq('group_id', groupId);

        if (!commands || commands.length === 0) {
            await ctx.reply('📜 Belum ada custom command yang didaftarkan di grup ini.');
        } else {
            let teksList = `📜 **DAFTAR CUSTOM COMMAND GRUP**\n\n`;
            commands.forEach((c, idx) => {
                teksList += `${idx + 1}. \`${c.command_trigger}\`\n`;
            });
            await ctx.reply(teksList, { parse_mode: 'Markdown' });
        }

        // Hapus pesan perintah milik admin otomatis
        try { await ctx.deleteMessage(); } catch (e) {}

    } catch (err) {
        console.error('Error listcmd:', err);
    }
});

// ==================================================
// 5. HANDLER UNTUK HAPUS SEMUA LIST (.hapuskabeh) -> KHUSUS OWNER
// ==================================================
bot.hears('.hapuskabeh', async (ctx) => {
    try {
        if (ctx.chat.type === 'private') return;

        const groupId = ctx.chat.id;
        const userId = ctx.from.id;

        // Validasi Keras: Hanya ID Anda (Owner utama) yang bisa mengeksekusi
        if (userId !== OWNER_ID) {
            const replyMsg = await ctx.reply('❌ Perintah ditolak! Hanya Owner utama bot yang dapat menghapus seluruh isi database grup.');
            setTimeout(() => ctx.deleteMessage().catch(() => {}), 5000);
            setTimeout(() => ctx.telegram.deleteMessage(groupId, replyMsg.message_id).catch(() => {}), 5000);
            return;
        }

        // Jalankan query delete massal berdasarkan group_id
        const { data, error } = await supabase
            .from('group_commands')
            .delete()
            .eq('group_id', groupId)
            .select();

        if (error) {
            await ctx.reply('❌ Terjadi kesalahan sistem saat mencoba mengosongkan database.');
        } else if (data && data.length > 0) {
            await ctx.reply(`🔥 **DATABASE DIBERSIHKAN!**\nSebanyak **${data.length} custom command** di grup ini berhasil dihapus permanen oleh Owner.`);
        } else {
            await ctx.reply('⚠️ Tidak ada custom command yang tercatat di grup ini untuk dihapus.');
        }

        // Hapus pesan perintah milik owner otomatis
        try { await ctx.deleteMessage(); } catch (e) {}

    } catch (err) {
        console.error('Error hapuskabeh:', err);
    }
});

// ==================================================
// 4. LISTENER GLOBAL -> UNTUK MERESPONS KATA KUNCI MEMBER
// ==================================================
bot.on('message', async (ctx, next) => {
    try {
        if (ctx.chat.type === 'private') return next();
        if (!ctx.message || !ctx.message.text) return next();

        const text = ctx.message.text.trim();
        const words = text.split(/\s+/);
        const firstWord = words[0].toLowerCase(); 

        const { data: cmd } = await supabase
            .from('group_commands')
            .select('response_text')
            .eq('group_id', ctx.chat.id)
            .eq('command_trigger', firstWord)
            .maybeSingle();

        if (cmd) {
            return await ctx.reply(cmd.response_text, { reply_to_message_id: ctx.message.message_id });
        }

    } catch (err) {
        console.error('Error global custom command:', err);
    }
    return next();
});