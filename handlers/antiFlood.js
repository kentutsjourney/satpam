const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { Markup } = require('telegraf');
// Objek lokal di memori untuk mencatat waktu (timestamp) pesan per user per grup
// Struktur: { 'groupId_userId': [timestamp1, timestamp2, ...] }
const messageLog = {};

// Batasan Anti-Flood: Maksimal 10 pesan dalam 3 detik (3000 milidetik)
const FLOOD_LIMIT = 10;
const TIME_WINDOW = 3000; 

bot.on('message', async (ctx, next) => {
    // Abaikan jika pesan bukan di dalam grup/supergrup, atau jika pesan tidak memiliki teks/media standar
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return next();
    if (!ctx.from || ctx.from.is_bot) return next();

    const groupId = ctx.chat.id;
    const userId = ctx.from.id;
    const userKey = `${groupId}_${userId}`;

    try {
        // 1. Ambil status Anti-Flood dari database Supabase
        const { data: settings } = await supabase
            .from('group_settings')
            .select('anti_flood_status')
            .eq('group_id', groupId)
            .single();

        // Jika fitur Anti-Flood OFF atau data grup tidak ada, abaikan dan lanjut ke handler lain
        if (!settings || !settings.anti_flood_status) return next();

        // 2. Validasi: Kecualikan Admin dan Owner dari aturan Anti-Flood
        const memberInfo = await ctx.getChatMember(userId);
        if (memberInfo.status === 'administrator' || memberInfo.status === 'creator') {
            return next();
        }

        // 3. Logika Pencatatan Waktu Pesan
        const now = Date.now();
        if (!messageLog[userKey]) {
            messageLog[userKey] = [];
        }

        // Masukkan timestamp pesan saat ini ke array tracker
        messageLog[userKey].push(now);

        // Bersihkan timestamp yang sudah lebih lama dari jendela waktu (3 detik)
        messageLog[userKey] = messageLog[userKey].filter(timestamp => now - timestamp < TIME_WINDOW);

        // 4. Eksekusi Hukuman jika Melebihi Batas
        if (messageLog[userKey].length > FLOOD_LIMIT) {
            // Hapus pesan pemicu terakhir yang membuat flood
            try { await ctx.deleteMessage(); } catch (e) {}

            // Hitung waktu selesai Mute (24 jam dari sekarang)
            // Waktu dalam format UNIX timestamp (detik)
            const untilDate = Math.floor(now / 1000) + (24 * 60 * 60);

            // Eksekusi Mute via Telegram API (Mencabut semua izin kirim pesan)
            await ctx.telegram.restrictChatMember(groupId, userId, {
                permissions: {
                    can_send_messages: false,
                    can_send_media_messages: false,
                    can_send_polls: false,
                    can_send_other_messages: false,
                    can_add_web_page_previews: false
                },
                until_date: untilDate
            });

            // Kirim peringatan ke grup
         // Ambil informasi username dan nama
           // Ambil informasi username dan nama
            const username = ctx.from.username ? `@${ctx.from.username}` : 'Tidak ada';
            const fullName = `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim();

            // Kirim peringatan ke grup dengan Tombol Inline "Bunyikan User"
            const alertMsg = await ctx.reply(
                `🚨 **DETEKSI FLOOD/SPAM!**\n\n` +
                `👤 **Nama:** ${fullName}\n` +
                `🏷 **Username:** ${username}\n` +
                `🆔 **User ID:** \`${userId}\`\n\n` +
                `⚠️ **Pelanggaran:** Mengirim lebih dari ${FLOOD_LIMIT} pesan dalam 3 detik.\n` +
                `🔨 **Hukuman:** **Muted (Bisu) selama 24 Jam**.`,
                {
                    parse_mode: 'Markdown',
                    ...Markup.inlineKeyboard([
                        [Markup.button.callback('🔊 Bunyikan User (Unmute)', `unmute_user_${userId}`)]
                    ])
                }
            );
            // Bersihkan log memori user tersebut agar tidak memicu loop hukuman berturut-turut
            delete messageLog[userKey];
            return;
        }

    } catch (err) {
        console.error('Error pada Anti-Flood Handler:', err.description || err);
    }

    // Lanjutkan ke handler berikutnya (misalnya pengecekan kata kotor atau anti-link)
    return next();
});


// ==========================================
// ACTION HANDLER: UNMUTE USER DARI NOTIFIKASI FLOOD
// ==========================================
bot.action(/^unmute_user_(.+)$/, async (ctx) => {
    try {
        const targetUserId = Number(ctx.match[1]);
        const clickerId = ctx.from.id;
        const groupId = ctx.chat.id;

        // 1. Validasi: Cek apakah yang klik tombol adalah Admin atau Owner grup
        const clickerInfo = await ctx.getChatMember(clickerId);
        if (clickerInfo.status !== 'administrator' && clickerInfo.status !== 'creator') {
            return ctx.answerCbQuery('❌ Hanya Admin atau Owner grup yang bisa menggunakan tombol ini!', { show_alert: true });
        }

        // 2. Eksekusi Unmute: Kembalikan semua izin kirim pesan menjadi TRUE
        await ctx.telegram.restrictChatMember(groupId, targetUserId, {
            permissions: {
                can_send_messages: true,
                can_send_media_messages: true,
                can_send_polls: true,
                can_send_other_messages: true,
                can_add_web_page_previews: true
            }
        });

        // 3. Ambil info user yang di-unmute untuk pesan konfirmasi
        const targetInfo = await ctx.telegram.getChatMember(groupId, targetUserId);
        const targetName = targetInfo.user.first_name;

        // 4. Ubah teks pesan notifikasi banjir tadi agar tombolnya hilang dan menandakan sudah di-unmute
        await ctx.editMessageText(
            `${ctx.callbackQuery.message.text}\n\n` +
            `✅ **Di-unmute oleh:** ${ctx.from.first_name}\n` +
            `🔊 Berhasil dibunyikan kembali, silakan mengobrol dengan tertib!`,
            { parse_mode: 'Markdown' } // Tanpa menyertakan inline keyboard lagi agar tombolnya hilang
        );

        await ctx.answerCbQuery(`${targetName} berhasil dibunyikan kembali!`);

    } catch (err) {
        console.error('Error saat eksekusi unmute tombol:', err.description || err);
        await ctx.answerCbQuery('Gagal meng-unmute user. Pastikan bot masih menjadi admin.');
    }
});