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
    // --- 1. Session එක සකස් කිරීම ---
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
        browser: ["Ubuntu", "Chrome", "20.0.04"],
        syncFullHistory: false,
        markOnlineOnConnect: true,
        connectTimeoutMs: 120000, // ලොකු ෆයිල් යැවීමට වෙලාව වැඩි කිරීම
    });

    sock.ev.on('creds.update', saveCreds);

    // --- 2. වීඩියෝව Document එකක් ලෙස යැවීමේ Function එක ---
    async function sendDownloadedVideo(sock) {
        const userJid = process.env.USER_JID;
        const fileNameFile = 'filename.txt';

        if (fs.existsSync(fileNameFile)) {
            const videoFileName = fs.readFileSync(fileNameFile, 'utf-8').trim();
            
            if (fs.existsSync(videoFileName)) {
                console.log(`🚀 Sending Original File: ${videoFileName} to ${userJid}`);
                
                try {
                    // Document එකක් ලෙස යැවීම (Original format එකෙන්ම යයි)
                    await sock.sendMessage(userJid, { 
                        document: { url: `./${videoFileName}` }, 
                        fileName: videoFileName, 
                        mimetype: 'video/x-matroska', // හෝ 'application/octet-stream'
                        caption: `✅ ඔයා ඉල්ලපු වීඩියෝව මෙන්න!\n\n📂 *File Name:* ${videoFileName}\n🍿 *MFlix Hybrid Downloader*`
                    });

                    console.log("✅ Document Sent Successfully!");
                    
                    // යැවූ පසු ෆයිල් එක මකා දැමීම
                    fs.unlinkSync(videoFileName);
                    fs.unlinkSync(fileNameFile);
                    
                    console.log("🎬 Task Finished. Shutting down...");
                    setTimeout(() => process.exit(0), 5000);
                } catch (err) {
                    console.error("❌ Error sending document:", err.message);
                    process.exit(1);
                }
            } else {
                console.log("❌ Video file not found on disk!");
                process.exit(1);
            }
        } else {
            console.log("ℹ️ No pending video to send.");
        }
    }

    // --- 3. Connection එකේ තත්ත්වය පරීක්ෂාව ---
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const statusCode = lastDisconnect.error?.output?.statusCode;
            if (statusCode !== 405 && statusCode !== 401 && statusCode !== DisconnectReason.loggedOut) {
                console.log('🔄 Reconnecting...');
                startBot();
            } else {
                process.exit(1);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot is Online and Ready!');
            await delay(5000);
            await sendDownloadedVideo(sock);
        }
    });

    // --- 4. Commands (.tv) ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            if (!fileId) return;
            await sock.sendMessage(from, { text: "⏳ Request එක ලැබුණා. පද්ධතියට යොමු කරමින්..." });
            const scriptUrl = "https://script.google.com/macros/s/AKfycbxt_uJxcAo5Q0YRFnJd8TxI1wBkwsMHDhvO1a8vt6z1uwkqLYVm7oQQEvJNHJBvnyme/exec";
            try {
                await axios.post(scriptUrl, { fileId: fileId, userJid: from });
                await sock.sendMessage(from, { text: "✅ සාර්ථකයි! වීඩියෝව සූදානම් කර එවනු ඇත." });
            } catch (e) { console.error(e.message); }
        }
    });
}

startBot();
