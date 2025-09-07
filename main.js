// Enhanced Electron Browser - Main Process

const { app, BrowserWindow, shell, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

// Window control IPC handlers
ipcMain.handle('is-window-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
});

// Window control IPC handlers
ipcMain.handle('window-minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
        win.minimize();
    }
});

ipcMain.handle('window-maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win && !win.isDestroyed()) {
        if (win.isMaximized()) {
            win.unmaximize();
        } else {
            win.maximize();
        }
    }
});

ipcMain.handle('create-new-window', async (event) => {
    event.preventDefault();
    const win = createMainWindow("default");
    return win !== null;
});

ipcMain.handle('create-new-incognito-window', async (event) => {
    event.preventDefault();
    const win = createMainWindow("incognito");
    return win !== null;
});

ipcMain.handle('window-close', (event) => {
    try {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            if (win.getBounds) {
                const bounds = win.getBounds();
                const isMaximized = win.isMaximized ? win.isMaximized() : false;
                saveWindowState(bounds, isMaximized);
            }
            win.destroy();
        }
    } catch (error) {
        console.error('Error in window-close handler:', error);
        
    } finally {
        // Added finally block to ensure cleanup
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win && !win.isDestroyed()) {
            win.removeListener('resize', saveState);
            win.removeListener('move', saveState);
            win.removeListener('close', saveState);
            win.removeListener('maximize', onMaximize);
            win.removeListener('unmaximize', onUnmaximize);
        }
    }
});


ipcMain.handle('get-download-history', () => {
  const historyPath = path.join(app.getPath('userData'), 'download-history.json');
  if (fs.existsSync(historyPath)) {
    return JSON.parse(fs.readFileSync(historyPath));
  }
  return [];
});


ipcMain.handle('show-item-in-folder', async (event, filePath) => {
  try {
    if (filePath && fs.existsSync(filePath)) {
      shell.showItemInFolder(path.normalize(filePath));
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    console.error('Error showing item in folder:', error);
    return { success: false, error: error.message };
  }
});

const stateFile = path.join(app.getPath('userData'), 'window-state.json');
function loadWindowState() {
	try {
	if (fs.existsSync(stateFile)) {
		return JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
	}
	} catch (e) {}
	return null;
}

function saveWindowState(bounds, maximized) {
	try {
	fs.writeFileSync(stateFile, JSON.stringify({ ...bounds, maximized }));
	} catch (e) {}
}

let mainWindow;
let currentWindow;
let windowState = "default";

function createMainWindow(windowType = 'default') {
    const isIncognito = windowType === 'incognito';
    const savedState = loadWindowState();
    
    // Window configuration
    const win = new BrowserWindow({
        width: savedState?.width || 1400,
        height: savedState?.height || 900,
        x: savedState?.x,
        y: savedState?.y,
        minWidth: 800,
        minHeight: 600,
        show: false,
        title: isIncognito ? 'Incognito - Prism' : 'Prism (by PrimeX)',
        icon: path.join(__dirname, 'assets', 'Prizm_Logo.png'),
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            // Enable the <webview> tag in index.html
            webviewTag: true,
            // Enable additional security features
            webSecurity: true,
            allowRunningInsecureContent: false,
            // Enable spell checker
            spellcheck: true,
            // Enable webgl
            webgl: true,
            sandbox: true,
            enableRemoteModule: false,
            preload: path.join(__dirname, 'preload.js'),
            // Separate partition for incognito windows
            partition: isIncognito ? 'incognito' : 'persist:default'
        }
    });
    
    // Store window type
    win.windowType = windowType;
    
    // Save window state on move/resize/close
    const saveState = () => {
        if (win && !win.isDestroyed() && !win.isMinimized()) {
            try {
                const bounds = win.getBounds();
                saveWindowState(bounds, win.isMaximized());
            } catch (e) {
                console.error('Error saving window state:', e);
            }
        }
    };
    
    // Set up window event listeners
    const cleanup = () => {
        win.removeListener('resize', saveState);
        win.removeListener('move', saveState);
        win.removeListener('close', saveState);
        win.removeListener('maximize', onMaximize);
        win.removeListener('unmaximize', onUnmaximize);
    };
    
    const onMaximize = () => {
        if (win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('window-maximize-changed', true);
        }
    };
    
    const onUnmaximize = () => {
        if (win.webContents && !win.webContents.isDestroyed()) {
            win.webContents.send('window-maximize-changed', false);
        }
    };
    
    win.on('resize', saveState);
    win.on('move', saveState);
    win.on('close', saveState);
    win.on('maximize', onMaximize);
    win.on('unmaximize', onUnmaximize);
    win.on('closed', () => {
        cleanup();
        if (win === mainWindow) {
            mainWindow = null;
        }
    });

	// Load the UI
	win.loadFile(path.join(__dirname, 'index.html'));

	// Show window when ready to prevent visual flash
	win.once('ready-to-show', () => {
	    if (savedState?.maximized) {
	        win.maximize();
	    }
	    win.show();
	    
	    // Send window type to renderer
	    if (win.webContents && !win.webContents.isDestroyed()) {
	        win.webContents.send('window-type', windowType);
	    }
	});
	
	// Set as main window if it's the first window
	if (!mainWindow) {
	    mainWindow = win;
	}
	
	// Handle new window/tab requests from the main window
	win.webContents.setWindowOpenHandler(({ url }) => {
		const targetWin = win.webContents.isDestroyed() ? mainWindow : win;
		if (targetWin && !targetWin.isDestroyed()) {
			targetWin.webContents.send('open-new-tab', url);
		}
		return { action: 'deny' };
	});

	// Handle new window requests from webviews
	win.webContents.on('did-create-window', (newWindow, details) => {
		const targetWin = win.webContents.isDestroyed() ? mainWindow : win;
		if (details.url && targetWin && !targetWin.isDestroyed()) {
			targetWin.webContents.send('open-new-tab', details.url);
		}
		if (newWindow && !newWindow.isDestroyed()) {
			newWindow.close();
		}
	});

	// Window state tracking
	win.on('focus', () => {
		currentWindow = isIncognito ? "incognito" : "default";
		windowState = currentWindow;
	});

  







  // Attach download listener
  session.defaultSession.on('will-download', (event, item, webContents) => {
    // Get file info
    const fileName = item.getFilename();
    const fileSize = item.getTotalBytes();
    const savePath = app.getPath('downloads'); // default downloads folder

    // Set the save path
    item.setSavePath(path.join(savePath, fileName));

    // Track progress
    item.on('updated', (event, state) => {
      if (state === 'progressing') {
        if (!item.isPaused()) {
          console.log(`Downloading ${fileName} - ${item.getReceivedBytes()}/${fileSize}`);
        }
      }
    });

    // When download finishes
    item.once('done', (event, state) => {
      if (state === 'completed') {
        console.log(`Download completed: ${fileName}`);

        // Save to history.json
        const historyPath = path.join(app.getPath('userData'), 'download-history.json');

        let history = [];
        if (fs.existsSync(historyPath)) {
          history = JSON.parse(fs.readFileSync(historyPath));
        }

        history.push({
          name: fileName,
          path: path.join(savePath, fileName),
          size: fileSize,
          date: new Date().toISOString(),
        });

        fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
      } else {
        console.log(`Download failed: ${fileName}`);
      }
    });
  });


	return win;
}









