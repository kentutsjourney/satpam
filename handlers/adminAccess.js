const { Markup } = require('telegraf');
const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { getMainSettingsMenu, getAdminAccessMenu, getWelcomeConfigMenu } = require('../keyboards/menus');

const OWNER_ID = 1382446968; // ID Anda sebagai Owner Utama

// Helper untuk mengambil/membuat data grup di database
async function getOrCreateSettings(chatId, chatTitle) {
    let { data, error } = await supabase
        .from('group_settings')
        .select('*')
        .eq('group_id', chatId)
        .single();

    if (error && error.code === 'PGRST116') {
        const { data: newData, error: insertError } = await supabase
            .from('group_settings')
            .insert([{ group_id: chatId, group_name: chatTitle }])
            .select()
            .single();
        return newData;
    }
    return data;
}

// ==========================================
// 1. [DIHAPUS] COMMAND /setting SUDAH PINDAH KE groupWhitelist.js
// ==========================================

// ==========================================
// 2. ACTION HANDLER: MEMILIH GRUP DARI LIST (DIAMANKAN JALURNYA)
// ==========================================
bot.action(/^select_group_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1]; 
        
        let chatTitle = '';
        try {
            const chatInfo = await ctx.telegram.getChat(groupId);
            chatTitle = chatInfo.title;
        } catch (e) {
            chatTitle = 'Grup Chat';
        }

        const settings = await getOrCreateSettings(groupId, chatTitle);

        await ctx.editMessageText(
            `🛠 **PANGGUNG PENGATURAN PRIVAT**\nGrup: *${chatTitle}*\n\nSilakan ubah konfigurasi di bawah ini:`,
            { parse_mode: 'Markdown', ...getMainSettingsMenu(settings, groupId) }
        );
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// =========================================================================
// 2B. ACTION HANDLER: ENTRANCE TO SUB-MENU SAMBUTAN (WELCOME CONFIG)
// =========================================================================
bot.action(/^menu_welcome_config_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const settings = await getOrCreateSettings(groupId, '');
        
        const currentButtons = settings?.welcome_buttons || [];
        const buttonsCount = Array.isArray(currentButtons) ? currentButtons.length : 0;

        await ctx.editMessageText(
            `⚙️ **KONFIGURASI ANTARMUKA SAMBUTAN**\n\n` +
            `Di sini kamu bisa mengelola aset tampilan penyambutan member baru grup secara mandiri.\n\n` +
            `• **Teks Saat Ini:**\n\`${settings.welcome_text || 'Belum diatur'}\`\n\n` +
            `• **ID Foto / File ID Saat Ini:**\n\`${settings.welcome_photo || 'Belum diatur'}\`\n\n` +
            `• **Jumlah Tombol Tautan:** \`${buttonsCount}/10\` tombol`,
            {
                parse_mode: 'Markdown',
                ...getWelcomeConfigMenu(groupId, buttonsCount)
            }
        );
        await ctx.answerCbQuery();
    } catch (err) {
        console.error('Error open welcome config menu:', err);
    }
});

