const http = require('http');
const net = require('net');
const { spawn, exec } = require('child_process');
const fs = require('fs');

const webPort = process.env.PORT || 3000; // 对外暴露的主端口 (Argo 隧道连接的端口)
const WEB_UI_PORT = 3001; // 内部 Web 界面端口
const UUID = process.env.UUID || "de04acca-1af7-4b13-90ce-64197351d4c6";
const ARGO_AUTH = process.env.ARGO_AUTH || ""; 
let argoDomain = "正在连接 Cloudflare 隧道...";

// --- 内存日志系统 ---
const logs = [];
function addLog(module, msg) {
    const time = new Date().toISOString().split('T')[1].slice(0, 8);
    const line = `[${time}] [${module}] ${msg.trim()}`;
    console.log(line);
    logs.push(line);
    if (logs.length > 200) logs.shift();
}

// 1. 网页服务 (运行在内部端口 3001)
const server = http.createServer((req, res) => {
    // 【日志页面】
    if (req.url === '/log') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`=== 系统实时日志 (最新200条) ===\n\n${logs.join('\n')}\n\n===========================\n提示: 刷新页面可获取最新日志。`);
        return;
    }

    // 【节点面板页面】
    if (req.url === '/node' || req.url === '/') {
        const displayDomain = ARGO_AUTH !== "" ? "固定域名(请使用你绑定的CF域名)" : argoDomain;
        
        const vlessLink = `vless://${UUID}@${displayDomain}:443?encryption=none&security=tls&type=ws&host=${displayDomain}&path=%2Fvl#Argo_VLESS`;
        const trojanLink = `trojan://${UUID}@${displayDomain}:443?security=tls&type=ws&host=${displayDomain}&path=%2Ftr#Argo_Trojan`;
        
        const vmessObj = {
            v: "2", ps: "Argo_VMess", add: displayDomain, port: "443", id: UUID,
            aid: "0", net: "ws", type: "none", host: displayDomain, path: "/vm", tls: "tls"
        };
        const vmessLink = `vmess://${Buffer.from(JSON.stringify(vmessObj)).toString('base64')}`;
        
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        if (argoDomain.includes("trycloudflare.com") || ARGO_AUTH !== "") {
            res.end(`--- Argo Xray (全协议多路复用版) ---\n状态: 运行正常\n域名: ${displayDomain}\nUUID: ${UUID}\n\n节点链接:\n==================================================\n🟢 【VLESS】\n${vlessLink}\n\n🟣 【Trojan】\n${trojanLink}\n\n🔵 【VMess】\n${vmessLink}\n==================================================\n\n👉 想看运行日志？请访问: /log`);
        } else {
            res.end(`隧道启动中...\n状态: ${argoDomain}\n\n👉 迟迟不显示？请访问 /log 查看后台报错。`);
        }
    } 
    // 【赛博朋克 404 页面】
    else {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        const html404 = `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>404 - 迷失在赛博空间</title>
            <style>
                body { font-family: 'Courier New', Courier, monospace; background-color: #0d0d0d; color: #00ff00; padding: 20px; line-height: 1.6; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
                .container { max-width: 800px; background: #1a1a1a; padding: 40px; border-radius: 8px; box-shadow: 0 0 30px rgba(0, 255, 0, 0.1); border: 1px solid #333; }
                h1 { font-size: 4em; color: #ff3333; text-shadow: 2px 2px #cc0000; margin-top: 0; margin-bottom: 10px; }
                h2 { color: #00ccff; border-bottom: 1px dashed #00ccff; padding-bottom: 5px; margin-top: 30px; }
                p { font-size: 1.1em; color: #cccccc; }
                .highlight { color: #ffaa00; font-weight: bold; }
                .nav { margin-top: 40px; text-align: center; display: flex; justify-content: center; gap: 20px; flex-wrap: wrap; }
                a { color: #00ff00; text-decoration: none; border: 1px solid #00ff00; padding: 10px 20px; border-radius: 4px; transition: all 0.3s; font-weight: bold; background: rgba(0,255,0,0.05); }
                a:hover { background: #00ff00; color: #0d0d0d; box-shadow: 0 0 15px #00ff00; }
                .cursor { display: inline-block; width: 10px; height: 1.2em; background-color: #00ff00; vertical-align: middle; animation: blink 1s step-end infinite; }
                @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>404 Not Found</h1>
                <p><strong><span id="typewriter"></span><span class="cursor"></span></strong></p>
                
                <h2>🌐 404 的前世今生</h2>
                <p><span class="highlight">【都市传说】：</span>据说，万维网之父 Tim Berners-Lee 当年在瑞士的 CERN（欧洲核子研究中心）工作时，中央数据库就设在 <strong>404 房间</strong>。由于早期网络极不稳定，大家经常找不到文件，便会互相抱怨：“又报 404 房间的错了”。</p>
                <p><span class="highlight">【技术真相】：</span>其实 CERN 根本没有 404 房间（他们的办公室编号是从 410 开始的）。404 只是 HTTP 状态码的冰冷逻辑：<strong>4</strong> 代表客户端错误（例如路径拼写错误），<strong>04</strong> 代表在这些分类中，"未找到 (Not Found)" 被排在了第 4 号。</p>
                
                <h2>🎨 404 亚文化</h2>
                <p>从最初令人沮丧的技术报错，404 页面现已演变为互联网特有的浪漫。有些被做成恐龙跑酷小游戏，有些用来挂载公益寻人启事，而在这里，它成了你探索这台代理服务器底层的证明。</p>
                
                <div class="nav">
                    <a href="/node">👉 返回节点中心</a>
                    <a href="/log">📜 查看运行日志</a>
                </div>
            </div>
            <script>
                const text = "[系统提示]：坐标丢失，你似乎游荡到了这台服务器的未分配象限。";
                let i = 0;
                function type() {
                    if (i < text.length) {
                        document.getElementById("typewriter").innerHTML += text.charAt(i);
                        i++;
                        setTimeout(type, 60);
                    }
                }
                window.onload = type;
            </script>
        </body>
        </html>
        `;
        res.end(html404);
    }
});

