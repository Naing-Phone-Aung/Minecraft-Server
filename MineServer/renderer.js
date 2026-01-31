// State management
let serverStatus = 'stopped';
let currentConfig = {};
let serverInstalled = false;

// DOM Elements
const setupScreen = document.getElementById('setupScreen');
const mainScreen = document.getElementById('mainScreen');
const downloadBtn = document.getElementById('downloadBtn');
const downloadProgress = document.getElementById('downloadProgress');
const progressBar = document.getElementById('progressBar');
const downloadStatus = document.getElementById('downloadStatus');

// Tab elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');

// Server control buttons
const startServerBtn = document.getElementById('startServerBtn');
const stopServerBtn = document.getElementById('stopServerBtn');
const restartServerBtn = document.getElementById('restartServerBtn');
const openFolderBtn = document.getElementById('openFolderBtn');

// Settings inputs
const settingsInputs = {
  serverName: document.getElementById('serverName'),
  gamemode: document.getElementById('gamemode'),
  difficulty: document.getElementById('difficulty'),
  maxPlayers: document.getElementById('maxPlayers'),
  serverPortInput: document.getElementById('serverPortInput'),
  levelName: document.getElementById('levelName'),
  levelSeed: document.getElementById('levelSeed'),
  viewDistance: document.getElementById('viewDistance'),
  tickDistance: document.getElementById('tickDistance'),
  playerIdleTimeout: document.getElementById('playerIdleTimeout'),
  maxThreads: document.getElementById('maxThreads'),
  defaultPlayerPermissionLevel: document.getElementById('defaultPlayerPermissionLevel'),
  enableWhitelist: document.getElementById('enableWhitelist'),
  allowCheats: document.getElementById('allowCheats'),
  texturepackRequired: document.getElementById('texturepackRequired'),
  contentLogFileEnabled: document.getElementById('contentLogFileEnabled'),
  correctPlayerMovement: document.getElementById('correctPlayerMovement'),
  serverAuthoritativeBlockBreaking: document.getElementById('serverAuthoritativeBlockBreaking')
};

const saveSettingsBtn = document.getElementById('saveSettingsBtn');

// Console elements
const consoleOutput = document.getElementById('consoleOutput');
const consoleInput = document.getElementById('consoleInput');
const sendCommandBtn = document.getElementById('sendCommandBtn');
const clearConsoleBtn = document.getElementById('clearConsoleBtn');

// Quick action buttons
const quickActionBtns = document.querySelectorAll('.quick-action-btn');

// Toast
const toast = document.getElementById('toast');
const toastIcon = document.getElementById('toastIcon');
const toastTitle = document.getElementById('toastTitle');
const toastMessage = document.getElementById('toastMessage');
const toastClose = document.getElementById('toastClose');

// Initialize app
async function init() {
  serverInstalled = await window.electronAPI.checkServerInstalled();
  
  if (serverInstalled) {
    await loadConfig();
    await checkNetwork();
    await updateIPAddresses();
    mainScreen.classList.remove('hidden');
  } else {
    setupScreen.classList.remove('hidden');
  }
  
  // Check server status
  serverStatus = await window.electronAPI.getServerStatus();
  updateServerStatus(serverStatus);
  
  // Setup event listeners
  setupEventListeners();
}

// Setup all event listeners
function setupEventListeners() {
  // Download server
  downloadBtn.addEventListener('click', downloadServer);
  
  // Tab switching
  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  
  // Server control
  startServerBtn.addEventListener('click', startServer);
  stopServerBtn.addEventListener('click', stopServer);
  restartServerBtn.addEventListener('click', restartServer);
  openFolderBtn.addEventListener('click', () => window.electronAPI.openServerFolder());
  
  // Settings
  saveSettingsBtn.addEventListener('click', saveSettings);
  
  // Console
  sendCommandBtn.addEventListener('click', sendCommand);
  consoleInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendCommand();
  });
  clearConsoleBtn.addEventListener('click', clearConsole);
  
  // Quick actions
  quickActionBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const command = btn.dataset.command;
      if (serverStatus === 'running') {
        window.electronAPI.sendCommand(command);
        showToast('success', 'Command Sent', `Executed: ${command}`);
      } else {
        showToast('error', 'Server Offline', 'Start the server first');
      }
    });
  });
  
  // Toast close
  toastClose.addEventListener('click', hideToast);
  
  // Listen to download progress
  window.electronAPI.onDownloadProgress((data) => {
    updateDownloadProgress(data);
  });
  
  // Listen to server logs
  window.electronAPI.onServerLog((log) => {
    addConsoleLog(log);
  });
  
  // Listen to server status changes
  window.electronAPI.onServerStatus((status) => {
    updateServerStatus(status);
  });
}

