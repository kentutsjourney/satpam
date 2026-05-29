const express = require('express');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); // Masukkan Supabase untuk cek whitelist & maintenance

const app = express();

app.use(express.json());

// =========================================================================
// MIDDLEWARE FILTER UTAMA: SAKLAR MAINTENANCE & WHITELIST GRUP
// =========================================================================
bot.use(async (ctx, next) => {
    const userId = ctx.from ? ctx.from.id.toString() : null;
    const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama / Dewa

    // -----------------------------------------------------------------
    // 1. PROTEKSI SAKLAR GLOBAL MAINTENANCE (Paling Atas)
    // -----------------------------------------------------------------
    try {
        const { data: statusGlobal } = await supabase
            .from('bot_status')
            .select('maintenance_status')
            .eq('id', 1)
            .maybeSingle();
        
        // JIKA BOT SEDANG MAINTENANCE (OFF) DAN YANG CHAT BUKAN SANG DEWA
        if (statusGlobal && statusGlobal.maintenance_status && userId !== OWNER_ID) {
            // Jika chat terjadi di grup, bot langsung bungkam/diam total tanpa ngerespons
            if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
                return; 
            }
            
            // Jika chat terjadi di Private Chat (PC) bot, beri peringatan tertulis
            if (ctx.chat && ctx.chat.type === 'private') {
                return ctx.reply('⚠️ **hampura** ⚠️\n\nBot Kentut lagi anuin anunya di iniin off in dulu yak!');
            }
        }
    } catch (e) {
        console.error('Gagal mengecek saklar maintenance global:', e);
    }

    // -----------------------------------------------------------------
    // 2. MIDDLEWARE FILTER GRUP WHITELIST (Kodingan asli bawaan kamu)
    // -----------------------------------------------------------------
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        const groupId = ctx.chat.id.toString();

        try {
            const { data, error } = await supabase
                .from('group_settings')
                .select('group_id')
                .eq('group_id', groupId)
                .maybeSingle();

            if (!data || error) {
                if (ctx.message && ctx.message.text && /^[./]/.test(ctx.message.text)) {
                    return ctx.reply('izin dulu ke owner bot nya heh, ada tu di bio');
                }
                return; 
            }
        } catch (err) {
            console.error('Error on whitelist middleware in webhook:', err);
        }
    }
    return next();
});

// Load semua handler fitur kita (Gunakan path relativ tingkat dua `../`)
require('../handlers/adminAccess');
require('../handlers/groupWhitelist'); 
require('../handlers/welcome');
require('../handlers/moderation'); 
require('../handlers/antiFlood');
require('../handlers/customCommands');
require('../handlers/textFilter');

// Endpoint utama Webhook untuk menerima update dari Telegram
app.post('/api/webhook', async (req, res) => {
    try {
        await bot.handleUpdate(req.body, res);
    } catch (err) {
        console.error('Error handling update:', err);
        res.status(200).send('OK');
    }
});

app.get('/api/webhook', (req, res) => {
    res.status(200).send('Bot Satpam is running...');
});

module.exports = app;