// =========================================================================
// 2C. ACTION HANDLER: MEMINTA USER INPUT FOTO / TEKS / TOMBOL (Vercel Database Session)
// =========================================================================
bot.action(/^(edit_welcome_photo|edit_welcome_text|add_welcome_btn)_(.+)$/, async (ctx) => {
    try {
        const actionType = ctx.match[1];
        const groupId = ctx.match[2];
        const userId = ctx.from.id;

        // Menyimpan session interaktif langsung ke Supabase (mengganti userSessions)
        await supabase.from('bot_sessions').upsert({
            user_id: userId,
            action: actionType,
            group_id: groupId
        });

        let promptText = '';
        if (actionType === 'edit_welcome_photo') {
            promptText = '📸 **PENGATURAN FOTO SAMBUTAN**\n\nSilakan **kirimkan foto biasa** secara langsung ke obrolan bot ini untuk dijadikan background foto sambutan grup.\n\n_Catatan: Kirim sebagai foto biasa (Compressed), jangan kirim sebagai link teks ataupun File/Dokumen._\n\n_Ketik /cancel untuk membatalkan._';
        } else if (actionType === 'edit_welcome_text') {
            promptText = '📝 **PENGATURAN TEKS SAMBUTAN**\n\nSilakan ketik dan kirimkan format teks sambutan kustom kamu.\n\n*Gunakan pintasan parameter dinamis ini:*\n• `{username}` = Tag nama/username member baru.\n• `{user_id}` = Menampilkan ID Telegram user.\n• `{group_name}` = Nama grup.\n\n_Contoh:_ Selamat datang {username} dengan ID: {user_id} di grup {group_name}!\n\n_Ketik /cancel untuk membatalkan._';
        } else if (actionType === 'add_welcome_btn') {
            promptText = '➕ **TAMBAH TOMBOL LINK EKSTERNAL**\n\nSilakan ketikkan nama tombol beserta link tujuannya dipisahkan tanda koma.\n\n*Format Penulisan:*\n`Nama Tombol , https://linktujuan.com`\n\n_Contoh:_ `🎮 Main Game , https://t.me/kentut_game_bot`';
        }

        await ctx.editMessageText(promptText, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([[Markup.button.callback('⬅️ Batal & Kembali', `menu_welcome_config_${groupId}`)]])
        });
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// =========================================================================
// 2D. ACTION HANDLER: MENU LIST TOMBOL LINK UNTUK DIHAPUS
// =========================================================================
bot.action(/^del_welcome_btn_list_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const settings = await getOrCreateSettings(groupId, '');
        const currentButtons = settings?.welcome_buttons || [];

        if (currentButtons.length === 0) {
            return ctx.answerCbQuery('⚠️ Belum ada tombol link eksternal untuk dihapus.', { show_alert: true });
        }

        const keyboard = currentButtons.map((btn, index) => [
            Markup.button.callback(`🗑️ ${btn.text}`, `execute_del_btn_${groupId}_${index}`)
        ]);
        keyboard.push([Markup.button.callback('⬅️ Kembali', `menu_welcome_config_${groupId}`)]);

        await ctx.editMessageText('🗑️ **HAPUS TOMBOL LINK SAMBUTAN**\n\nKlik pada nama tombol di bawah ini untuk menghapusnya secara permanen dari daftar welcome banner:', {
            reply_markup: { inline_keyboard: keyboard }
        });
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// =========================================================================
// 2E. ACTION HANDLER: EKSEKUSI PENGHAPUSAN TOMBOL LINK
// =========================================================================
bot.action(/^execute_del_btn_(.+)_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const targetIndex = Number(ctx.match[2]);

        const settings = await getOrCreateSettings(groupId, '');
        let currentButtons = settings?.welcome_buttons || [];

        if (currentButtons[targetIndex]) {
            currentButtons.splice(targetIndex, 1);
        }

        const { data } = await supabase
            .from('group_settings')
            .update({ welcome_buttons: currentButtons })
            .eq('group_id', groupId)
            .select()
            .single();

        const buttonsCount = data?.welcome_buttons?.length || 0;
        await ctx.answerCbQuery('Tombol berhasil dihapus permanen! 🔥');

        await ctx.editMessageText(
            `⚙️ **KONFIGURASI ANTARMUKA SAMBUTAN**\n\n` +
            `Tombol berhasil terhapus. Status database saat ini:\n\n` +
            `• **Teks Saat Ini:**\n\`${data.welcome_text || 'Belum diatur'}\`\n\n` +
            `• **URL Foto Saat Ini:**\n\`${data.welcome_photo || 'Belum diatur'}\`\n\n` +
            `• **Jumlah Tombol Tautan:** \`${buttonsCount}/10\` tombol`,
            {
                parse_mode: 'Markdown',
                ...getWelcomeConfigMenu(groupId, buttonsCount)
            }
        );
    } catch (err) {
        console.error(err);
    }
});

// ==========================================
// 3. ACTION HANDLER: MENU MANAGEMENT HAK AKSES ADMIN BIASA
// ==========================================
bot.action(/^manage_admins_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const userId = ctx.from.id;

        const memberInfo = await ctx.telegram.getChatMember(groupId, userId);
        if (memberInfo.status !== 'creator' && userId !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Hanya Owner utama grup yang boleh mengatur hak akses admin!', { show_alert: true });
        }

        const chatAdmins = await ctx.telegram.getChatAdministrators(groupId);
        const filteredAdmins = chatAdmins.filter(admin => !admin.user.is_bot && admin.status !== 'creator');

        const settings = await getOrCreateSettings(groupId, '');
        const allowedAdmins = settings.allowed_admins || [];

        await ctx.editMessageText(
            `👥 **MANAJEMEN HAK AKSES BOT**\n\n` +
            `Klik pada nama admin grup di bawah ini untuk memberikan atau mencabut izin akses perintah \`/setting\` secara privat:\n\n` +
            `• ✅ = Diizinkan mengubah setingan bot\n` +
            `• ❌ = Tidak diizinkan`,
            getAdminAccessMenu(filteredAdmins, allowedAdmins, groupId)
        );
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// ==========================================
// 4. ACTION HANDLER: ON/OFF HAK AKSES PER ADMIN BIASA
// ==========================================
bot.action(/^toggle_admin_(.+)_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const targetAdminId = Number(ctx.match[2]);

        const settings = await getOrCreateSettings(groupId, '');
        let allowedAdmins = settings.allowed_admins || [];

        if (allowedAdmins.includes(targetAdminId)) {
            allowedAdmins = allowedAdmins.filter(id => id !== targetAdminId);
        } else {
            allowedAdmins.push(targetAdminId);
        }

        const { data: updatedData } = await supabase
            .from('group_settings')
            .update({ allowed_admins: allowedAdmins })
            .eq('group_id', groupId)
            .select()
            .single();

        const chatAdmins = await ctx.telegram.getChatAdministrators(groupId);
        const filteredAdmins = chatAdmins.filter(admin => !admin.user.is_bot && admin.status !== 'creator');

        await ctx.editMessageReplyMarkup(getAdminAccessMenu(filteredAdmins, updatedData.allowed_admins, groupId).reply_markup);
        await ctx.answerCbQuery('Status izin admin berhasil diperbarui!');
    } catch (err) {
        console.error(err);
    }
});