// Download server
async function downloadServer() {
  downloadBtn.disabled = true;
  downloadProgress.classList.remove('hidden');
  
  const result = await window.electronAPI.downloadServer();
  
  if (result.success) {
    showToast('success', 'Download Complete', 'Server installed successfully!');
    setTimeout(() => {
      location.reload();
    }, 2000);
  } else {
    showToast('error', 'Download Failed', result.error);
    downloadBtn.disabled = false;
    downloadProgress.classList.add('hidden');
  }
}

// Update download progress
function updateDownloadProgress(data) {
  progressBar.style.width = `${data.progress}%`;
  
  if (data.status === 'downloading') {
    downloadStatus.textContent = `Downloading... ${data.progress}%`;
  } else if (data.status === 'extracting') {
    downloadStatus.textContent = 'Extracting files...';
  } else if (data.status === 'complete') {
    downloadStatus.textContent = 'Installation complete!';
  }
}

// Switch tabs
function switchTab(tabName) {
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('tab-active');
    } else {
      tab.classList.remove('tab-active');
    }
  });
  
  tabContents.forEach(content => {
    content.classList.add('hidden');
  });
  
  document.getElementById(`${tabName}Tab`).classList.remove('hidden');
}

// Load configuration
async function loadConfig() {
  currentConfig = await window.electronAPI.getConfig();
  
  // Populate form
  settingsInputs.serverName.value = currentConfig.serverName || '';
  settingsInputs.gamemode.value = currentConfig.gamemode || 'survival';
  settingsInputs.difficulty.value = currentConfig.difficulty || 'easy';
  settingsInputs.maxPlayers.value = currentConfig.maxPlayers || 10;
  settingsInputs.serverPortInput.value = currentConfig.serverPort || 19132;
  settingsInputs.levelName.value = currentConfig.levelName || '';
  settingsInputs.levelSeed.value = currentConfig.levelSeed || '';
  settingsInputs.viewDistance.value = currentConfig.viewDistance || 32;
  settingsInputs.tickDistance.value = currentConfig.tickDistance || 4;
  settingsInputs.playerIdleTimeout.value = currentConfig.playerIdleTimeout || 30;
  settingsInputs.maxThreads.value = currentConfig.maxThreads || 8;
  settingsInputs.defaultPlayerPermissionLevel.value = currentConfig.defaultPlayerPermissionLevel || 'member';
  settingsInputs.enableWhitelist.checked = currentConfig.enableWhitelist || false;
  settingsInputs.allowCheats.checked = currentConfig.allowCheats || false;
  settingsInputs.texturepackRequired.checked = currentConfig.texturepackRequired || false;
  settingsInputs.contentLogFileEnabled.checked = currentConfig.contentLogFileEnabled || false;
  settingsInputs.correctPlayerMovement.checked = currentConfig.correctPlayerMovement || false;
  settingsInputs.serverAuthoritativeBlockBreaking.checked = currentConfig.serverAuthoritativeBlockBreaking || false;
  
  // Update server port display
  document.getElementById('serverPort').textContent = currentConfig.serverPort || 19132;
}

