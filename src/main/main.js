const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const YouTubeAnalyzer = require('../utils/youtube-analyzer');

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
      }
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
  const headers = ['视频链接', '视频标题', '频道名称', '频道订阅量', '播放量', '点赞数', '评论数', '发布日期'];
  const rows = [headers.join(',')];

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