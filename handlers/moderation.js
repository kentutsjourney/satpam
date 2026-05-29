const bot = require('../config/bot');
const supabase = require('../config/supabase');

// ID Anda sebagai Owner utama bot
const OWNER_ID = 1382446968; 

// Fungsi pembantu untuk cek izin di tabel bot_permissions secara aman
async function hasAccess(userId) {
    if (userId === OWNER_ID) return true;

    try {
        const { data, error } = await supabase
            .from('bot_permissions')
            .select('user_id')
            .eq('user_id', Number(userId))
            .maybeSingle(); // Menggunakan maybeSingle agar tidak melempar error crash jika data kosong

        if (data && !error) return true;
    } catch (e) {
        console.error('Error saat cek akses database:', e);
    }
    return false;
}

bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'group' && ctx.chat.type !== 'supergroup') return next();
    if (!ctx.message) return next();

    const groupId = ctx.chat.id;
    const adminId = ctx.from.id;

    // ==================================================
    // AUTO-TRACKING USERNAME / NAMA (Tetap Aktif)
    // ==================================================
    if (ctx.message.from && !ctx.message.from.is_bot) {
        const user = ctx.message.from;
        let { data: lastRecord } = await supabase
            .from('user_history')
            .select('*')
            .eq('user_id', user.id)
            .order('changed_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        const currentUsername = user.username || null;
        const currentName = `${user.first_name} ${user.last_name || ''}`.trim();

        if (!lastRecord || lastRecord.new_username !== currentUsername || lastRecord.new_name !== currentName) {
            await supabase.from('user_history').insert([{
                user_id: user.id,
                old_username: lastRecord ? lastRecord.new_username : null,
                new_username: currentUsername,
                old_name: lastRecord ? lastRecord.new_name : null,
                new_name: currentName
            }]);
        }
    }

    if (!ctx.message.text) return next();

    const rawText = ctx.message.text.trim().split(/\s+/);
    const command = rawText[0].toLowerCase();
    const allowedCommands = ['.kick', '.mute', '.unmute', '.ban', '.block', '.unban', '.admin', '.unadmin', '.cek'];

    if (!allowedCommands.includes(command)) return next();

    console.log(`\n=== [DEBUG MODERASI & AKSES] ===`);
    console.log(`Perintah masuk: ${command} dari ID: ${adminId}`);

    let targetUserId = null;
    let targetMention = 'User';

    if (ctx.message.reply_to_message) {
        const targetUser = ctx.message.reply_to_message.from;
        if (targetUser) {
            targetUserId = targetUser.id;
            const username = targetUser.username ? ` (@${targetUser.username})` : '';
            targetMention = `*${targetUser.first_name}*${username}`;
        }
    } else if (rawText[1]) {
        const arg = rawText[1];
        if (!isNaN(arg)) {
            targetUserId = Number(arg);
            targetMention = `User ID: \`${targetUserId}\``;
        } else if (arg.startsWith('@') && ctx.message.entities) {
            const mentionEntity = ctx.message.entities.find(e => e.type === 'mention');
            if (mentionEntity) {
                const usernameInput = ctx.message.text.substring(mentionEntity.offset, mentionEntity.offset + mentionEntity.length);
                try {
                    const cleanUsername = usernameInput.replace('@', '').toLowerCase();
                    const administrators = await ctx.telegram.getChatAdministrators(groupId);
                    const foundAdmin = administrators.find(admin => admin.user.username && admin.user.username.toLowerCase() === cleanUsername);
                    if (foundAdmin) {
                        targetUserId = foundAdmin.user.id;
                        targetMention = `*${foundAdmin.user.first_name}* (${usernameInput})`;
                    } else {
                        targetMention = `User *${usernameInput}*`;
                    }
                } catch (e) {
                    console.error(e);
                }
            }
        }
    }

    if (!targetUserId && !ctx.message.text.includes('@')) {
        return ctx.reply('❌ Gagal: Silakan gunakan perintah ini dengan cara membalas (reply) chat target atau mention username (@username).');
    }

    try {
        const clickerInfo = await ctx.getChatMember(adminId);
        const isOwner = (clickerInfo.status === 'creator');

        let { data: settings } = await supabase
            .from('group_settings')
            .select('allowed_admins')
            .eq('group_id', groupId)
            .maybeSingle();

        const isAllowedAdmin = settings?.allowed_admins?.includes(adminId);

        // ==================================================
        // PENGECEKAN IZIN KHUSUS UNTUK .ADMIN, .UNADMIN, .CEK
        // ==================================================
        if (['.admin', '.unadmin', '.cek'].includes(command)) {
            const authorized = await hasAccess(adminId);
            if (!authorized) {
                return ctx.reply('❌ Perintah ditolak! Anda tidak memiliki otoritas khusus dari Owner untuk menggunakan command ini.');
            }
        } else {
            // Validasi admin grup biasa untuk .mute, .kick, .ban dkk
            if (!isOwner && !isAllowedAdmin) {
                return ctx.reply('❌ Anda tidak memiliki hak akses perintah moderasi untuk bot ini.');
            }
        }

        // Jalankan perintah eksekusi
        switch (command) {
            case '.admin':
                const checkTargetAdmin = await ctx.getChatMember(targetUserId);
                if (checkTargetAdmin.status === 'administrator' || checkTargetAdmin.status === 'creator') {
                    return ctx.reply('⚠️ Target sudah menjadi Admin atau Owner grup!');
                }

                try {
                    await ctx.telegram.promoteChatMember(groupId, targetUserId, {
                        can_manage_chat: true,
                        can_delete_messages: true,
                        can_restrict_members: true,
                        can_invite_users: true,
                        can_manage_video_chats: true,
                        can_change_info: false,
                        can_pin_messages: false,
                        can_promote_members: false
                    });
                    await ctx.reply(`👑 Jabatannya Naik! ${targetMention} \`[${targetUserId}]\` **berhasil dijadikan Admin grup** oleh penguasa.`, { parse_mode: 'Markdown' });
                } catch (errPromote) {
                    console.error('Gagal promote member:', errPromote);
                    return ctx.reply(`❌ **Gagal mengeksekusi:** Pastikan bot diposisikan di urutan paling ATAS pada daftar Admin grup Anda dengan hak akses 'Add New Admins' yang aktif.`);
                }
                break;

            case '.unadmin':
                const checkTargetDemote = await ctx.getChatMember(targetUserId);
                if (checkTargetDemote.status === 'creator') {
                    return ctx.reply('❌ Gagal: Anda tidak bisa menurunkan jabatan Owner utama grup!');
                }
                if (checkTargetDemote.status !== 'administrator') {
                    return ctx.reply('⚠️ Target bukan seorang Admin grup, tidak perlu diturunkan.');
                }

                try {
                    await ctx.telegram.promoteChatMember(groupId, targetUserId, {
                        can_change_info: false,
                        can_post_messages: false,
                        can_edit_messages: false,
                        can_delete_messages: false,
                        can_invite_users: false,
                        can_restrict_members: false,
                        can_pin_messages: false,
                        can_promote_members: false,
                        can_manage_chat: false,
                        can_manage_video_chats: false,
                        can_manage_topics: false
                    });
                    await ctx.reply(`🏃‍♂️ Jabatannya Turun! ${targetMention} **berhasil diturunkan menjadi Member biasa**.`, { parse_mode: 'Markdown' });
                } catch (errDemote) {
                    console.error('Gagal demote member:', errDemote);
                    return ctx.reply(`❌ **Gagal menurunkan jabatan:** Bot tidak bisa mengatur admin yang posisinya berada di atas posisi bot saat ini.`);
                }
                break;

            case '.cek':
                if (!targetUserId) {
                    return ctx.reply(`❌ ID akun tidak terbaca secara instan. Mohon gunakan metode **REPLY** pesan untuk perintah .cek ini.`);
                }

                let { data: histories } = await supabase
                    .from('user_history')
                    .select('*')
                    .eq('user_id', targetUserId)
                    .order('changed_at', { ascending: true });

                let teksCek = `🔍 **LAPORAN DATA INTEL TELEGRAM**\n\n`;
                teksCek += `• **User ID:** \`${targetUserId}\`\n\n`;
                teksCek += `📜 **Riwayat Perubahan Data (Sejak Bot Masuk):**\n`;

                if (!histories || histories.length === 0) {
                    teksCek += `_Belum ada riwayat perubahan nama/username yang tercatat._\n`;
                } else {
                    histories.forEach((h, index) => {
                        const tgl = new Date(h.changed_at).toLocaleDateString('id-ID');
                        const namaUser = h.new_name ? h.new_name : 'Tanpa Nama';
                        const userUser = h.new_username ? `@${h.new_username}` : '_tidak pasang username_';
                        teksCek += `${index + 1}. [${tgl}] Nama: *${namaUser}* | Username: ${userUser}\n`;
                    });
                }

                await ctx.reply(teksCek, { parse_mode: 'Markdown' });
                break;

            case '.kick':
                await ctx.telegram.banChatMember(groupId, targetUserId);
                await ctx.telegram.unbanChatMember(groupId, targetUserId);
                await ctx.reply(`🎯 ${targetMention} \`[${targetUserId}]\` **berhasil dikeluarkan (Kicked)**.`, { parse_mode: 'Markdown' });
                break;

            case '.mute':
                const untilDate = Math.floor(Date.now() / 1000) + (24 * 60 * 60);
                await ctx.telegram.restrictChatMember(groupId, targetUserId, {
                    permissions: { can_send_messages: false },
                    until_date: untilDate
                });
                await ctx.reply(`🔇 ${targetMention} \`[${targetUserId}]\` **berhasil dibisukan (Muted) selama 24 Jam**.`, { parse_mode: 'Markdown' });
                break;

            case '.unmute':
                await ctx.telegram.restrictChatMember(groupId, targetUserId, {
                    permissions: {
                        can_send_messages: true,
                        can_send_media_messages: true,
                        can_send_polls: true,
                        can_send_other_messages: true,
                        can_add_web_page_previews: true
                    }
                });
                await ctx.reply(`🔊 ${targetMention} \`[${targetUserId}]\` **berhasil dibunyikan kembali (Unmuted)**.`, { parse_mode: 'Markdown' });
                break;

            case '.ban':
            case '.block':
                await ctx.telegram.banChatMember(groupId, targetUserId);
                await ctx.reply(`🔨 ${targetMention} \`[${targetUserId}]\` **berhasil diblokir permanen (Banned)**.`, { parse_mode: 'Markdown' });
                break;

            case '.unban':
                await ctx.telegram.unbanChatMember(groupId, targetUserId);
                await ctx.reply(`🔓 ${targetMention} **berhasil dibuka blokirnya (Unbanned)**.`, { parse_mode: 'Markdown' });
                break;
        }

        try { await ctx.deleteMessage(); } catch (e) {}

    } catch (err) {
        console.error('❌ Error Utama Moderasi:', err.description || err);
    }
});