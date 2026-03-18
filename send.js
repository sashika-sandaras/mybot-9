const { 
    default: makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason,
    delay,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const axios = require('axios');

async function startBot() {
    // --- Session Setup ---
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
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        // ⚠️ මේ settings 405 error එක නවත්වන්න උදව් වෙනවා
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        printQRInTerminal: false,
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: undefined,
    });

    sock.ev.on('creds.update', saveCreds);

    // --- Connection Update (Error Handling) ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            console.log(`❌ Connection Closed. Status Code: ${statusCode}`);

            // 405, 401 හෝ 411 වගේ ඒවා ආවොත් ලූපයක් නොවී නතර කරනවා
            const shouldReconnect = statusCode !== 405 && 
                                   statusCode !== 401 && 
                                   statusCode !== 411 &&
                                   statusCode !== DisconnectReason.loggedOut;
            
            if (shouldReconnect) {
                console.log('🔄 Reconnecting in 5 seconds...');
                setTimeout(() => startBot(), 5000);
            } else {
                console.log('🚫 Session Conflict or Expired. Please Logout and Scan Again.');
                process.exit(1); 
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is Online and Ready!');
        }
    });

    // --- Message Handling (.tv command) ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            if (!fileId) return;

            await sock.sendMessage(from, { text: "⏳ Request එක ලැබුණා. පද්ධතියට යොමු කරමින්..." });

            // ⚠️ Google Script URL එක නිවැරදිද බලන්න
            const scriptUrl = "https://script.google.com/macros/s/AKfycbxt_uJxcAo5Q0YRFnJd8TxI1wBkwsMHDhvO1a8vt6z1uwkqLYVm7oQQEvJNHJBvnyme/exec";

            try {
                await axios.post(scriptUrl, { fileId: fileId, userJid: from });
                await sock.sendMessage(from, { text: "✅ සාර්ථකයි! වීඩියෝව සූදානම් කර එවනු ඇත." });
            } catch (error) {
                console.error("❌ Sheet Error:", error.message);
            }
        }
    });

    // GitHub Action එක විනාඩි 2කින් shutdown කරන්න
    setTimeout(() => {
        console.log("⏰ Time Limit reached. Shutting down...");
        process.exit(0);
    }, 120000); 
}

startBot();