// Save settings
async function saveSettings() {
  const config = {
    serverName: settingsInputs.serverName.value,
    gamemode: settingsInputs.gamemode.value,
    difficulty: settingsInputs.difficulty.value,
    maxPlayers: parseInt(settingsInputs.maxPlayers.value),
    serverPort: parseInt(settingsInputs.serverPortInput.value),
    serverPortV6: parseInt(settingsInputs.serverPortInput.value) + 1,
    levelName: settingsInputs.levelName.value,
    levelSeed: settingsInputs.levelSeed.value,
    viewDistance: parseInt(settingsInputs.viewDistance.value),
    tickDistance: parseInt(settingsInputs.tickDistance.value),
    playerIdleTimeout: parseInt(settingsInputs.playerIdleTimeout.value),
    maxThreads: parseInt(settingsInputs.maxThreads.value),
    defaultPlayerPermissionLevel: settingsInputs.defaultPlayerPermissionLevel.value,
    enableWhitelist: settingsInputs.enableWhitelist.checked,
    allowCheats: settingsInputs.allowCheats.checked,
    texturepackRequired: settingsInputs.texturepackRequired.checked,
    contentLogFileEnabled: settingsInputs.contentLogFileEnabled.checked,
    correctPlayerMovement: settingsInputs.correctPlayerMovement.checked,
    serverAuthoritativeBlockBreaking: settingsInputs.serverAuthoritativeBlockBreaking.checked,
    compressionThreshold: currentConfig.compressionThreshold || 1,
    serverAuthoritativeMovement: currentConfig.serverAuthoritativeMovement || 'server-auth',
    playerMovementScoreThreshold: currentConfig.playerMovementScoreThreshold || 20,
    playerMovementDistanceThreshold: currentConfig.playerMovementDistanceThreshold || 0.3,
    playerMovementDurationThresholdInMs: currentConfig.playerMovementDurationThresholdInMs || 500
  };
  
  const result = await window.electronAPI.saveConfig(config);
  
  if (result.success) {
    currentConfig = config;
    document.getElementById('serverPort').textContent = config.serverPort;
    showToast('success', 'Settings Saved', 'Configuration updated successfully!');
  } else {
    showToast('error', 'Save Failed', result.error);
  }
}

// Start server
async function startServer() {
  const result = await window.electronAPI.startServer();
  
  if (result.success) {
    showToast('success', 'Server Starting', 'Bedrock server is starting...');
  } else {
    showToast('error', 'Start Failed', result.error);
  }
}

// Stop server
async function stopServer() {
  const result = await window.electronAPI.stopServer();
  
  if (result.success) {
    showToast('info', 'Server Stopping', 'Shutting down server...');
  } else {
    showToast('error', 'Stop Failed', result.error);
  }
}

// Restart server
async function restartServer() {
  await stopServer();
  setTimeout(async () => {
    await startServer();
  }, 3000);
}

// Update server status
function updateServerStatus(status) {
  serverStatus = status;
  const statusText = document.getElementById('statusText');
  const statusIndicator = document.getElementById('statusIndicator');
  const serverStatusBadge = document.getElementById('serverStatusBadge');
  
  if (status === 'running') {
    statusText.textContent = 'Running';
    statusIndicator.className = 'w-3 h-3 bg-green-500 rounded-full animate-pulse';
    serverStatusBadge.innerHTML = `
      <span class="badge badge-success">
        <span class="w-2 h-2 bg-green-400 rounded-full mr-2 animate-pulse"></span>
        Online
      </span>
    `;
    
    startServerBtn.disabled = true;
    stopServerBtn.disabled = false;
    restartServerBtn.disabled = false;
    consoleInput.disabled = false;
    sendCommandBtn.disabled = false;
  } else {
    statusText.textContent = 'Stopped';
    statusIndicator.className = 'w-3 h-3 bg-red-500 rounded-full animate-pulse';
    serverStatusBadge.innerHTML = `
      <span class="badge badge-danger">
        <span class="w-2 h-2 bg-red-400 rounded-full mr-2 animate-pulse"></span>
        Offline
      </span>
    `;
    
    startServerBtn.disabled = false;
    stopServerBtn.disabled = true;
    restartServerBtn.disabled = true;
    consoleInput.disabled = true;
    sendCommandBtn.disabled = true;
  }
}

