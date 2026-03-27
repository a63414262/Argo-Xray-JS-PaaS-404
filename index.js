const express = require('express');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// --- 默认配置 (如果不设置环境变量，则使用这些默认值) ---
const UUID = process.env.UUID || "de04accx-1af7-4b13-90ce-64197351d4c6"; 
const ARGO_AUTH = process.env.ARGO_AUTH || ""; 
const XRAY_PORT = 8080;
let argoDomain = "正在获取中，约需30-60秒，请稍后刷新...";

// 1. 首页伪装 (404 页面)
app.get('/', (req, res) => {
    res.status(404).send(`
        <html><head><title>404 Not Found</title></head>
        <body style="font-family:sans-serif;text-align:center;padding-top:100px;background:#f4f4f4;">
            <h1 style="font-size:50px;">404</h1><p>The requested URL was not found on this server.</p><hr style="width:50%">
            <address>Apache/2.4.41 (Ubuntu) Server at ${req.hostname} Port ${port}</address>
        </body></html>
    `);
});

// 2. 节点信息展示 (/node)
app.get('/node', (req, res) => {
    if (argoDomain.includes("trycloudflare.com")) {
        const vlessLink = `vless://${UUID}@${argoDomain}:443?encryption=none&security=tls&type=ws&host=${argoDomain}&path=%2Fvl#Argo_Node_JS`;
        res.type('text/plain; charset=utf-8').send(`
--- Argo Xray 节点信息 ---
状态: 已就绪
域名: ${argoDomain}
UUID: ${UUID}
路径: /vl
端口: 443 (TLS)

VLESS 订阅链接:
${vlessLink}
        `);
    } else {
        res.type('text/plain; charset=utf-8').send(`隧道正在启动中...\n当前状态: ${argoDomain}\n请在1分钟内刷新页面获取链接。`);
    }
});

app.listen(port, () => {
    console.log(`Web server started on port ${port}`);
    startAll();
});

function startAll() {
    // 写入 Xray 配置文件
    const config = {
        inbounds: [{
            port: XRAY_PORT, protocol: "vless",
            settings: { clients: [{ id: UUID }], decryption: "none" },
            streamSettings: { network: "ws", wsSettings: { path: "/vl" } }
        }],
        outbounds: [{ protocol: "freedom" }]
    };
    fs.writeFileSync('config.json', JSON.stringify(config));

    // 下载二进制文件 (Linux amd64)
    const setup = `
        curl -L -s https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip -o xray.zip && unzip -o xray.zip && chmod +x xray
        curl -L -s https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cf && chmod +x cf
    `;

    exec(setup, (err) => {
        if (err) return console.error("Binary download failed.");

        // 启动 Xray
        spawn('./xray', ['-c', 'config.json'], { stdio: 'ignore', detached: true }).unref();

        // 启动 Argo 隧道 (临时或固定)
        let args = ['tunnel', '--url', `http://localhost:${XRAY_PORT}`, '--no-autoupdate'];
        if (ARGO_AUTH) {
            if (ARGO_AUTH.includes('{')) {
                fs.writeFileSync('tunnel.json', ARGO_AUTH);
                args = ['tunnel', '--no-autoupdate', 'run', '--cred-file', 'tunnel.json'];
            } else {
                args = ['tunnel', '--no-autoupdate', 'run', '--token', ARGO_AUTH];
            }
        }

        const cf = spawn('./cf', args);
        cf.stderr.on('data', (data) => {
            const log = data.toString();
            if (log.includes('.trycloudflare.com')) {
                const match = log.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
                if (match) {
                    argoDomain = match[1];
                    console.log(`Tunnel ready at: ${argoDomain}`);
                }
            }
        });
    });
}
