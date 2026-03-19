const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID;

    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const buffer = Buffer.from(sessionData.split('Gifted~')[1], 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "3.0"]
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            try {
                // පළමු මැසේජ් එක යවා එහි key එක ලබා ගැනීම
                const statusMsg = await sock.sendMessage(userJid, { text: "✅ *Request Received...*" });
                const msgKey = statusMsg.key;

                await delay(1000);
                
                // මැසේජ් එක Edit කිරීම: Download වෙමින්...
                await sock.sendMessage(userJid, { text: "📥 *Download වෙමින් පවතී...*", edit: msgKey });

                let finalFile = "";

                // --- Download Logic ---
                if (fileId.includes("github.com") || fileId.includes("githubusercontent.com")) {
                    let rawUrl = fileId.replace("github.com", "raw.githubusercontent.com").replace("/blob/", "/");
                    finalFile = decodeURIComponent(rawUrl.split('/').pop().split('?')[0]);
                    execSync(`curl -L "${rawUrl}" -o "${finalFile}"`);
                } 
                else {
                    execSync(`gdown --fuzzy "https://drive.google.com/uc?id=${fileId}"`);
                    
                    const files = fs.readdirSync('.');
                    const ignoreList = [
                        'README.md', 'send.js', 'package.json', 'package-lock.json', 
                        'node_modules', 'auth_info', '.github', '.git', 'LICENSE'
                    ];

                    finalFile = files.find(f => 
                        !ignoreList.includes(f) && 
                        !fs.lstatSync(f).isDirectory() &&
                        (f.endsWith('.mkv') || f.endsWith('.mp4') || f.endsWith('.srt') || f.endsWith('.vtt') || f.endsWith('.zip'))
                    );
                }

                if (!finalFile || !fs.existsSync(finalFile)) throw new Error("DL_FAILED");

                console.log("📤 Selected File: " + finalFile);

                // මැසේජ් එක Edit කිරීම: Upload වෙමින්...
                await sock.sendMessage(userJid, { text: "📤 *Upload වෙමින් පවතී...*", edit: msgKey });

                const ext = path.extname(finalFile).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                let mainStatus = isSub ? "Subtitles Upload Successfully..." : "Video Upload Successfully...";
                
                let finalCaption = `💚 *${mainStatus}*\n\n` +
                                   `📦 *File :* \`${finalFile}\`\n\n` +
                                   `🏷️ *Mflix WhDownloader*\n` +
                                   `💌 *Made With Sashika Sandras*\n\n` +
                                   `☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n` +
                                   `*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝`;

                // ෆයිල් එක යැවීම
                await sock.sendMessage(userJid, {
                    document: fs.readFileSync(`./${finalFile}`),
                    fileName: finalFile,
                    mimetype: isSub ? "text/vtt" : "video/x-matroska",
                    caption: finalCaption
                });

                // අවසානයේ Done ලෙස Edit කිරීම
                await sock.sendMessage(userJid, { text: "✅ *Done!*", edit: msgKey });

                if (fs.existsSync(finalFile)) fs.unlinkSync(finalFile);
                await delay(5000);
                process.exit(0);

            } catch (err) {
                console.error(err);
                await sock.sendMessage(userJid, { text: "❌ *බාගත කිරීමේදී හෝ යැවීමේදී දෝෂයක් සිදු විය...*" });
                process.exit(1);
            }
        }
    });
}

startBot();