// Console functions
function addConsoleLog(log) {
  const timestamp = new Date().toLocaleTimeString();
  const logLine = document.createElement('div');
  logLine.className = 'mb-1';
  
  // Color code different log types
  let color = 'text-gray-300';
  if (log.includes('ERROR')) color = 'text-red-400';
  else if (log.includes('WARN')) color = 'text-yellow-400';
  else if (log.includes('INFO')) color = 'text-blue-400';
  
  logLine.innerHTML = `<span class="text-gray-500">[${timestamp}]</span> <span class="${color}">${escapeHtml(log)}</span>`;
  
  // Replace initial content if it's the placeholder
  if (consoleOutput.querySelector('.text-gray-400')) {
    consoleOutput.innerHTML = '';
  }
  
  consoleOutput.appendChild(logLine);
  consoleOutput.scrollTop = consoleOutput.scrollHeight;
}

function sendCommand() {
  const command = consoleInput.value.trim();
  if (!command) return;
  
  window.electronAPI.sendCommand(command);
  addConsoleLog(`> ${command}`);
  consoleInput.value = '';
}

function clearConsole() {
  consoleOutput.innerHTML = '<div class="text-gray-400 text-sm">Console cleared.</div>';
}

// Network check
async function checkNetwork() {
  const networkInfo = await window.electronAPI.checkNetwork();
  const networkWarning = document.getElementById('networkWarning');
  const networkStatus = document.getElementById('networkStatus');
  
  if (networkInfo.isHotspot) {
    networkWarning.classList.remove('hidden');
    networkStatus.innerHTML = `
      <span class="badge badge-warning">
        <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        Hotspot
      </span>
    `;
    networkStatus.classList.remove('hidden');
  } else {
    networkWarning.classList.add('hidden');
    
    if (networkInfo.type === 'ethernet') {
      networkStatus.innerHTML = `
        <span class="badge badge-success">
          <svg class="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"/>
          </svg>
          Ethernet
        </span>
      `;
      networkStatus.classList.remove('hidden');
    } else if (networkInfo.type === 'wifi') {
      networkStatus.innerHTML = `
        <span class="badge badge-info">
          <svg class="w-4 h-4 inline-block mr-1" fill="currentColor" viewBox="0 0 20 20">
            <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z"/>
          </svg>
          WiFi
        </span>
      `;
      networkStatus.classList.remove('hidden');
    }
  }
}

// Update IP addresses
async function updateIPAddresses() {
  const addresses = await window.electronAPI.getLocalIP();
  const ipAddressList = document.getElementById('ipAddressList');
  
  if (addresses.length > 0) {
    ipAddressList.innerHTML = addresses.map(addr => `
      <div class="flex items-center justify-between p-2 bg-gray-700/50 rounded">
        <div>
          <span class="text-sm font-mono">${addr.address}</span>
          <span class="text-xs text-gray-400 ml-2">(${addr.name})</span>
        </div>
        <button class="text-green-400 hover:text-green-300 transition-colors" onclick="copyToClipboard('${addr.address}')">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </button>
      </div>
    `).join('');
  } else {
    ipAddressList.innerHTML = `
      <div class="flex items-center justify-between p-2 bg-gray-700/50 rounded">
        <span class="text-sm text-gray-400">No network interfaces found</span>
      </div>
    `;
  }
}

// Copy to clipboard
function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('success', 'Copied!', `IP address copied: ${text}`);
  });
}

// Toast notifications
function showToast(type, title, message) {
  const icons = {
    success: `<svg class="w-6 h-6 text-green-400" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
    </svg>`,
    error: `<svg class="w-6 h-6 text-red-400" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
    </svg>`,
    info: `<svg class="w-6 h-6 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
    </svg>`,
    warning: `<svg class="w-6 h-6 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
      <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
    </svg>`
  };
  
  toastIcon.innerHTML = icons[type] || icons.info;
  toastTitle.textContent = title;
  toastMessage.textContent = message;
  
  toast.style.transform = 'translateY(0)';
  
  setTimeout(hideToast, 5000);
}

function hideToast() {
  toast.style.transform = 'translateY(8rem)';
}

// Utility function to escape HTML
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Initialize when DOM is ready
init();