const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const YouTubeAnalyzer = require('../utils/youtube-analyzer');
const { CSV_HEADERS } = require('../utils/constants');


let mainWindow;
const analyzer = new YouTubeAnalyzer();
let currentAnalysis = null;

// 强制设置应用语言为英文（用于访问YouTube）
app.commandLine.appendSwitch('lang', 'en-US');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true
    },
    show: false,
    title: 'YouTube Data Extractor',
    autoHideMenuBar: true
  });

  mainWindow.loadFile('src/renderer/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // 开发环境下打开开发者工具
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC 处理程序
ipcMain.handle('analyze-videos', async (event, urls) => {
  try {
    // 获取浏览器配置
    const config = loadConfig();
    const browserConfig = config.browser;

    currentAnalysis = analyzer.analyzeVideos(
      urls,
      null, // 移除单独的进度回调
      (result, current, total, allResults) => {
        event.sender.send('analysis-result', result, current, total);

        // 最后一个时发送通知
        if (current === total) {
          const successCount = allResults.filter(r => !r.error).length;
          new Notification({
            title: 'YouTube 解析完成',
            body: `成功解析 ${successCount}/${total} 个视频`
          }).show();
        }
      },
      browserConfig
    );

    const results = await currentAnalysis;
    currentAnalysis = null;
    return { success: true, data: results };
  } catch (error) {
    currentAnalysis = null;
    console.error('Analysis error:', error);
    return { success: false, error: error.message };
  }
});

// 停止分析处理程序
ipcMain.handle('stop-analysis', async () => {
  try {
    if (currentAnalysis && analyzer.browser) {
      analyzer.shouldStop = true;
      await analyzer.closeBrowser();
      currentAnalysis = null;
    }
    return { success: true };
  } catch (error) {
    console.error('Stop analysis error:', error);
    return { success: false, error: error.message };
  }
});

// 打开外部链接处理程序
ipcMain.handle('open-external', async (event, url) => {
  try {
    await shell.openExternal(url);
    return { success: true };
  } catch (error) {
    console.error('Open external error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('export-csv', async (event, data) => {
  try {
    const { filePath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'youtube-analysis.csv',
      filters: [
        { name: 'CSV files', extensions: ['csv'] }
      ]
    });

    if (filePath) {
      const csvContent = convertToCSV(data);
      // 添加UTF-8 BOM头确保中文正确显示
      const utf8BOM = '\uFEFF';
      fs.writeFileSync(filePath, utf8BOM + csvContent, 'utf8');
      return { success: true };
    }
    return { success: false, cancelled: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

function convertToCSV(data) {
  const rows = [CSV_HEADERS.join(',')];

  data.forEach(item => {
    const row = [
      `"${item.url || ''}"`,
      `"${item.title || ''}"`,
      `"${item.channelName || ''}"`,
      `"${item.subscriberCount || ''}"`,
      `"${item.viewCount || ''}"`,
      `"${item.likeCount || ''}"`,
      `"${item.commentCount || ''}"`,
      `"${item.publishDate || ''}"`
    ];
    rows.push(row.join(','));
  });

  return rows.join('\n');
}

// 检查浏览器路径是否存在
async function checkBrowserPath(browserType) {
  return await analyzer.getBrowserPath(browserType);
}

// 浏览器相关IPC处理
ipcMain.handle('check-browser-path', async (event, browserType) => {
  const path = await checkBrowserPath(browserType);
  return !!path;
});

ipcMain.handle('get-browser-path', async (event, browserType) => {
  return await checkBrowserPath(browserType);
});

ipcMain.handle('select-browser-file', async (event) => {
  try {
    const { filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择浏览器可执行文件',
      filters: [
        { name: '可执行文件', extensions: ['exe'] },
        { name: '所有文件', extensions: ['*'] }
      ],
      properties: ['openFile']
    });

    if (filePaths && filePaths.length > 0) {
      return filePaths[0];
    }
    return null;
  } catch (error) {
    console.error('Select browser file error:', error);
    return null;
  }
});

// 保存和获取用户配置
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (error) {
    console.error('Load config error:', error);
  }
  return {};
}

function saveConfig(config) {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (error) {
    console.error('Save config error:', error);
    return false;
  }
}

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

ipcMain.handle('save-config', async (event, config) => {
  return saveConfig(config);
});

ipcMain.handle('set-browser-config', async (event, browserConfig) => {
  const config = loadConfig();
  config.browser = browserConfig;
  return saveConfig(config);
});

ipcMain.handle('quit-app', async () => {
  app.quit();
});

ipcMain.handle('clear-browser-config', async () => {
  const config = loadConfig();
  delete config.browser;
  return saveConfig(config);
});