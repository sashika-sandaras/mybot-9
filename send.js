const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');

async function startBot() {
    // 1. Session එක සකස් කිරීම
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    const sessionData = process.env.SESSION_ID;
    
    try {
        if (sessionData) {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("📂 Session Ready.");
        }
    } catch (e) {
        console.log("❌ Session Error: " + e.message);
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        connectTimeoutMs: 120000,
        defaultQueryTimeoutMs: 0
    });

    sock.ev.on('creds.update', saveCreds);

    // 2. Connection එක ඕපන් වුණාම සිදුවන දේ
    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log("✅ WhatsApp Connected!");

            // --- GitHub Action එකෙන් එන Request එකක් නම් වීඩියෝ එක යවනවා ---
            const userJid = process.env.USER_JID;
            if (fs.existsSync('filename.txt') && userJid) {
                const originalFileName = fs.readFileSync('filename.txt', 'utf8').trim();
                const filePath = `./${originalFileName}`;

                if (fs.existsSync(filePath)) {
                    console.log(`📤 Sending Movie: ${originalFileName}`);
                    await sock.sendMessage(userJid, { 
                        document: fs.readFileSync(filePath), 
                        mimetype: originalFileName.endsWith('.mkv') ? 'video/x-matroska' : 'video/mp4',
                        fileName: originalFileName,
                        caption: `🎬 *MFlix Original Delivery*\n\n*Name:* ${originalFileName}\n\nරසවිඳින්න! 🍿`
                    });
                    console.log("🚀 Successfully Sent!");
                    await delay(10000);
                    process.exit(0);
                }
            }
        }
    });

    // 3. යූසර් එවන මැසේජ් වලට රිප්ලයි කිරීම (Trigger Logic)
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        // .tv [ID] චෙක් කිරීම
        if (text.startsWith('.tv')) {
            const args = text.split(' ');
            const fileId = args[1];

            if (!fileId) {
                await sock.sendMessage(from, { text: "❌ කරුණාකර වීඩියෝ ID එක ඇතුළත් කරන්න.\nඋදා: *.tv 16WlbtOM...*" });
                return;
            }

            await sock.sendMessage(from, { text: "⏳ ඔබගේ ඉල්ලීම පද්ධතියට ලැබුණා. වීඩියෝව සකසමින් පවතී, මඳක් රැඳී සිටින්න..." });

            try {
                // ඔයාගේ Google Apps Script URL එක
                const scriptUrl = "https://script.google.com/macros/s/AKfycbx9ryHSNkdSw6BJs5vEteTsAj5HQQEYevbMd7nuoVjWeEVG--DhdiJu-uCLWrNvjJI3/exec";

                // Google Script එකට Trigger එක යවනවා
                await axios.post(scriptUrl, {
                    fileId: fileId,
                    userJid: from
                });
                console.log(`✅ Triggered GitHub for: ${fileId}`);
            } catch (error) {
                console.error("❌ Trigger Error:", error.message);
            }
        }
    });
}

startBot();
