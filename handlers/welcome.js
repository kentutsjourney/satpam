const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { Markup } = require('telegraf');

bot.on('new_chat_members', async (ctx) => {
    try {
        // 1. Langsung hapus notifikasi asli bawaan Telegram agar grup bersih
        try {
            await ctx.deleteMessage(ctx.message.message_id);
        } catch (err) {
            console.error('Gagal hapus notif sistem join (Kurang hak akses hapus pesan):', err.description);
        }

        const newMembers = ctx.message.new_chat_members;

        // Ambil data setting grup dari database
        const { data: settings } = await supabase
            .from('group_settings')
            .select('*')
            .eq('group_id', ctx.chat.id)
            .maybeSingle();

        // Jika data tidak ada atau status welcome dinonaktifkan (OFF), abaikan saja
        if (!settings || !settings.welcome_status) return;

        for (const member of newMembers) {
            // Abaikan jika yang masuk adalah bot itu sendiri
            if (member.is_bot && member.username === ctx.botInfo.username) continue;

            const username = member.username ? `@${member.username}` : member.first_name;
            
            // Proses replace template teks dinamis (Sekarang support {user_id}!)
            let cleanText = settings.welcome_text
                .replace(/{username}/g, username)
                .replace(/{user_id}/g, member.id.toString()) // Ditambahkan pendeteksi ID User
                .replace(/{group_name}/g, ctx.chat.title);

            // 2. Parsing tombol link dari format JSONB database dengan aman
            let keyboardMarkup = null;
            if (settings.welcome_buttons && Array.isArray(settings.welcome_buttons) && settings.welcome_buttons.length > 0) {
                const inlineButtons = settings.welcome_buttons.map(btn => [Markup.button.url(btn.text, btn.url)]);
                keyboardMarkup = Markup.inlineKeyboard(inlineButtons).reply_markup;
            }

            // 3. Mengirim foto sambutan beserta teks dan tombol dinamisnya
            if (settings.welcome_photo) {
                await ctx.replyWithPhoto(settings.welcome_photo, {
                    caption: cleanText,
                    parse_mode: 'Markdown',
                    reply_markup: keyboardMarkup 
                });
            } else {
                // Cadangan jika di database kolom fotonya kosong, bot kirim teks + tombol saja
                await ctx.reply(cleanText, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboardMarkup
                });
            }
        }
    } catch (error) {
        console.error('Error di dinamis welcome handler:', error);
    }
});

// Auto delete pesan keluar (Goodbye Message)
bot.on('left_chat_member', async (ctx) => {
    try {
        await ctx.deleteMessage(ctx.message.message_id);
    } catch (error) {
        console.error('Gagal hapus notif keluar:', error.description);
    }
});