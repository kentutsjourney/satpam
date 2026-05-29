const express = require('express');
const bot = require('../config/bot');
const supabase = require('../config/supabase'); // Masukkan Supabase untuk cek whitelist & maintenance

const app = express();
app.use(express.json());

// =========================================================================
// PENGAMAN SERVERLESS: LOAD MIDDLEWARE & HANDLER HANYA 1 KALI (ANTI-DUPLIKAT)
// =========================================================================
if (!global.botHandlersLoaded) {

    // 1. MIDDLEWARE FILTER UTAMA: SAKLAR MAINTENANCE & WHITELIST GRUP
    bot.use(async (ctx, next) => {
        const userId = ctx.from ? ctx.from.id.toString() : null;
        const OWNER_ID = "1382446968"; // ID Kamu sebagai Owner Utama / Dewa

        // -----------------------------------------------------------------
        // A. PROTEKSI SAKLAR GLOBAL MAINTENANCE (Paling Atas)
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
                    return; // Stop & abaikan chat grup
                }
                
                // Jika chat terjadi di Private Chat (PC) bot, beri peringatan tertulis
                if (ctx.chat && ctx.chat.type === 'private') {
                    // Gunakan catch untuk menghindari crash jika user memblokir bot
                    return ctx.reply('⚠️ **hampura** ⚠️\n\nBot Kentut lagi anuin anunya di iniin off in dulu yak!').catch(() => {});
                }
            }
        } catch (e) {
            console.error('Gagal mengecek saklar maintenance global:', e);
        }

        // -----------------------------------------------------------------
        // B. MIDDLEWARE FILTER GRUP WHITELIST
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
                        return ctx.reply('izin dulu ke owner bot nya heh, ada tu di bio').catch(() => {});
                    }
                    return; // Diam jika bukan command
                }
            } catch (err) {
                console.error('Error on whitelist middleware in webhook:', err);
            }
        }

        // Jika semua lolos, lanjutkan ke handler fitur berikutnya
        return next();
    });

    // 2. LOAD SEMUA HANDLER FITUR (Hanya di-load sekali di memori global)
    require('../handlers/adminAccess');
    require('../handlers/groupWhitelist'); 
    require('../handlers/welcome');
    require('../handlers/moderation'); 
    require('../handlers/antiFlood');
    require('../handlers/customCommands');
    require('../handlers/textFilter');
    require('../handlers/memberManagement');

    // Tandai bahwa handler sudah sukses dimuat ke memori node process
    global.botHandlersLoaded = true;
    console.log('✅ Semua handler & middleware Telegraf berhasil di-load ke memori.');
}

// =========================================================================
// ENDPOINT UTAMA WEBHOOK VERCEL
// =========================================================================
app.post('/api/webhook', async (req, res) => {
    try {
        // Biar Vercel ga timeout, langsung proses update telegram
        await bot.handleUpdate(req.body, res);
    } catch (err) {
        console.error('Error handling update:', err);
        // Tetap kirim status 200 ke Telegram biar Telegram ga kirim ulang webhook yang sama terus-terusan
        if (!res.headersSent) {
            res.status(200).send('OK');
        }
    }
});

app.get('/api/webhook', (req, res) => {
    res.status(200).send('Bot Satpam is running smoothly...');
});

module.exports = app;