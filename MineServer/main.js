const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn, exec } = require('child_process');
const https = require('https');
const extract = require('extract-zip');
const os = require('os');

let mainWindow;
let serverProcess = null;
let serverStatus = 'stopped';

const SERVER_DIR = path.join(app.getPath('userData'), 'bedrock-server');
const CONFIG_FILE = path.join(app.getPath('userData'), 'server-config.json');

// Default configuration
const defaultConfig = {
  serverName: 'Bedrock Server',
  gamemode: 'survival',
  difficulty: 'easy',
  maxPlayers: 10,
  serverPort: 19132,
  serverPortV6: 19133,
  enableWhitelist: false,
  allowCheats: false,
  viewDistance: 32,
  tickDistance: 4,
  playerIdleTimeout: 30,
  maxThreads: 8,
  levelName: 'Bedrock level',
  levelSeed: '',
  defaultPlayerPermissionLevel: 'member',
  texturepackRequired: false,
  contentLogFileEnabled: false,
  compressionThreshold: 1,
  serverAuthoritativeMovement: 'server-auth',
  playerMovementScoreThreshold: 20,
  playerMovementDistanceThreshold: 0.3,
  playerMovementDurationThresholdInMs: 500,
  correctPlayerMovement: false,
  serverAuthoritativeBlockBreaking: false
};

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    backgroundColor: '#1a1a1a'
  });

  mainWindow.loadFile('index.html');
  
  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  createWindow();
  
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (serverProcess) {
    serverProcess.kill();
  }
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers

ipcMain.handle('check-server-installed', async () => {
  try {
    const serverExePath = path.join(SERVER_DIR, 'bedrock_server.exe');
    await fs.access(serverExePath);
    return true;
  } catch {
    return false;
  }
});

