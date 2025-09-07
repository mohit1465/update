const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Configure logging
log.transports.file.level = 'info';
log.info('App starting...');
log.info('App version:', app.getVersion());

// Configure auto-updater
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.allowDowngrade = false;

// Set update config path in development
if (process.env.NODE_ENV === 'development') {
  log.info('Running in development mode');
  autoUpdater.updateConfigPath = path.join(__dirname, 'dev-app-update.yml');
  autoUpdater.forceDevUpdateConfig = true;
}

autoUpdater.logger = log;

let mainWindow;

function createWindow() {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, 'assets/icon.png')
  });

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Open the DevTools in development mode
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Emitted when the window is closed.
  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();
  
  // Check for updates after a short delay to ensure the window is ready
  setTimeout(() => {
    console.log('Checking for updates...');
    autoUpdater.checkForUpdates()
      .then(result => {
        console.log('Update check result:', result);
        if (result && result.downloadPromise) {
          return result.downloadPromise;
        }
        return null;
      })
      .catch(err => {
        console.error('Error checking for updates:', err);
        if (mainWindow) {
          mainWindow.webContents.send('update-message', 'Error checking for updates: ' + (err.message || err));
        }
      });
  }, 1000);
});

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) createWindow();
});

// Auto-updater events
autoUpdater.on('checking-for-update', () => {
  log.info('Checking for update...');
  console.log('Checking for update...');
  if (mainWindow) {
    mainWindow.webContents.send('update-message', 'Checking for update...');
  }
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available:', info);
  console.log('Update available:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-message', `Update available: ${info.version}. Downloading...`);
  }
  // Auto download the update
  autoUpdater.downloadUpdate().catch(err => {
    const errorMsg = `Error downloading update: ${err.message || err}`;
    log.error(errorMsg);
    console.error(errorMsg);
    if (mainWindow) {
      mainWindow.webContents.send('update-message', errorMsg);
    }
  });
});

autoUpdater.on('update-not-available', (info) => {
  log.info('No update available.');
  if (mainWindow) {
    mainWindow.webContents.send('update-message', 'No update available.');
  }
});

autoUpdater.on('error', (err) => {
  const errorMsg = `Error in auto-updater: ${err.message || err}`;
  log.error(errorMsg);
  console.error(errorMsg);
  if (mainWindow) {
    mainWindow.webContents.send('update-message', errorMsg);
  }
  
  // Try to get more detailed error information
  if (err.stack) {
    console.error('Error stack:', err.stack);
  }
  
  // If it's a network error, provide more specific guidance
  if (err.message && (err.message.includes('net') || err.message.includes('network'))) {
    const networkErrorMsg = 'Network error occurred while checking for updates. Please check your internet connection.';
    console.error(networkErrorMsg);
    if (mainWindow) {
      mainWindow.webContents.send('update-message', networkErrorMsg);
    }
  }
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + Math.round(progressObj.bytesPerSecond / 1000) + ' KB/s';
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  log.info(log_message);
  if (mainWindow) {
    mainWindow.webContents.send('update-progress', progressObj.percent);
  }
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded:', info);
  if (mainWindow) {
    mainWindow.webContents.send('update-downloaded');
  }
  // Auto install the update
  setTimeout(() => {
    autoUpdater.quitAndInstall();
  }, 1000);
});

// IPC handlers for renderer process
ipcMain.on('check-for-update', (event) => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
