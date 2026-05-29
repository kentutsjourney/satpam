const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { Markup } = require('telegraf');

// 1. KETIK /setting -> MUNCUL DAFTAR GRUP YANG TERDAFTAR
bot.command('setting', async (ctx) => {
    try {
        // Hanya izinkan di Private Chat (biar grup lain ga bisa setting)
        if (ctx.chat.type !== 'private') return;

        // Ambil semua grup yang terdaftar di database
        const { data: groups, error } = await supabase
            .from('group_settings')
            .select('group_id, group_name'); // Pastikan kamu menyimpan nama grup saat pendaftaran

        if (error || !groups || groups.length === 0) {
            return ctx.reply('❌ Belum ada grup yang terdaftar. Silakan tambahkan grup terlebih dahulu melalui database/menu admin.');
        }

        // Susun tombol inline untuk list grup
        // Format callback_data: "manage_group:ID_GRUP"
        const groupButtons = groups.map(g => [
            Markup.button.callback(g.group_name || `Grup (${g.group_id})`, `manage_group:${g.group_id}`)
        ]);

        await ctx.reply('⚙️ **PANEL UTAMA KONFIGURASI**\n\nSilakan pilih grup yang ingin kamu kelola:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(groupButtons)
        });
    } catch (err) {
        console.error('Error menu setting:', err);
    }
});

// 2. KETIK TOMBOL GRUP -> MASUK KE MENU UTAMA GRUP TERSEBUT
bot.action(/^manage_group:(.+)$/, async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const groupId = ctx.match[1];

        // Ambil detail setting grup spesifik
        const { data: settings } = await supabase
            .from('group_settings')
            .select('*')
            .eq('group_id', groupId)
            .maybeSingle();

        if (!settings) return ctx.reply('❌ Data grup tidak ditemukan.');

        const statusWelcome = settings.welcome_status ? '🟢 ON' : '🔴 OFF';

        // Tampilkan Menu Konfigurasi Sambutan bawaan kamu sebelumnya
        // Ubah callback_data tombol di bawah agar membawa informasi groupId, contoh: "atur_foto:IDGRUP"
        const menuButtons = [
            [
                Markup.button.callback(`📸 Atur Foto Sambutan`, `atur_foto:${groupId}`),
                Markup.button.callback(`📝 Atur Teks Sambutan`, `atur_text:${groupId}`)
            ],
            [Markup.button.callback(`➕ Tambah Tombol Link`, `tambah_tombol:${groupId}`)],
            [
                Markup.button.callback(`📝 Edit Tombol`, `edit_tombol:${groupId}`),
                Markup.button.callback(`🗑️ Hapus Tombol`, `hapus_tombol:${groupId}`)
            ],
            [
                Markup.button.callback(settings.welcome_status ? '🔴 Matikan Welcome' : '🟢 Hidupkan Welcome', `toggle_welcome:${groupId}`)
            ],
            [Markup.button.callback('⬅️ Kembali ke Daftar Grup', 'back_to_groups')]
        ];

        let infoTeks = `⚙️ **KONFIGURASI ANTARMUKA SAMBUTAN**\n` +
                       `• Nama Grup: ${settings.group_name || 'Tidak Diketahui'}\n` +
                       `• Status Welcome: ${statusWelcome}\n\n` +
                       `• Teks Saat Ini:\n\`${settings.welcome_text}\`\n\n` +
                       `• Jumlah Tombol Tautan: ${settings.welcome_buttons?.length || 0}/10 tombol`;

        await ctx.editMessageText(infoTeks, {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(menuButtons)
        });
    } catch (err) {
        console.error('Error manage group:', err);
    }
});

// 3. TOMBOL KEMBALI KE DAFTAR GRUP
bot.action('back_to_groups', async (ctx) => {
    try {
        await ctx.answerCbQuery();
        const { data: groups } = await supabase.from('group_settings').select('group_id, group_name');

        const groupButtons = groups.map(g => [
            Markup.button.callback(g.group_name || `Grup (${g.group_id})`, `manage_group:${g.group_id}`)
        ]);

        await ctx.editMessageText('⚙️ **PANEL UTAMA KONFIGURASI**\n\nSilakan pilih grup yang ingin kamu kelola:', {
            parse_mode: 'Markdown',
            ...Markup.inlineKeyboard(groupButtons)
        });
    } catch (err) {
        console.error(err);
    }
});