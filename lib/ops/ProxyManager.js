/**
 * 代理管理核心类
 * 负责域名反向代理配置、SSL证书申请等
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

class ProxyManager {
  constructor(rootDir) {
    this.rootDir = rootDir;
  }

  /**
   * 检查sudo权限
   */
  async checkSudoPermission() {
    try {
      execSync('sudo -n true', { stdio: 'ignore' });
      return true;
    } catch (error) {
      console.log('\n⚠️  需要管理员权限来配置系统服务');
      console.log('💡 请确保当前用户有sudo权限，或以root用户运行');
      console.log('💡 如果是首次使用sudo，可能需要输入密码');
      return false;
    }
  }

  /**
   * 交互式配置域名代理
   */
  async setupDomainProxy() {
    console.log('\n🌐 域名代理配置向导');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 检查sudo权限
    const hasSudoPermission = await this.checkSudoPermission();
    if (!hasSudoPermission) {
      console.log('\n❌ 配置域名代理需要管理员权限，请重新运行');
      return;
    }

    try {
      // 1. 询问域名
      const domain = await this.askDomain();
      if (!domain) {
        console.log('❌ 域名不能为空');
        return;
      }

      // 2. 验证域名格式
      if (!this.validateDomain(domain)) {
        console.log('❌ 域名格式不正确');
        return;
      }

      console.log(`\n🔍 配置域名: ${domain}`);

      // 3. 检测可用的代理工具
      console.log('🔍 检测系统环境...');
      const proxyTool = await this.detectProxyTool();

      // 4. 生成配置
      console.log(`📝 使用 ${proxyTool.toUpperCase()} 生成配置...`);
      await this.generateConfig(domain, proxyTool);

      // 5. 安装SSL证书
      console.log('🔒 配置SSL证书...');
      await this.setupSSL(domain, proxyTool);

      // 6. 重启代理服务
      console.log('🔄 重启代理服务...');
      await this.restartProxy(proxyTool);

      // 7. 验证配置
      console.log('✅ 验证配置...');
      await this.verifySetup(domain);

      console.log('\n🎉 域名代理配置完成！');
      console.log(`🌐 您现在可以通过 https://${domain} 访问服务`);
      console.log(`📱 管理界面: https://${domain}/admin/`);
      console.log(`🔗 API端点: https://${domain}/api/v1/messages`);

    } catch (error) {
      console.error('❌ 配置失败:', error.message);
      throw error;
    }
  }

  /**
   * 询问用户输入域名
   */
  async askDomain() {
    // 确保输入流处于正确状态
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,  // 禁用终端模式避免双字符
      crlfDelay: Infinity
    });

    return new Promise((resolve) => {
      rl.question('请输入您的域名 (例如: api.example.com): ', (domain) => {
        rl.close();
        // 清理输入流
        process.stdin.removeAllListeners();
        resolve(domain.trim());
      });
    });
  }

  /**
   * 验证域名格式
   */
  validateDomain(domain) {
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    return domainRegex.test(domain);
  }

  /**
   * 检测可用的代理工具
   */
  async detectProxyTool() {
    console.log('🔍 检测已安装的代理工具...');

    // 检查Caddy
    if (await this.isCaddyInstalled()) {
      console.log('✅ 检测到 Caddy');
      return 'caddy';
    }

    // 检查Nginx
    if (await this.isNginxInstalled()) {
      console.log('✅ 检测到 Nginx');
      return 'nginx';
    }

    // 如果都没安装，询问用户要安装哪个
    console.log('⚠️  未检测到代理工具');
    return await this.chooseAndInstallProxy();
  }

  /**
   * 检查是否安装了Caddy
   */
  async isCaddyInstalled() {
    try {
      execSync('caddy version', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 检查是否安装了Nginx
   */
  async isNginxInstalled() {
    try {
      execSync('nginx -v', { stdio: 'ignore' });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * 让用户选择并安装代理工具
   */
  async chooseAndInstallProxy() {
    // 确保输入流处于正确状态
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,  // 禁用终端模式避免双字符
      crlfDelay: Infinity
    });

    return new Promise((resolve, reject) => {
      console.log('\n📋 请选择要安装的代理工具:');
      console.log('  1) Caddy (推荐 - 自动HTTPS)');
      console.log('  2) Nginx (经典选择)');
      console.log('  3) 取消配置');

      rl.question('请输入选择 (1-3): ', async (choice) => {
        rl.close();
        // 清理输入流
        process.stdin.removeAllListeners();

        try {
          switch (choice.trim()) {
            case '1':
              console.log('📦 正在安装 Caddy...');
              await this.installCaddy();
              resolve('caddy');
              break;
            case '2':
              console.log('📦 正在安装 Nginx...');
              await this.installNginx();
              resolve('nginx');
              break;
            case '3':
              console.log('❌ 用户取消配置');
              reject(new Error('用户取消配置'));
              break;
            default:
              console.log('❌ 无效选择');
              reject(new Error('无效选择'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * 安装Caddy
   */
  async installCaddy() {
    try {
      console.log('🔄 正在安装 Caddy...');

      // 一键安装脚本
      execSync('curl -1sLf "https://dl.cloudsmith.io/public/caddy/stable/script.deb.sh" | sudo bash', { stdio: 'inherit' });
      execSync('sudo apt install caddy', { stdio: 'inherit' });

      console.log('✅ Caddy 安装完成');
    } catch (error) {
      throw new Error(`Caddy 安装失败: ${error.message}`);
    }
  }

  /**
   * 安装Nginx
   */
  async installNginx() {
    try {
      console.log('🔄 正在安装 Nginx...');

      execSync('sudo apt update', { stdio: 'inherit' });
      execSync('sudo apt install -y nginx', { stdio: 'inherit' });

      console.log('✅ Nginx 安装完成');
    } catch (error) {
      throw new Error(`Nginx 安装失败: ${error.message}`);
    }
  }

  /**
   * 生成配置文件
   */
  async generateConfig(domain, proxyTool) {
    if (proxyTool === 'caddy') {
      await this.generateCaddyConfig(domain);
    } else if (proxyTool === 'nginx') {
      await this.generateNginxConfig(domain);
    }
  }

  /**
   * 生成Caddy配置
   */
  async generateCaddyConfig(domain) {
    const config = `# Claude Relay Service - ${domain}
${domain} {
    reverse_proxy 127.0.0.1:3000

    # 文件上传大小限制
    request_body {
        max_size 10MB
    }

    # 安全头
    header {
        X-Content-Type-Options nosniff
        X-Frame-Options DENY
        X-XSS-Protection "1; mode=block"
        Referrer-Policy strict-origin-when-cross-origin
    }

    # 健康检查端点不记录日志
    @health path /health
    handle @health {
        reverse_proxy 127.0.0.1:3000
        log {
            output discard
        }
    }
}`;

    try {
      execSync(`sudo tee /etc/caddy/Caddyfile > /dev/null`, {
        input: config,
        stdio: ['pipe', 'pipe', 'inherit']
      });
      console.log('✅ Caddy 配置文件已生成');

      // 验证配置语法
      await this.validateCaddyConfig();
    } catch (error) {
      throw new Error(`写入Caddy配置文件失败: ${error.message}`);
    }
  }

  /**
   * 验证Caddy配置语法
   */
  async validateCaddyConfig() {
    try {
      execSync('sudo caddy validate --config /etc/caddy/Caddyfile', {
        stdio: 'pipe'
      });
      console.log('✅ Caddy 配置语法验证通过');
    } catch (error) {
      console.error('❌ Caddy 配置语法错误:');
      console.error(error.stdout ? error.stdout.toString() : error.message);
      throw new Error(`Caddy配置语法验证失败: ${error.message}`);
    }
  }

  /**
   * 生成Nginx配置
   */
  async generateNginxConfig(domain) {
    const config = `# Claude Relay Service - ${domain}
server {
    listen 80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ${domain};

    # SSL证书路径（Let's Encrypt自动配置）
    ssl_certificate /etc/letsencrypt/live/${domain}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${domain}/privkey.pem;

    # SSL安全配置
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;

    # 安全头
    add_header X-Frame-Options DENY;
    add_header X-Content-Type-Options nosniff;
    add_header X-XSS-Protection "1; mode=block";
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

    # 文件上传大小限制
    client_max_body_size 10M;

    # 反向代理配置
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host;

        # WebSocket和流式响应支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;

        # 超时设置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 静态文件缓存
    location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        proxy_pass http://127.0.0.1:3000;
        expires 1y;
        add_header Cache-Control "public, immutable";
        proxy_set_header Host $host;
    }

    # 健康检查端点
    location = /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }

    # 访问日志
    access_log /var/log/nginx/${domain}.access.log;
    error_log /var/log/nginx/${domain}.error.log;
}`;

    const configPath = `/etc/nginx/sites-available/${domain}`;
    const enabledPath = `/etc/nginx/sites-enabled/${domain}`;

    try {
      execSync(`sudo tee ${configPath} > /dev/null`, {
        input: config,
        stdio: ['pipe', 'pipe', 'inherit']
      });
    } catch (error) {
      throw new Error(`写入Nginx配置文件失败: ${error.message}`);
    }

    // 创建软链接启用站点
    try {
      if (fs.existsSync(enabledPath)) {
        execSync(`sudo rm -f ${enabledPath}`, { stdio: 'inherit' });
      }
      execSync(`sudo ln -sf ${configPath} ${enabledPath}`, { stdio: 'inherit' });
      console.log('✅ Nginx 配置文件已生成');
    } catch (error) {
      throw new Error(`创建Nginx站点软链接失败: ${error.message}`);
    }
  }

  /**
   * 设置SSL证书
   */
  async setupSSL(domain, proxyTool) {
    if (proxyTool === 'caddy') {
      console.log('✅ Caddy 将自动申请和管理 SSL 证书');
      return;
    }

    if (proxyTool === 'nginx') {
      await this.setupNginxSSL(domain);
    }
  }

  /**
   * 为Nginx设置SSL证书
   */
  async setupNginxSSL(domain) {
    try {
      // 检查certbot是否安装
      try {
        execSync('certbot --version', { stdio: 'ignore' });
      } catch (error) {
        console.log('📦 正在安装 certbot...');
        execSync('sudo apt update', { stdio: 'inherit' });
        execSync('sudo apt install -y certbot python3-certbot-nginx', { stdio: 'inherit' });
      }

      console.log('🔒 正在申请 SSL 证书...');
      console.log('⚠️  注意: 请确保域名已正确解析到此服务器IP');

      // 申请证书
      execSync(`sudo certbot --nginx -d ${domain} --non-interactive --agree-tos --email webmaster@${domain}`, { stdio: 'inherit' });

      console.log('✅ SSL 证书申请成功');

      // 设置自动续期
      try {
        execSync('sudo crontab -l | grep -q certbot || (sudo crontab -l 2>/dev/null; echo "0 12 * * * /usr/bin/certbot renew --quiet") | sudo crontab -', { stdio: 'ignore' });
        console.log('✅ SSL 证书自动续期已配置');
      } catch (error) {
        console.log('⚠️  SSL 证书自动续期配置失败，请手动设置');
      }

    } catch (error) {
      console.warn('⚠️  SSL 证书申请失败，将使用HTTP模式');
      console.warn('  请确保域名已正确解析到此服务器IP后重新运行');

      // 生成仅HTTP的配置
      await this.generateHttpOnlyNginxConfig(domain);
    }
  }

  /**
   * 生成仅HTTP的Nginx配置
   */
  async generateHttpOnlyNginxConfig(domain) {
    const config = `# Claude Relay Service - ${domain} (HTTP Only)
server {
    listen 80;
    server_name ${domain};

    # 反向代理配置
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket和流式响应支持
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
        proxy_cache off;
    }

    # 文件上传大小限制
    client_max_body_size 10M;

    # 健康检查端点
    location = /health {
        proxy_pass http://127.0.0.1:3000;
        access_log off;
    }
}`;

    const configPath = `/etc/nginx/sites-available/${domain}`;
    fs.writeFileSync(configPath, config);
    console.log('✅ HTTP-only Nginx 配置已生成');
  }

  /**
   * 重启代理服务
   */
  async restartProxy(proxyTool) {
    try {
      if (proxyTool === 'caddy') {
        execSync('sudo systemctl enable caddy', { stdio: 'inherit' });
        console.log('🔄 重新加载Caddy配置...');
        execSync('sudo systemctl reload caddy', { stdio: 'inherit' });

        // 验证服务状态
        await this.verifyCaddyStatus();
      } else if (proxyTool === 'nginx') {
        // 测试配置
        execSync('sudo nginx -t', { stdio: 'inherit' });
        execSync('sudo systemctl enable nginx', { stdio: 'inherit' });
        execSync('sudo systemctl restart nginx', { stdio: 'inherit' });
      }
      console.log(`✅ ${proxyTool.toUpperCase()} 服务已重启`);
    } catch (error) {
      throw new Error(`重启 ${proxyTool} 失败: ${error.message}`);
    }
  }

  /**
   * 验证Caddy服务状态
   */
  async verifyCaddyStatus() {
    try {
      const status = execSync('sudo systemctl is-active caddy', { encoding: 'utf8' }).trim();
      if (status === 'active') {
        console.log('✅ Caddy 服务运行正常');
      } else {
        throw new Error(`Caddy服务状态异常: ${status}`);
      }
    } catch (error) {
      console.error('❌ Caddy 服务状态检查失败');
      console.error('💡 请检查日志: sudo journalctl -xeu caddy.service');
      throw new Error(`Caddy服务验证失败: ${error.message}`);
    }
  }

  /**
   * 验证配置
   */
  async verifySetup(domain) {
    console.log('🔍 验证本地服务...');

    // 检查本地3000端口
    try {
      execSync('curl -s http://127.0.0.1:3000/health', { stdio: 'ignore' });
      console.log('✅ 本地服务正常运行');
    } catch (error) {
      console.warn('⚠️  本地服务可能未启动，请确保 Claude Relay Service 正在运行');
    }

    console.log('🔍 验证代理配置...');

    // 检查域名访问
    try {
      execSync(`curl -s -I http://${domain}`, { stdio: 'ignore' });
      console.log('✅ 域名代理配置正常');
    } catch (error) {
      console.warn('⚠️  域名访问验证失败，请检查DNS解析');
    }
  }

  /**
   * 查看代理状态
   */
  async showProxyStatus() {
    console.log('\n📊 代理服务状态');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    // 检查Caddy状态
    if (await this.isCaddyInstalled()) {
      try {
        const status = execSync('sudo systemctl is-active caddy', { encoding: 'utf8' }).trim();
        console.log(`📦 Caddy: ${status === 'active' ? '✅ 运行中' : '❌ 未运行'}`);

        if (status === 'active') {
          try {
            const config = fs.readFileSync('/etc/caddy/Caddyfile', 'utf8');
            const domains = config.match(/^[a-zA-Z0-9.-]+\s*{/gm);
            if (domains) {
              console.log('   配置的域名:');
              domains.forEach(domain => {
                const domainName = domain.replace(/\s*{/, '').trim();
                console.log(`     - ${domainName}`);
              });
            }
          } catch (error) {
            console.log('   ⚠️  无法读取配置文件');
          }
        }
      } catch (error) {
        console.log('📦 Caddy: ❌ 状态未知');
      }
    }

    // 检查Nginx状态
    if (await this.isNginxInstalled()) {
      try {
        const status = execSync('sudo systemctl is-active nginx', { encoding: 'utf8' }).trim();
        console.log(`📦 Nginx: ${status === 'active' ? '✅ 运行中' : '❌ 未运行'}`);

        if (status === 'active') {
          try {
            const sites = fs.readdirSync('/etc/nginx/sites-enabled');
            if (sites.length > 0) {
              console.log('   配置的站点:');
              sites.forEach(site => {
                if (site !== 'default') {
                  console.log(`     - ${site}`);
                }
              });
            }
          } catch (error) {
            console.log('   ⚠️  无法读取站点配置');
          }
        }
      } catch (error) {
        console.log('📦 Nginx: ❌ 状态未知');
      }
    }

    // 检查本地服务
    try {
      execSync('curl -s http://127.0.0.1:3000/health', { stdio: 'ignore' });
      console.log('🚀 Claude Relay Service: ✅ 运行中 (端口 3000)');
    } catch (error) {
      console.log('🚀 Claude Relay Service: ❌ 未运行');
    }
  }

  /**
   * 移除代理配置
   */
  async removeProxyConfig() {
    // 确保输入流处于正确状态
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(false);
    }

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false,  // 禁用终端模式避免双字符
      crlfDelay: Infinity
    });

    return new Promise((resolve) => {
      rl.question('请输入要移除的域名: ', async (domain) => {
        rl.close();
        // 清理输入流
        process.stdin.removeAllListeners();

        if (!domain.trim()) {
          console.log('❌ 域名不能为空');
          resolve();
          return;
        }

        try {
          console.log(`🗑️  正在移除域名 ${domain} 的代理配置...`);

          // 移除Caddy配置
          if (await this.isCaddyInstalled()) {
            await this.removeCaddyConfig(domain);
          }

          // 移除Nginx配置
          if (await this.isNginxInstalled()) {
            await this.removeNginxConfig(domain);
          }

          console.log('✅ 代理配置已移除');
        } catch (error) {
          console.error('❌ 移除配置失败:', error.message);
        }

        resolve();
      });
    });
  }

  /**
   * 移除Caddy配置
   */
  async removeCaddyConfig(domain) {
    try {
      const configPath = '/etc/caddy/Caddyfile';
      if (fs.existsSync(configPath)) {
        let config = fs.readFileSync(configPath, 'utf8');

        // 移除指定域名的配置块
        const domainRegex = new RegExp(`${domain}\\s*{[^}]*}`, 'g');
        config = config.replace(domainRegex, '').trim();

        fs.writeFileSync(configPath, config);

        // 重启Caddy
        execSync('sudo systemctl reload caddy', { stdio: 'inherit' });

        console.log(`✅ 已从 Caddy 中移除 ${domain}`);
      }
    } catch (error) {
      throw new Error(`移除 Caddy 配置失败: ${error.message}`);
    }
  }

  /**
   * 移除Nginx配置
   */
  async removeNginxConfig(domain) {
    try {
      const availablePath = `/etc/nginx/sites-available/${domain}`;
      const enabledPath = `/etc/nginx/sites-enabled/${domain}`;

      // 移除配置文件
      if (fs.existsSync(enabledPath)) {
        fs.unlinkSync(enabledPath);
      }
      if (fs.existsSync(availablePath)) {
        fs.unlinkSync(availablePath);
      }

      // 重启Nginx
      execSync('sudo nginx -t && sudo systemctl reload nginx', { stdio: 'inherit' });

      console.log(`✅ 已从 Nginx 中移除 ${domain}`);
    } catch (error) {
      throw new Error(`移除 Nginx 配置失败: ${error.message}`);
    }
  }
}

module.exports = { ProxyManager };