// ==========================================
// 5. ACTION HANDLER: KEMBALI KE MENU UTAMA
// ==========================================
bot.action(/^back_to_main_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        let chatTitle = 'Grup Chat';
        try {
            const chatInfo = await ctx.telegram.getChat(groupId);
            chatTitle = chatInfo.title;
        } catch (e) {}

        const settings = await getOrCreateSettings(groupId, chatTitle); 

        await ctx.editMessageText(
            `🛠 **PANGGUNG PENGATURAN PRIVAT**\nGrup: *${chatTitle}*\n\nSilakan ubah konfigurasi di bawah ini:`,
            { parse_mode: 'Markdown', ...getMainSettingsMenu(settings, groupId) }
        );
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// ==========================================
// 6. ACTION HANDLER: TOGGLE WELCOME ON/OFF
// ==========================================
bot.action(/^toggle_welcome_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        let settings = await getOrCreateSettings(groupId, '');
        const newStatus = !settings.welcome_status;

        const { data } = await supabase
            .from('group_settings')
            .update({ welcome_status: newStatus })
            .eq('group_id', groupId)
            .select()
            .single();

        await ctx.editMessageReplyMarkup(getMainSettingsMenu(data, groupId).reply_markup);
        await ctx.answerCbQuery(`Sambutan berhasil di-${newStatus ? 'ON' : 'OFF'}-kan!`);
    } catch (err) {
        console.error(err);
    }
});

