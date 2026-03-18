const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    delay, 
    DisconnectReason 
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');

async function startBot() {
    // --- Session Setup (Gifted-Tech/GitHub Environment) ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    
    const sessionData = process.env.SESSION_ID;
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
            console.log("✅ Session Loaded Successfully!");
        } catch (e) {
            console.log("❌ Session Decode Error:", e.message);
        }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix Bot", "Chrome", "1.0.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    // --- Message Handling ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            if (!fileId) return;

            await sock.sendMessage(from, { text: "⏳ Request එක ලැබුණා. පද්ධතියට යොමු කරමින්..." });

            // ⚠️ Google Script Web App URL එක මෙතනට දාන්න
            const scriptUrl = "https://script.google.com/macros/s/AKfycbxt_uJxcAo5Q0YRFnJd8TxI1wBkwsMHDhvO1a8vt6z1uwkqLYVm7oQQEvJNHJBvnyme/exec";

            try {
                await axios.post(scriptUrl, { fileId: fileId, userJid: from });
                await sock.sendMessage(from, { text: "✅ සාර්ථකයි! වීඩියෝව සූදානම් කර එවනු ඇත." });
            } catch (error) {
                console.error("❌ Sheet Error:", error.message);
            }
        }
    });

    // --- Connection Update (Error handling for loops) ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            console.log(`❌ Connection Closed. Status: ${statusCode}`);

            // Session එක valid නම් විතරක් reconnect වෙන්න
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut && statusCode !== 401;
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => startBot(), 5000);
            } else {
                console.log('🚫 Session Expired or Unauthorized. Please update SESSION_ID.');
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is Online and Ready!');
        }
    });

    // GitHub Action එක ඉවර නොවී විනාඩි 5ක් පවත්වා ගැනීමට
    setTimeout(() => {
        console.log("⏰ 5 Minutes completed. Shutting down bot...");
        process.exit(0);
    }, 300000); 
}

startBot();
