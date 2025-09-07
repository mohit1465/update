const { app, BrowserWindow, ipcMain } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const path = require('path');

// Configure logging
log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

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

  // Check for updates when the app is ready
  autoUpdater.checkForUpdatesAndNotify();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(createWindow);

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
  log.info('Checking for update...');  mainWindow.webContents.send('update-message', 'Checking for update...');
});

autoUpdater.on('update-available', (info) => {
  log.info('Update available.');  mainWindow.webContents.send('update-message', 'Update available. Downloading...');
});

autoUpdater.on('update-not-available', (info) => {
  log.info('No update available.');  mainWindow.webContents.send('update-message', 'No update available.');
});

autoUpdater.on('error', (err) => {
  log.error('Error in auto-updater: ' + err);  mainWindow.webContents.send('update-message', 'Error in auto-updater: ' + err);
});

autoUpdater.on('download-progress', (progressObj) => {
  let log_message = 'Download speed: ' + Math.round(progressObj.bytesPerSecond / 1000) + ' KB/s';
  log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
  log_message = log_message + ' (' + progressObj.transferred + '/' + progressObj.total + ')';
  log.info(log_message);  mainWindow.webContents.send('update-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', (info) => {
  log.info('Update downloaded');  mainWindow.webContents.send('update-downloaded');
  // Auto install the update
  autoUpdater.quitAndInstall();
});

// IPC handlers for renderer process
ipcMain.on('check-for-update', (event) => {
  autoUpdater.checkForUpdatesAndNotify();
});

ipcMain.on('install-update', () => {
  autoUpdater.quitAndInstall();
});