// ==========================================
// 7. ACTION HANDLER: TOGGLE ANTI-FLOOD ON/OFF
// ==========================================
bot.action(/^toggle_flood_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        let settings = await getOrCreateSettings(groupId, '');
        const newStatus = !settings.anti_flood_status;

        const { data } = await supabase
            .from('group_settings')
            .update({ anti_flood_status: newStatus })
            .eq('group_id', groupId)
            .select()
            .single();

        await ctx.editMessageReplyMarkup(getMainSettingsMenu(data, groupId).reply_markup);
        await ctx.answerCbQuery(`Anti-Flood berhasil di-${newStatus ? 'ON' : 'OFF'}-kan!`);
    } catch (err) {
        console.error('Error toggle anti flood:', err);
    }
});

// ==========================================
// 8. ACTION: MENAMPILKAN PANDUAN COMMAND ADMIN
// ==========================================
bot.action(/^view_commands_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];

        const textPanduan = 
            `⌨️ **PANDUAN COMMAND MODERASI ADMIN**\n\n` +
            `Balas (REPLY) pesan member biasa di grup menggunakan perintah berikut:\n\n` +
            `• \`.kick\`\n` +
            `👉 Mengeluarkan member dari grup (bisa masuk lagi lewat link).\n\n` +
            `• \`.mute\` / \`.unmute\`\n` +
            `👉 \`.mute\` : Membisukan member selama 24 jam.\n` +
            `👉 \`.unmute\` : Mengembalikan izin berbicara member secara instan.\n\n` +
            `• \`.ban\` / \`.unban\`\n` +
            `👉 \`.ban\` atau \`.block\` : Memblokir member secara permanen.\n` +
            `👉 \`.unban\` : Membuka blokir (bisa dicoba via reply pesan lama atau ketik \`.unban [User ID]\` di grup).\n\n` +
            `⚠️ *Pastikan bot adalah Admin tertinggi di grup.*`;

        await ctx.editMessageText(textPanduan, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('⬅️ Kembali', `back_to_main_${groupId}`)]
            ])
        });
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// Sensor monitoring (Milik Kir - Dipertahankan sepenuhnya)
bot.action(/.+/, async (ctx, next) => {
    const cbData = ctx.callbackQuery.data;
    if (cbData.startsWith('aturowner*')) {
        console.log(`\n=== 🚨 [DETEKSI AWAL] TOMBOL DIKLIK! ===`);
        console.log(`Raw Callback Data: "${cbData}"`);
    }
    return next();
});

// =========================================================================
// 9. ACTION HANDLER: KETIKA OWNER MAU MELIHAT DAFTAR ADMIN (SINKRON BINTANG)
// =========================================================================
bot.action(/^manage_owner_rules_(.+)$/, async (ctx) => {
    try {
        const groupId = ctx.match[1];
        const userId = ctx.from.id;

        if (userId !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Otoritas Ditolak: Menu ini hanya khusus untuk Owner utama bot!', { show_alert: true });
        }

        const chatAdmins = await ctx.telegram.getChatAdministrators(groupId);
        const { data: allowedUsers } = await supabase.from('bot_permissions').select('user_id');
        const allowedIds = allowedUsers ? allowedUsers.map(u => Number(u.user_id)) : [];

        const keyboard = [];

        chatAdmins.forEach(admin => {
            if (admin.user.is_bot || admin.user.id === OWNER_ID) return;

            const isAllowed = allowedIds.includes(Number(admin.user.id));
            const statusEmoji = isAllowed ? '✅' : '❌';
            const name = admin.user.first_name || 'Admin';
            const cleanName = name.replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 10);

            keyboard.push([
                { 
                    text: `${statusEmoji} ${name}`, 
                    callback_data: `aturowner*${groupId}*${admin.user.id}*${cleanName}` 
                }
            ]);
        });

        keyboard.push([{ text: '⬅️ Kembali ke Menu Utama', callback_data: `back_to_main_${groupId}` }]);

        await ctx.editMessageText(
            `🔑 **PANGGUNG OTORITAS OWNER**\n\n` +
            `Silakan pilih Admin grup di bawah ini untuk memberikan hak akses penuh memakai perintah maut (\`.cek\`, \`.admin\`, \`.unadmin\`):\n\n` +
            `• ✅ = Diizinkan bertindak seperti Owner\n` +
            `• ❌ = Tidak diizinkan`,
            { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } }
        );
        await ctx.answerCbQuery();
    } catch (err) {
        console.error(err);
    }
});

