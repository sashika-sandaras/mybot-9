const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const https = require('https'); // මේක අනිවාර්යයි

async function startBot() {
    // --- Session & Connection Setup (කලින් විදිහටම තියෙන්න දෙන්න) ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    const sessionData = process.env.SESSION_ID;
    if (sessionData) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const sock = makeWASocket({ auth: state, version, logger: pino({ level: 'silent' }) });
    sock.ev.on('creds.update', saveCreds);

    // --- වීඩියෝ එක එවීමේ කොටස ---
    sock.ev.on('connection.update', async (update) => {
        if (update.connection === 'open') {
            console.log("✅ Connected!");
            const userJid = process.env.USER_JID;
            if (fs.existsSync('filename.txt') && userJid) {
                const fileName = fs.readFileSync('filename.txt', 'utf8').trim();
                if (fs.existsSync(`./${fileName}`)) {
                    await sock.sendMessage(userJid, { 
                        document: fs.readFileSync(`./${fileName}`), 
                        fileName: fileName,
                        caption: `🎬 *MFlix Delivery*\n\n*File:* ${fileName}`
                    });
                    await delay(5000);
                    process.exit(0);
                }
            }
        }
    });

    // --- මෙන්න මේ කොටස තමයි වැදගත්ම (Trigger) ---
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        if (!msg.message || msg.key.fromMe) return;
        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";

        if (text.startsWith('.tv')) {
            const fileId = text.split(' ')[1];
            if (!fileId) return;

            await sock.sendMessage(from, { text: "⏳ Request එක ලැබුණා. වීඩියෝව සූදානම් කරමින් පවතී..." });

            // ⚠️ ඔයාගේ Google Script URL එකේ අන්තිම ටික (ID එක) විතරක් මෙතනට දාන්න
            // උදා: AKfycbzc3r7kkyAH6QhFLQyiEuI9ZAoAJuOJ9mkGDzgE8VmMHwkTcmdvguMsxDl3ThghmFC1
            const scriptId = "AKfycby2MnKbKH0etBMQReKGrm0vYgSANOibPiKgMuCeM0PUuTA0KNFNn625Bved9pqyWxQ8";
            
            const data = JSON.stringify({ fileId: fileId, userJid: from });

            const options = {
                hostname: 'script.google.com',
                path: `/macros/s/${scriptId}/exec`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': data.length
                }
            };

            const req = https.request(options, (res) => {
                console.log(`Status: ${res.statusCode}`);
                // Google Script එක Redirect වෙන නිසා 302 එකක් එන්න පුළුවන්, ඒක ප්‍රශ්නයක් නැහැ
            });

            req.on('error', (error) => { console.error(error); });
            req.write(data);
            req.end();
            
            console.log(`🚀 Sent to Google: ${fileId}`);
        }
    });
}
startBot();
