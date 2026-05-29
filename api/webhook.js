const express = require('express');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); // Masukkan Supabase untuk cek whitelist

const app = express();

app.use(express.json());

// =========================================================================
// MIDDLEWARE FILTER GRUP WHITELIST (Penting dijalankan di level teratas Vercel)
// =========================================================================
bot.use(async (ctx, next) => {
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