// =========================================================================
// 10. ACTION HANDLER: PROSES TOGGLE ON/OFF JIKA NAMA ADMIN DIKLIK (VERSI BINTANG)
// =========================================================================
bot.action(/^aturowner\*(.+)$/, async (ctx) => {
    try {
        const userId = ctx.from.id;
        
        if (userId !== OWNER_ID) {
            return ctx.answerCbQuery('❌ Hanya Owner utama yang boleh mengubah konfigurasi ini!', { show_alert: true });
        }

        const rawData = ctx.match[1];
        const dataParts = rawData.split('*');
        
        const groupId = dataParts[0];
        const targetAdminId = Number(dataParts[1]);
        const targetName = dataParts[2] || 'Admin';

        if (isNaN(targetAdminId)) {
            return ctx.answerCbQuery('⚠️ Gagal membaca komponen ID, silakan buka ulang menu.', { show_alert: true });
        }

        const { data: existing, error: checkError } = await supabase
            .from('bot_permissions')
            .select('id')
            .eq('user_id', targetAdminId)
            .maybeSingle(); 

        if (checkError) {
            return ctx.answerCbQuery('❌ Gagal memeriksa database.', { show_alert: true });
        }

        if (existing) {
            await supabase.from('bot_permissions').delete().eq('user_id', targetAdminId);
            await ctx.answerCbQuery(`Izin akses ${targetName} dicabut! 🎉`);
        } else {
            await supabase.from('bot_permissions').insert({
                user_id: targetAdminId,
                full_name: targetName,
                granted_by: OWNER_ID
            });
            await ctx.answerCbQuery(`Izin sukses diberikan ke ${targetName}! 🚀`);
        }

        const chatAdmins = await ctx.telegram.getChatAdministrators(groupId);
        const { data: allowedUsers } = await supabase.from('bot_permissions').select('user_id');
        const allowedIds = allowedUsers ? allowedUsers.map(u => Number(u.user_id)) : [];

        const keyboard = [];
        chatAdmins.forEach(admin => {
            if (admin.user.is_bot || admin.user.id === OWNER_ID) return;
            
            const isAllowed = allowedIds.includes(Number(admin.user.id));
            const statusEmoji = isAllowed ? '✅' : '❌';
            const cleanName = (admin.user.first_name || 'Admin').replace(/[^a-zA-Z0-9 ]/g, '').substring(0, 10);
            
            keyboard.push([
                { 
                    text: `${statusEmoji} ${admin.user.first_name}`, 
                    callback_data: `aturowner*${groupId}*${admin.user.id}*${cleanName}` 
                }
            ]);
        });
        
        keyboard.push([{ text: '⬅️ Kembali ke Menu Utama', callback_data: `back_to_main_${groupId}` }]);
        await ctx.editMessageReplyMarkup({ inline_keyboard: keyboard });

    } catch (err) {
        console.error('❌ Terjadi Error pada action aturowner:', err);
        await ctx.answerCbQuery('⚠️ Terjadi kesalahan internal pada bot.', { show_alert: true });
    }
});

