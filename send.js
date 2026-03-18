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

    // --- Session Setup ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Sync Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');

            try {
                await sendMsg("✅ *Request Received...*");
                await delay(500);
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // --- VOE Scraper Python Script ---
                const pyScript = `
import os, requests, re, sys, subprocess, base64

f_id = "${fileId}"
ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

try:
    # Google Drive Check
    if len(f_id) > 25:
        import gdown
        url = f"https://drive.google.com/uc?id={f_id}"
        name = gdown.download(url, quiet=True, fuzzy=True)
        if name: print(name)
        sys.exit(0)

    # VOE Scraping Logic
    page_url = f"https://voe.sx/{f_id}"
    res = requests.get(page_url, headers={"User-Agent": ua}, timeout=20)
    html = res.text

    # VOE වල වීඩියෝ ලින්ක් එක Base64 විදිහට හංගලා තියෙන්නේ (atob)
    b64_match = re.search(r"atob\\('([^']+)'\\)", html)
    
    if b64_match:
        d_url = base64.b64decode(b64_match.group(1)).decode('utf-8')
    else:
        # විකල්ප MP4/HLS සෙවීම
        mp4_match = re.search(r'"mp4":\\s*"([^"]+)"', html) or re.search(r"'hls':\\s*'([^']+)'", html)
        if mp4_match:
            d_url = mp4_match.group(1)
        else:
            sys.stderr.write("Link not found on page")
            sys.exit(1)

    # වීඩියෝ එකේ නම සයිට් එකෙන් ගැනීම
    title_match = re.search(r"<title>(.*?)</title>", html)
    name = title_match.group(1).replace("Watch ", "").replace(" - VOE", "").strip() if title_match else "video.mp4"
    name = "".join(x for x in name if x.isalnum() or x in "._- ")
    if not name.lower().endswith(('.mp4', '.mkv')): name += ".mp4"

    # Curl හරහා Download කිරීම
    cmd = f'curl -L -k -s -A "{ua}" -o "{name}" "{d_url}"'
    exit_code = subprocess.call(cmd, shell=True)
    
    if exit_code == 0 and os.path.exists(name):
        print(name)
    else:
        sys.exit(1)
except Exception as e:
    sys.stderr.write(str(e))
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                let fileName;
                try {
                    fileName = execSync('python3 downloader.py').toString().trim();
                } catch (pyErr) {
                    let errorMsg = pyErr.stderr.toString() || "Connection/Scraping Error";
                    await sendMsg("❌ *දෝෂය:* " + errorMsg);
                    throw pyErr;
                }

                if (!fileName || !fs.existsSync(fileName)) throw new Error("File missing");

                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                const ext = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(ext);
                const mime = isSub ? 'text/plain' : (ext === '.mp4' ? 'video/mp4' : 'video/x-matroska');
                const header = isSub ? "💚 *Subtitles Upload Successfully...*" : "💚 *Video Upload Successfully...*";

                // WhatsApp Document Message
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mime,
                    caption: `${header}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`
                });

                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්...* 💝");
                
                // Cleanup
                if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
                if (fs.existsSync('downloader.py')) fs.unlinkSync('downloader.py');
                
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                process.exit(1);
            }
        }
    });
}

startBot();