server.listen(WEB_UI_PORT, () => {
    addLog('SYSTEM', `Web UI 已启动在内部端口: ${WEB_UI_PORT}`);
    startMultiplexer(); // 启动流量分发器
});

// 2. 【核心】L7 流量分发器 (运行在主端口 3000)
function startMultiplexer() {
    const muxServer = net.createServer((socket) => {
        socket.once('data', (data) => {
            const reqStr = data.toString('utf8');
            let targetPort = WEB_UI_PORT; // 默认将流量给 Web 界面

            // 根据 HTTP 请求路径智能分发流量
            if (reqStr.includes('GET /vl') || reqStr.includes('GET /vl/')) {
                targetPort = 10001; // 转发给 VLESS
            } else if (reqStr.includes('GET /tr') || reqStr.includes('GET /tr/')) {
                targetPort = 10002; // 转发给 Trojan
            } else if (reqStr.includes('GET /vm') || reqStr.includes('GET /vm/')) {
                targetPort = 10003; // 转发给 VMess
            }

            // 建立到目标端口的连接并透传数据
            const proxy = net.createConnection(targetPort, '127.0.0.1', () => {
                proxy.write(data); 
                socket.pipe(proxy);
                proxy.pipe(socket);
            });

            proxy.on('error', () => socket.end());
            socket.on('error', () => proxy.end());
        });
    });

    muxServer.listen(webPort, () => {
        addLog('SYSTEM', `流量多路复用器 (Multiplexer) 启动在端口: ${webPort}`);
        startCore(); // 启动 Xray 和 Argo
    });
}

// 3. 核心进程启动逻辑
function startCore() {
    addLog('SYSTEM', '正在生成多协议配置文件...');
    
    // Xray 配置，开启三个完全独立的入站端口
    const config = {
        log: { loglevel: "debug" },
        inbounds: [
            {
                port: 10001, listen: "127.0.0.1", protocol: "vless",
                settings: { clients: [{ id: UUID }], decryption: "none" },
                streamSettings: { network: "ws", wsSettings: { path: "/vl" } }
            },
            {
                port: 10002, listen: "127.0.0.1", protocol: "trojan",
                settings: { clients: [{ password: UUID }] },
                streamSettings: { network: "ws", wsSettings: { path: "/tr" } }
            },
            {
                port: 10003, listen: "127.0.0.1", protocol: "vmess",
                settings: { clients: [{ id: UUID, alterId: 0 }] },
                streamSettings: { network: "ws", wsSettings: { path: "/vm" } }
            }
        ],
        outbounds: [{ protocol: "freedom" }]
    };
    fs.writeFileSync('config.json', JSON.stringify(config));

    addLog('SYSTEM', '正在下载二进制核心...');
    const setup = `curl -L -s https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip -o xray.zip && unzip -o xray.zip && chmod +x xray && curl -L -s https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cf && chmod +x cf`;

    exec(setup, (err) => {
        if (err) {
            addLog('ERROR', `下载核心失败: ${err.message}`);
            return;
        }
        addLog('SYSTEM', '下载完成，准备启动核心进程...');
        
        const xrayProcess = spawn('./xray', ['-c', 'config.json']);
        xrayProcess.stdout.on('data', (data) => addLog('XRAY-INFO', data.toString()));
        xrayProcess.stderr.on('data', (data) => addLog('XRAY-WARN', data.toString()));
        xrayProcess.on('close', (code) => addLog('XRAY-EXIT', `进程异常退出，退出码: ${code}`));

        // 让 Argo 隧道直接连接到我们的 Node.js 流量分发器 (webPort)
        let args = ['tunnel', '--url', `http://127.0.0.1:${webPort}`, '--no-autoupdate'];
        if (ARGO_AUTH) {
            if (ARGO_AUTH.includes('{')) {
                fs.writeFileSync('tunnel.json', ARGO_AUTH);
                args = ['tunnel', '--no-autoupdate', 'run', '--cred-file', 'tunnel.json'];
            } else {
                args = ['tunnel', '--no-autoupdate', 'run', '--token', ARGO_AUTH];
            }
        }

        const cfProcess = spawn('./cf', args);
        cfProcess.stdout.on('data', (data) => addLog('ARGO-INFO', data.toString()));
        cfProcess.stderr.on('data', (data) => {
            const log = data.toString();
            addLog('ARGO-LOG', log);
            
            if (log.includes('.trycloudflare.com')) {
                const match = log.match(/https:\/\/([a-z0-9-]+\.trycloudflare\.com)/i);
                if (match) {
                    argoDomain = match[1];
                    addLog('SYSTEM', `成功抓取到隧道域名: ${argoDomain}`);
                }
            }
        });
        cfProcess.on('close', (code) => addLog('ARGO-EXIT', `隧道进程退出，退出码: ${code}`));
    });
}