// =========================================================================
// 11. GLOBAL TEXT & PHOTO LISTENER: VERSI STATELESS (Milik Kir + Proteksi Vercel)
// =========================================================================
bot.on(['message', 'photo'], async (ctx, next) => {
    try {
        if (ctx.chat.type !== 'private') return next();

        const userId = ctx.from.id;

        // Tarik session dinamis langsung dari Supabase
        const { data: dbSession } = await supabase
            .from('bot_sessions')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (!dbSession) return next(); 

        const text = ctx.message.text ? ctx.message.text.trim() : '';

        // Handle pembatalan perintah
        if (text === '/cancel') {
            const groupId = dbSession.group_id; // Mengikuti snake_case dari database public.bot_sessions
            await supabase.from('bot_sessions').delete().eq('user_id', userId); 
            return ctx.reply('✅ Input dibatalkan. Silakan masuk ke konfigurasi sambutan kembali.', 
                Markup.inlineKeyboard([[Markup.button.callback('⚙️ Kembali ke Menu Sambutan', `menu_welcome_config_${groupId}`)]]));
        }

        // Petakan ke variabel lokal yang biasa kamu gunakan (action, groupId)
        const action = dbSession.action;
        const groupId = dbSession.group_id;
        
        const settings = await getOrCreateSettings(groupId, '');

        // ----------------------------------------
        // PROSES UPDATE FOTO WELCOME (SEKARANG BISA FOTO BIASA!)
        // ----------------------------------------
        if (action === 'edit_welcome_photo') {
            let photoId = null;

            if (ctx.message.photo && ctx.message.photo.length > 0) {
                const photoArray = ctx.message.photo;
                photoId = photoArray[photoArray.length - 1].file_id;
            } else {
                return ctx.reply('⚠️ Format salah! Harap langsung kirimkan FOTO BIASA ke obrolan bot ini (bukan berbentuk teks link ataupun dokumen/file).');
            }

            await supabase.from('group_settings').update({ welcome_photo: photoId }).eq('group_id', groupId);
            await supabase.from('bot_sessions').delete().eq('user_id', userId); 

            return ctx.reply('✅ **Foto sambutan berhasil diperbarui menggunakan gambar yang Anda kirim!**', 
                Markup.inlineKeyboard([[Markup.button.callback('⚙️ Kembali ke Menu Sambutan', `menu_welcome_config_${groupId}`)]]));
        }

        // Jika inputan lain, pastikan ada teks yang masuk
        if (!text) return next();

        // ----------------------------------------
        // PROSES UPDATE TEKS SAMBUTAN
        // ----------------------------------------
        if (action === 'edit_welcome_text') {
            await supabase.from('group_settings').update({ welcome_text: text }).eq('group_id', groupId);
            await supabase.from('bot_sessions').delete().eq('user_id', userId);

            return ctx.reply('✅ **Teks sambutan berhasil disimpan ke database!**', 
                Markup.inlineKeyboard([[Markup.button.callback('⚙️ Kembali ke Menu Sambutan', `menu_welcome_config_${groupId}`)]]));
        }

        // ----------------------------------------
        // PROSES TAMBAH TOMBOL LINK EKSTERNAL
        // ----------------------------------------
        if (action === 'add_welcome_btn') {
            const parts = text.split(',');
            if (parts.length < 2) {
                return ctx.reply('❌ Format salah! Tuliskan nama tombol lalu batasi dengan tanda koma sebelum memasukkan link.\n\nContoh: `Google , https://google.com`');
            }

            const btnText = parts[0].trim();
            const btnUrl = parts.slice(1).join(',').trim(); 

            if (!btnUrl.startsWith('http://') && !btnUrl.startsWith('https://')) {
                return ctx.reply('❌ URL Link tujuan tidak valid. Pastikan link diawali dengan http:// atau https://');
            }

            let currentButtons = settings.welcome_buttons || [];
            if (!Array.isArray(currentButtons)) currentButtons = [];

            if (currentButtons.length >= 10) {
                await supabase.from('bot_sessions').delete().eq('user_id', userId);
                return ctx.reply('⚠️ Gagal: Jumlah tautan tombol sudah maksimal (10 tombol). Hapus tombol lama terlebih dahulu.');
            }

            currentButtons.push({ text: btnText, url: btnUrl });

            await supabase.from('group_settings').update({ welcome_buttons: currentButtons }).eq('group_id', groupId);
            await supabase.from('bot_sessions').delete().eq('user_id', userId);

            return ctx.reply(`✅ Tombol \`[${btnText}]\` berhasil ditambahkan!`, 
                Markup.inlineKeyboard([[Markup.button.callback('⚙️ Kembali ke Menu Sambutan', `menu_welcome_config_${groupId}`)]]));
        }

    } catch (err) {
        console.error('Error in session welcome handler:', err);
        ctx.reply('❌ Terjadi kesalahan internal saat memproses input.');
    }
    return next();
});

module.exports = bot;