function handleDownload(item) {
  const fileName = item.getFilename();
  const fileSize = item.getTotalBytes();
  const savePath = app.getPath('downloads');
  const fullPath = path.join(savePath, fileName);

  item.setSavePath(fullPath);

  item.on('updated', (event, state) => {
    if (state === 'progressing' && !item.isPaused()) {
      console.log(`Downloading ${fileName} - ${item.getReceivedBytes()}/${fileSize}`);
    }
  });

  item.once('done', (event, state) => {
    if (state === 'completed') {
      console.log(`Download completed: ${fullPath}`);
      saveDownloadHistory(fileName, fullPath, fileSize);
    } else {
      console.log(`Download failed: ${fileName}`);
    }
  });
}

function saveDownloadHistory(name, filePath, size) {
  const historyPath = path.join(app.getPath('userData'), 'downloads.json');
  let history = [];

  if (fs.existsSync(historyPath)) {
    try {
      const data = fs.readFileSync(historyPath, 'utf8');
      history = JSON.parse(data);
    } catch (err) {
      console.error('Error parsing download history:', err);
      // If file is corrupted, rename it and start fresh
      const backupPath = `${historyPath}.bak.${Date.now()}`;
      fs.renameSync(historyPath, backupPath);
      console.log(`Corrupted history file backed up to: ${backupPath}`);
    }
  }

  // Add new download to the beginning of the array (most recent first)
  history.unshift({
    name,
    path: filePath,
    size,
    date: new Date().toISOString(),
  });

  // Keep only the last 100 downloads
  if (history.length > 100) {
    history = history.slice(0, 100);
  }

  try {
    fs.writeFileSync(historyPath, JSON.stringify(history, null, 2));
  } catch (err) {
    console.error('Error writing download history:', err);
  }
}









// Auto-update handlers
function setupAutoUpdater() {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('update-available', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: 'A new version of Prizm is being downloaded...',
      buttons: ['OK']
    });
  });

  autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
      type: 'info',
      title: 'Update Ready',
      message: 'A new version has been downloaded. Restart now to install the update?',
      buttons: ['Restart', 'Later']
    }).then(result => {
      if (result.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (error) => {
    console.error('Update error:', error);
  });

  // Check for updates after 5 seconds
  setTimeout(() => {
    autoUpdater.checkForUpdates();
  }, 5000);
}

app.whenReady().then(() => {
  createMainWindow();

  // Attach download listener once here
  session.defaultSession.on('will-download', (event, item, webContents) => {
    handleDownload(item);
  });

  // Auto-updater
  try {
    if (!require('electron-squirrel-startup')) {
      setupAutoUpdater();
    }
  } catch (e) {
    setupAutoUpdater();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// Quit when all windows are closed
app.on('window-all-closed', () => {
	if (process.platform !== 'darwin') {
	app.quit();
	}
});

// Handle webview new window events
app.on('web-contents-created', (event, contents) => {
  // Only handle webview contents
  if (contents.getType() === 'webview') {
    // Handle new window requests from webviews
    contents.setWindowOpenHandler(({ url }) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-new-tab', url);
      }
      return { action: 'deny' };
    });

    // Fallback for older Electron versions
    contents.on('new-window', (event, url) => {
      event.preventDefault();
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('open-new-tab', url);
      }
    });
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    if (!dialog.showErrorBox) {
        console.error('Dialog not available in this context');
        return;
    }
    dialog.showErrorBox('Error', 'An unexpected error occurred. Please restart the application.');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});


