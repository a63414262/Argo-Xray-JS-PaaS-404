const http = require('http');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const port = process.env.PORT || 3000;
// --- 核心配置变量 ---
const UUID = process.env.UUID || "de04accx-1af7-4b13-90ce-64197351d4c6";
const ARGO_AUTH = process.env.ARGO_AUTH || ""; 
const PROTOCOL = (process.env.PROTOCOL || "vless").toLowerCase(); // 支持 vless, vmess, trojan, ss
const XRAY_PORT = 8080;
let argoDomain = "正在获取中，请在1分钟后刷新页面...";

// 生成不同协议的节点链接
function generateNodeLink(domain) {
    const wsPath = `/${PROTOCOL}`;
    let link = "";
    
    switch (PROTOCOL) {
        case "vmess":
            const vmessObj = {
                v: "2", ps: "Argo-VMess", add: domain, port: "443", id: UUID,
                aid: "0", scy: "none", net: "ws", type: "none", host: domain, path: wsPath, tls: "tls", sni: domain
            };
            link = `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString('base64')}`;
            break;
        case "trojan":
            link = `trojan://${UUID}@${domain}:443?security=tls&type=ws&host=${domain}&path=${encodeURIComponent(wsPath)}#Argo-Trojan`;
            break;
        case "ss":
        case "shadowsocks":
            // SS 使用 chacha20-ietf-poly1305 加密，密码为 UUID
            const ssCred = Buffer.from(`chacha20-ietf-poly1305:${UUID}`).toString('base64');
            link = `ss://${ssCred}@${domain}:443?plugin=v2ray-plugin%3Btls%3Bhost%3D${domain}%3Bpath%3D${encodeURIComponent(wsPath)}#Argo-SS`;
            break;
        case "vless":
        default:
            link = `vless://${UUID}@${domain}:443?encryption=none&security=tls&type=ws&host=${domain}&path=${encodeURIComponent(wsPath)}#Argo-VLESS`;
            break;
    }
    return link;
}

// 1. 创建原生 HTTP Web 服务
const server = http.createServer((req, res) => {
    if (req.url === '/node') {
        if (argoDomain.includes("trycloudflare.com") || ARGO_AUTH !== "") {
            const displayDomain = ARGO_AUTH !== "" ? "固定域名(请使用你绑定的CF域名)" : argoDomain;
            const nodeLink = generateNodeLink(displayDomain);
            
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`--- Argo Xray (${PROTOCOL.toUpperCase()}) 节点信息 ---\n状态: 已就绪\n域名: ${displayDomain}\nUUID/密码: ${UUID}\n协议: ${PROTOCOL}\n路径: /${PROTOCOL}\n端口: 443 (TLS)\n\n订阅链接:\n${nodeLink}`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`隧道正在启动中...\n当前状态: ${argoDomain}\n请稍后刷新页面获取链接。`);
        }
    } else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<html><body style="text-align:center;padding-top:100px;"><h1>404 Not Found</h1><hr><address>Apache Server</address></body></html>`);
    }
});

server.listen(port, () => {
    console.log(`Web server started on port ${port}`);
    startAll();
});

// 2. 核心启动逻辑
function startAll() {
    // 动态生成对应协议的 Xray 配置文件
    let inboundSettings = {};
    const wsPath = `/${PROTOCOL}`;

    if (PROTOCOL === "vmess") inboundSettings = { clients: [{ id: UUID, alterId: 0 }] };
    else if (PROTOCOL === "trojan") inboundSettings = { clients: [{ password: UUID }] };
    else if (PROTOCOL === "ss" || PROTOCOL === "shadowsocks") inboundSettings = { clients: [{ method: "chacha20-ietf-poly1305", password: UUID }], network: "tcp,udp" };
    else inboundSettings = { clients: [{ id: UUID }], decryption: "none" }; // 默认 VLESS

    const config = {
        inbounds: [{
            port: XRAY_PORT, 
            protocol: PROTOCOL === "ss" ? "shadowsocks" : PROTOCOL,
            settings: inboundSettings,
            streamSettings: { network: "ws", wsSettings: { path: wsPath } }
        }],
        outbounds: [{ protocol: "freedom" }]
    };
    fs.writeFileSync('config.json', JSON.stringify(config));

    // 下载并运行核心文件
    const setup = `
        curl -L -s https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip -o xray.zip && unzip -o xray.zip && chmod +x xray
        curl -L -s https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cf && chmod +x cf
    `;

    console.log(`正在部署 ${PROTOCOL.toUpperCase()} 协议环境...`);
    exec(setup, (err) => {
        if (err) return console.error("文件下载失败:", err);
        
        spawn('./xray', ['-c', 'config.json'], { stdio: 'ignore', detached: true }).unref();

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
                if (match) argoDomain = match[1];
            }
        });
    });
}
