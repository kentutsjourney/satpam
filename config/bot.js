const { Telegraf } = require('telegraf');
require('dotenv').config();

if (!process.env.BOT_TOKEN) {
    throw new Error('BOT_TOKEN harus diisi di file .env');
}

const bot = new Telegraf(process.env.BOT_TOKEN);

module.exports = bot;