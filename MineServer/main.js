const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const { spawn, execSync } = require('child_process');
const https = require('https');
const extract = require('extract-zip');
const os = require('os');

let mainWindow;
let serverProcess = null;
let serverStatus = 'stopped';

const SERVER_DIR = path.join(app.getPath('userData'), 'bedrock-server');
const CONFIG_FILE = path.join(app.getPath('userData'), 'server-config.json');

// ---------- process-tree helpers ----------
// Kill bedrock_server.exe and every child it spawned (works on Windows).
function killTree(proc) {
  if (!proc || !proc.pid) return;
  try {
    // taskkill /T kills the whole tree rooted at the PID
    execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // Process may already be gone – that's fine
  }
  proc = null;
}

// Check whether bedrock_server.exe is already running (left over from a previous
// session that didn't shut down cleanly).  Returns the PID if found, or null.
function findLeftoverServerPid() {
  try {
    // tasklist /FO CSV gives every running process as a CSV row
    const output = execSync('tasklist /FO CSV /NH', { encoding: 'utf-8' });
    for (const line of output.split('\n')) {
      if (line.toLowerCase().includes('bedrock_server.exe')) {
        // CSV columns: "Name","PID","Session Name","Session#","Mem Usage"
        const cols = line.match(/"([^"]+)"/g);
        if (cols && cols.length >= 2) {
          return parseInt(cols[1].replace(/"/g, ''), 10);
        }
      }
    }
  } catch {
    // tasklist failed – treat as not running
  }
  return null;
}

// Kill a leftover bedrock_server.exe by its PID (no child-process handle needed).
function killLeftoverByPid(pid) {
  if (!pid) return;
  try {
    execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
  } catch {
    // Already gone
  }
}

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
  // Kill the server AND every child process it owns before the app exits.
  // This is the only reliable way to stop bedrock_server.exe on Windows when
  // shell:true was used or when the process tree is deeper than one level.
  killTree(serverProcess);
  serverProcess = null;
  serverStatus = 'stopped';

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
  // --- 1. Kill any leftover bedrock_server.exe from a previous session ----
  const leftoverPid = findLeftoverServerPid();
  if (leftoverPid) {
    killLeftoverByPid(leftoverPid);
    // Give Windows a moment to release the port after the kill
    await new Promise(r => setTimeout(r, 1500));
  }

  // --- 2. If our handle is still alive somehow, kill that too -------------
  if (serverProcess) {
    killTree(serverProcess);
    serverProcess = null;
    await new Promise(r => setTimeout(r, 1000));
  }

  try {
    const serverExePath = path.join(SERVER_DIR, 'bedrock_server.exe');

    // spawn WITHOUT shell:true so the PID points directly at bedrock_server.exe.
    // taskkill /T can then reliably kill the whole tree.
    serverProcess = spawn(serverExePath, [], {
      cwd: SERVER_DIR,
      stdio: ['pipe', 'pipe', 'pipe']   // stdin / stdout / stderr all piped
    });

    serverStatus = 'running';

    serverProcess.stdout.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-log', data.toString());
      }
    });

    serverProcess.stderr.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-log', `ERROR: ${data.toString()}`);
      }
    });

    serverProcess.on('close', (code) => {
      serverProcess = null;
      serverStatus = 'stopped';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status', 'stopped');
        mainWindow.webContents.send('server-log', `Server stopped with exit code ${code}`);
      }
    });

    serverProcess.on('error', (err) => {
      serverProcess = null;
      serverStatus = 'stopped';
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('server-status', 'stopped');
        mainWindow.webContents.send('server-log', `ERROR launching server: ${err.message}`);
      }
    });

    event.sender.send('server-status', 'running');
    return { success: true };
  } catch (error) {
    serverProcess = null;
    serverStatus = 'stopped';
    return { success: false, error: error.message };
  }
});

ipcMain.handle('stop-server', async (event) => {
  if (!serverProcess) {
    // Maybe it's a leftover from a previous session – try to kill it anyway
    const leftoverPid = findLeftoverServerPid();
    if (leftoverPid) {
      killLeftoverByPid(leftoverPid);
      serverStatus = 'stopped';
      event.sender.send('server-status', 'stopped');
      return { success: true };
    }
    return { success: false, error: 'Server is not running' };
  }

  try {
    // 1. Try the graceful way first: send "stop" via stdin
    serverProcess.stdin.write('stop\n');

    // 2. If the process is still alive after 3 seconds, force-kill the whole tree
    setTimeout(() => {
      if (serverProcess) {
        killTree(serverProcess);
        serverProcess = null;
        serverStatus = 'stopped';
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('server-status', 'stopped');
          mainWindow.webContents.send('server-log', 'Server force-stopped after timeout');
        }
      }
    }, 3000);

    return { success: true };
  } catch (error) {
    // stdin.write threw (pipe already closed) – just kill it
    killTree(serverProcess);
    serverProcess = null;
    serverStatus = 'stopped';
    event.sender.send('server-status', 'stopped');
    return { success: true };
  }
});

ipcMain.handle('get-server-status', async () => {
  // If we already have a live handle, trust it
  if (serverProcess) {
    serverStatus = 'running';
    return 'running';
  }

  // Otherwise scan the OS process list for a leftover bedrock_server.exe.
  // This catches the case where the app was closed without properly stopping
  // the server, or was force-closed / crashed.
  const leftoverPid = findLeftoverServerPid();
  if (leftoverPid) {
    // A bedrock_server.exe is running but we have no handle to it.
    // Kill it so the user can start fresh cleanly.
    killLeftoverByPid(leftoverPid);
    // Give Windows a moment to release the port
    await new Promise(r => setTimeout(r, 1500));
  }

  serverStatus = 'stopped';
  return 'stopped';
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
  let stdout = '';
  try {
    stdout = execSync('netsh interface show interface', { encoding: 'utf-8' });
  } catch {
    return { type: 'unknown', isHotspot: false };
  }

  const isMobileHotspot = stdout.toLowerCase().includes('mobile') ||
                          stdout.toLowerCase().includes('hotspot') ||
                          stdout.toLowerCase().includes('phone');

  const interfaces = os.networkInterfaces();
  let hasEthernet = false;
  let hasWiFi = false;

  for (let name in interfaces) {
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

  return {
    type,
    isHotspot: isMobileHotspot,
    warning: isMobileHotspot ? 'Mobile hotspot detected - server will only be accessible on local network' : null
  };
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