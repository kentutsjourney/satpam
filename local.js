const bot = require('./config/bot');
const supabase = require('./config/supabase'); // Pastikan Supabase di-require di sini untuk cek database

// Panggil konfigurasi dasar bot
console.log('Memulai bot dalam mode LOKAL (Polling)...');

// =========================================================================
// 3. MIDDLEWARE FILTER GRUP WHITELIST (DITARUH DI SINI AGAR MENYARING DULUAN)
// =========================================================================
bot.use(async (ctx, next) => {
    // Hanya filter pesan yang bertipe grup / supergroup
    if (ctx.chat && (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup')) {
        const groupId = ctx.chat.id.toString();

        try {
            // Cek apakah group_id terdaftar di group_settings
            const { data, error } = await supabase
                .from('group_settings')
                .select('group_id')
                .eq('group_id', groupId)
                .maybeSingle();

            // Jika tidak ditemukan data di database, stop eksekusi dan kirim pesan penolakan
            if (!data || error) {
                // Filter: Hanya balas jika teks di grup berupa command (diawali titik atau garis miring)
                if (ctx.message && ctx.message.text && /^[./]/.test(ctx.message.text)) {
                    return ctx.reply('izin dulu ke owner bot nya heh, ada tu di bio');
                }
                return; // Diamkan jika chat biasa agar bot tidak berisik di grup liar
            }
        } catch (err) {
            console.error('Error on whitelist middleware:', err);
        }
    }
    return next(); // Lanjut ke handler di bawah jika grup aman / privat chat
});

// =========================================================================
// LOAD SEMUA FITUR AGAR AKTIF (Urutan sangat menentukan jalannya middleware!)
// =========================================================================
require('./handlers/adminAccess');
require('./handlers/groupWhitelist');
require('./handlers/welcome');
require('./handlers/moderation'); 
require('./handlers/antiFlood');
require('./handlers/customCommands');
require('./handlers/textFilter');

// Jalankan Bot
bot.launch()
    .then(() => console.log('🤖 Bot Satpam berhasil berjalan di lokal!'))
    .catch((err) => console.error('Gagal menjalankan bot:', err));

// Amankan bot jika aplikasi dihentikan (Ctrl + C)
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));