ipcMain.handle('download-server', async (event) => {
  const serverUrl = 'https://www.minecraft.net/bedrockdedicatedserver/bin-win/bedrock-server-1.21.132.3.zip';
  const zipPath = path.join(app.getPath('temp'), 'bedrock-server.zip');
  
  try {
    // Create server directory if it doesn't exist
    await fs.mkdir(SERVER_DIR, { recursive: true });
    
    // Download server
    event.sender.send('download-progress', { status: 'downloading', progress: 0 });
    
    await new Promise((resolve, reject) => {
      const file = fsSync.createWriteStream(zipPath);
      https.get(serverUrl, (response) => {
        const totalSize = parseInt(response.headers['content-length'], 10);
        let downloaded = 0;
        
        response.on('data', (chunk) => {
          downloaded += chunk.length;
          const progress = Math.round((downloaded / totalSize) * 100);
          event.sender.send('download-progress', { status: 'downloading', progress });
        });
        
        response.pipe(file);
        
        file.on('finish', () => {
          file.close();
          resolve();
        });
      }).on('error', (err) => {
        fsSync.unlink(zipPath, () => {});
        reject(err);
      });
    });
    
    // Extract server
    event.sender.send('download-progress', { status: 'extracting', progress: 0 });
    await extract(zipPath, { dir: SERVER_DIR });
    
    // Clean up
    await fs.unlink(zipPath);
    
    event.sender.send('download-progress', { status: 'complete', progress: 100 });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-config', async () => {
  try {
    const configData = await fs.readFile(CONFIG_FILE, 'utf-8');
    return JSON.parse(configData);
  } catch {
    // Return default config if file doesn't exist
    await fs.writeFile(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
    return defaultConfig;
  }
});

ipcMain.handle('save-config', async (event, config) => {
  try {
    await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
    
    // Update server.properties file
    const propertiesPath = path.join(SERVER_DIR, 'server.properties');
    const properties = [
      `server-name=${config.serverName}`,
      `gamemode=${config.gamemode}`,
      `difficulty=${config.difficulty}`,
      `allow-cheats=${config.allowCheats}`,
      `max-players=${config.maxPlayers}`,
      `online-mode=true`,
      `white-list=${config.enableWhitelist}`,
      `server-port=${config.serverPort}`,
      `server-portv6=${config.serverPortV6}`,
      `view-distance=${config.viewDistance}`,
      `tick-distance=${config.tickDistance}`,
      `player-idle-timeout=${config.playerIdleTimeout}`,
      `max-threads=${config.maxThreads}`,
      `level-name=${config.levelName}`,
      `level-seed=${config.levelSeed}`,
      `default-player-permission-level=${config.defaultPlayerPermissionLevel}`,
      `texturepack-required=${config.texturepackRequired}`,
      `content-log-file-enabled=${config.contentLogFileEnabled}`,
      `compression-threshold=${config.compressionThreshold}`,
      `server-authoritative-movement=${config.serverAuthoritativeMovement}`,
      `player-movement-score-threshold=${config.playerMovementScoreThreshold}`,
      `player-movement-distance-threshold=${config.playerMovementDistanceThreshold}`,
      `player-movement-duration-threshold-in-ms=${config.playerMovementDurationThresholdInMs}`,
      `correct-player-movement=${config.correctPlayerMovement}`,
      `server-authoritative-block-breaking=${config.serverAuthoritativeBlockBreaking}`
    ].join('\n');
    
    await fs.writeFile(propertiesPath, properties);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('start-server', async (event) => {
  if (serverProcess) {
    return { success: false, error: 'Server is already running' };
  }
  
  try {
    const serverExePath = path.join(SERVER_DIR, 'bedrock_server.exe');
    
    serverProcess = spawn(serverExePath, [], {
      cwd: SERVER_DIR,
      shell: true
    });
    
    serverStatus = 'running';
    
    serverProcess.stdout.on('data', (data) => {
      event.sender.send('server-log', data.toString());
    });
    
    serverProcess.stderr.on('data', (data) => {
      event.sender.send('server-log', `ERROR: ${data.toString()}`);
    });
    
    serverProcess.on('close', (code) => {
      serverProcess = null;
      serverStatus = 'stopped';
      event.sender.send('server-status', 'stopped');
      event.sender.send('server-log', `Server stopped with code ${code}`);
    });
    
    event.sender.send('server-status', 'running');
    
    return { success: true };
  } catch (error) {
    serverStatus = 'stopped';
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-server', async (event) => {
  if (!serverProcess) {
    return { success: false, error: 'Server is not running' };
  }
  
  try {
    // Send stop command
    serverProcess.stdin.write('stop\n');
    
    // Force kill after 10 seconds if still running
    setTimeout(() => {
      if (serverProcess) {
        serverProcess.kill('SIGKILL');
      }
    }, 10000);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-server-status', async () => {
  return serverStatus;
});

ipcMain.handle('send-command', async (event, command) => {
  if (!serverProcess) {
    return { success: false, error: 'Server is not running' };
  }
  
  try {
    serverProcess.stdin.write(command + '\n');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('check-network', async () => {
  return new Promise((resolve) => {
    exec('netsh interface show interface', (error, stdout) => {
      if (error) {
        resolve({ type: 'unknown', isHotspot: false });
        return;
      }
      
      // Check for mobile hotspot indicators
      const isMobileHotspot = stdout.toLowerCase().includes('mobile') || 
                             stdout.toLowerCase().includes('hotspot') ||
                             stdout.toLowerCase().includes('phone');
      
      // Get network interfaces
      const interfaces = os.networkInterfaces();
      let hasEthernet = false;
      let hasWiFi = false;
      
      for (let name in interfaces) {
        const iface = interfaces[name];
        if (name.toLowerCase().includes('ethernet') || name.toLowerCase().includes('eth')) {
          hasEthernet = true;
        }
        if (name.toLowerCase().includes('wi-fi') || name.toLowerCase().includes('wireless')) {
          hasWiFi = true;
        }
      }
      
      let type = 'unknown';
      if (hasEthernet) type = 'ethernet';
      else if (hasWiFi) type = 'wifi';
      
      resolve({
        type: type,
        isHotspot: isMobileHotspot,
        warning: isMobileHotspot ? 'Mobile hotspot detected - server will only be accessible on local network' : null
      });
    });
  });
});

ipcMain.handle('get-local-ip', async () => {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  
  for (let name in interfaces) {
    for (let iface of interfaces[name]) {
      // Skip internal and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({
          name: name,
          address: iface.address
        });
      }
    }
  }
  
  return addresses;
});

ipcMain.handle('open-server-folder', async () => {
  const { shell } = require('electron');
  shell.openPath(SERVER_DIR);
});