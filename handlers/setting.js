const bot = require('../config/bot');
const supabase = require('../config/supabase');
const { Markup } = require('telegraf');
// PANGGIL TEMPLATE MENU UTAMA DARI MENUS.JS
const { getMainSettingsMenu } = require('../keyboards/menus');

// 1. KETIK /setting -> MUNCUL DAFTAR GRUP YANG TERDAFTAR
bot.command('setting', async (ctx) => {
    try {
        if (ctx.chat.type !== 'private') return;

        const { data: groups, error } = await supabase
            .from('group_settings')
            .select('group_id, group_name');

        if (error || !groups || groups.length === 0) {
            return ctx.reply('❌ Belum ada grup yang terdaftar. Silakan tambahkan grup terlebih dahulu.');
        }

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
        await ctx.answerCbQuery().catch(() => {});
        const groupId = ctx.match[1];

        // Ambil detail setting grup spesifik dari Supabase
        const { data: settings } = await supabase
            .from('group_settings')
            .select('*')
            .eq('group_id', groupId)
            .maybeSingle();

        if (!settings) return ctx.reply('❌ Data grup tidak ditemukan.');

        const statusWelcome = settings.welcome_status ? '🟢 ON' : '🔴 OFF';

        let infoTeks = `⚙️ **PENGATURAN GRUP CHAT**\n` +
                       `• Nama Grup: *${settings.group_name || 'Tidak Diketahui'}*\n` +
                       `• ID Grup: \`${groupId}\`\n\n` +
                       `Silakan pilih modul di bawah untuk melakukan konfigurasi:`;

        // FIXED: Menggunakan getMainSettingsMenu dari keyboards/menus.js agar tombol "Pengaturan Member" muncul!
        await ctx.editMessageText(infoTeks, {
            parse_mode: 'Markdown',
            ...getMainSettingsMenu(settings, groupId)
        });
    } catch (err) {
        console.error('Error manage group:', err);
    }
});

// 3. TOMBOL KEMBALI KE DAFTAR GRUP
bot.action('back_to_groups', async (ctx) => {
    try {
        await ctx.answerCbQuery().catch(() => {});
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