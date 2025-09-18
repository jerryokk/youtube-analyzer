const { ipcRenderer } = require('electron');

// 从常量文件导入配置（在Electron渲染进程中需要使用require）
const { UI_TEXT, NOTIFICATION_DURATION, NOTIFICATION_DISPLAY_DURATION, TABLE_HEADERS } = require('../utils/constants');

// 浏览器选择对话框
class BrowserSelector {
    constructor() {
        this.selectedBrowser = null;
        this.customPath = null;
    }

    async show() {
        return new Promise((resolve) => {
            const modal = document.createElement('div');
            modal.className = 'browser-modal';
            modal.innerHTML = `
                <div class="browser-modal-content">
                    <h3>选择浏览器</h3>
                    <p>首次使用需要选择浏览器引擎，请选择一个可用的选项：</p>

                    <div class="browser-options">
                        <div class="browser-option" data-browser="edge">
                            <div class="browser-icon">🔵</div>
                            <div class="browser-info">
                                <div class="browser-name">Microsoft Edge (推荐)</div>
                                <div class="browser-status" id="edge-status">检测中...</div>
                            </div>
                        </div>

                        <div class="browser-option" data-browser="chrome">
                            <div class="browser-icon">🟢</div>
                            <div class="browser-info">
                                <div class="browser-name">Google Chrome</div>
                                <div class="browser-status" id="chrome-status">检测中...</div>
                            </div>
                        </div>

                        <div class="browser-option" data-browser="custom">
                            <div class="browser-icon">📁</div>
                            <div class="browser-info">
                                <div class="browser-name">自定义浏览器路径</div>
                                <div class="browser-status">手动选择浏览器可执行文件（如 chrome.exe, msedge.exe）</div>
                            </div>
                        </div>
                    </div>

                    <div class="custom-path-section" id="custom-path-section" style="display: none;">
                        <input type="text" id="custom-path-input" placeholder="请选择浏览器可执行文件..." readonly>
                        <button id="browse-button">浏览</button>
                    </div>

                    <div class="browser-modal-buttons">
                        <button id="confirm-browser" disabled>确认</button>
                    </div>
                </div>
            `;

            document.body.appendChild(modal);

            this.checkBrowsers();
            this.bindEvents(modal, resolve);
        });
    }

    async checkBrowsers() {
        // 检测 Edge
        const edgeStatus = document.querySelector('#edge-status');
        const edgeAvailable = await ipcRenderer.invoke('check-browser-path', 'edge');
        edgeStatus.textContent = edgeAvailable ? '✅ 可用' : '❌ 未找到';
        edgeStatus.parentElement.parentElement.classList.toggle('available', edgeAvailable);

        // 检测 Chrome
        const chromeStatus = document.querySelector('#chrome-status');
        const chromeAvailable = await ipcRenderer.invoke('check-browser-path', 'chrome');
        chromeStatus.textContent = chromeAvailable ? '✅ 可用' : '❌ 未找到';
        chromeStatus.parentElement.parentElement.classList.toggle('available', chromeAvailable);
    }

    bindEvents(modal, resolve) {
        const options = modal.querySelectorAll('.browser-option');
        const customSection = modal.querySelector('#custom-path-section');
        const customInput = modal.querySelector('#custom-path-input');
        const browseButton = modal.querySelector('#browse-button');
        const confirmButton = modal.querySelector('#confirm-browser');

        options.forEach(option => {
            option.addEventListener('click', () => {
                // 移除其他选中状态
                options.forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                const browser = option.dataset.browser;
                this.selectedBrowser = browser;

                if (browser === 'custom') {
                    customSection.style.display = 'block';
                    confirmButton.disabled = !customInput.value;
                } else {
                    customSection.style.display = 'none';
                    // 选择Edge或Chrome时，直接启用确认按钮（即使浏览器不可用也允许用户尝试）
                    confirmButton.disabled = false;
                }
            });
        });

        browseButton.addEventListener('click', async () => {
            const path = await ipcRenderer.invoke('select-browser-file');
            if (path) {
                customInput.value = path;
                this.customPath = path;
                confirmButton.disabled = false;
            }
        });

        confirmButton.addEventListener('click', () => {
            const result = {
                browser: this.selectedBrowser,
                customPath: this.customPath
            };

            document.body.removeChild(modal);
            resolve(result);
        });
    }
}

class ExcelTable {
    constructor(container) {
        this.container = container;
        this.data = [];
        this.headers = [];
        this.selectedCells = new Set();
        this.selectionStart = null;
        this.isSelecting = false;
        this.hasFocus = false;
        this.init();
    }

    init() {
        this.container.innerHTML = `
            <div class="excel-wrapper">
                <table class="excel-grid">
                    <thead class="excel-header"></thead>
                    <tbody class="excel-body"></tbody>
                </table>
            </div>
        `;

        this.table = this.container.querySelector('.excel-grid');
        this.thead = this.container.querySelector('.excel-header');
        this.tbody = this.container.querySelector('.excel-body');

        this.bindEvents();
    }

    bindEvents() {
        // 鼠标事件
        this.tbody.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.tbody.addEventListener('mouseover', (e) => this.onMouseOver(e));
        document.addEventListener('mouseup', () => this.onMouseUp());

        // 全局点击事件 - 点击表格外部时清除选择
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target)) {
                this.clearSelection();
                this.hasFocus = false;
            } else {
                this.hasFocus = true;
            }
        });

        // 防止默认选择
        this.table.addEventListener('selectstart', (e) => {
            if (this.isSelecting) e.preventDefault();
        });

    }

    setHeaders(headers) {
        this.headers = headers;
        this.renderHeaders();
    }

    setData(data) {
        this.data = data;
        this.renderData();
    }

    renderHeaders() {
        this.thead.innerHTML = `
            <tr>
                ${this.headers.map(header =>
                    `<th class="excel-cell excel-header-cell">${header}</th>`
                ).join('')}
            </tr>
        `;
    }

    renderData() {
        this.tbody.innerHTML = '';
        this.data.forEach((row, rowIndex) => {
            const tr = document.createElement('tr');
            tr.innerHTML = this.headers.map((header, colIndex) => {
                const cellValue = this.getCellValue(row, colIndex);
                const cellClass = this.getCellClass(row, colIndex);

                // 对于链接列，创建可点击的链接
                let cellContent;
                if (colIndex === 0 && cellValue && cellValue.startsWith('http')) {
                    cellContent = `<a href="#" class="cell-link" onclick="event.stopPropagation(); ipcRenderer.invoke('open-external', '${cellValue}')">${this.escapeHtml(cellValue)}</a>`;
                } else {
                    cellContent = this.escapeHtml(cellValue);
                }

                return `<td class="excel-cell excel-data-cell ${cellClass}"
                           data-row="${rowIndex}"
                           data-col="${colIndex}"
                           title="${this.escapeHtml(cellValue)}">${cellContent}</td>`;
            }).join('');
            this.tbody.appendChild(tr);
        });
    }

    getCellValue(row, colIndex) {
        const fields = ['url', 'title', 'channelName', 'subscriberCount', 'viewCount', 'likeCount', 'commentCount', 'publishDate', 'status'];
        const field = fields[colIndex];

        if (field === 'status') {
            return row.error ? '❌' : '✅';
        }

        return row[field] || '';
    }

    getCellClass(row, colIndex) {
        const classes = [];

        // 数值类型右对齐
        if ([3, 4, 5, 6].includes(colIndex)) {
            classes.push('text-right');
        }

        // 链接样式
        if (colIndex === 0) {
            classes.push('cell-url');
        }

        // 错误行样式
        if (row.error) {
            classes.push('cell-error');
        }

        return classes.join(' ');
    }

    onMouseDown(e) {
        // 如果点击的是链接，不处理单元格选择
        if (e.target.classList.contains('cell-link')) {
            return;
        }

        const cell = e.target.closest('.excel-data-cell');
        if (!cell) return;

        e.preventDefault();
        this.isSelecting = true;

        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);
        this.selectionStart = { row, col };

        // 清空之前的选择（简化选择逻辑）
        this.clearSelection();

        this.updateSelection(row, col, row, col);
    }

    onMouseOver(e) {
        if (!this.isSelecting || !this.selectionStart) return;

        const cell = e.target.closest('.excel-data-cell');
        if (!cell) return;

        const row = parseInt(cell.dataset.row);
        const col = parseInt(cell.dataset.col);

        this.updateSelection(this.selectionStart.row, this.selectionStart.col, row, col);
    }

    onMouseUp() {
        this.isSelecting = false;
        this.selectionStart = null;
    }

    updateSelection(startRow, startCol, endRow, endCol) {
        // 确保选择范围正确
        const minRow = Math.min(startRow, endRow);
        const maxRow = Math.max(startRow, endRow);
        const minCol = Math.min(startCol, endCol);
        const maxCol = Math.max(startCol, endCol);

        // 清空当前选择
        this.clearSelection();

        // 选择范围内的所有单元格
        for (let row = minRow; row <= maxRow; row++) {
            for (let col = minCol; col <= maxCol; col++) {
                const cellKey = `${row}-${col}`;
                this.selectedCells.add(cellKey);

                const cellElement = this.tbody.querySelector(`[data-row="${row}"][data-col="${col}"]`);
                if (cellElement) {
                    cellElement.classList.add('selected');
                }
            }
        }
    }

    clearSelection() {
        this.tbody.querySelectorAll('.selected').forEach(cell => {
            cell.classList.remove('selected');
        });
        this.selectedCells.clear();
    }

    copySelectedCells() {
        if (this.selectedCells.size === 0) return;

        // 收集选中的单元格数据
        const cellData = new Map();

        this.selectedCells.forEach(cellKey => {
            const [row, col] = cellKey.split('-').map(Number);
            if (!cellData.has(row)) {
                cellData.set(row, new Map());
            }

            const cellValue = this.getCellValue(this.data[row], col);
            cellData.get(row).set(col, cellValue);
        });

        // 按行列顺序组织数据
        const rows = Array.from(cellData.keys()).sort((a, b) => a - b);
        const copyText = rows.map(row => {
            const rowData = cellData.get(row);
            const cols = Array.from(rowData.keys()).sort((a, b) => a - b);
            return cols.map(col => rowData.get(col)).join('\t');
        }).join('\n');

        // 复制到剪贴板
        this.copyToClipboard(copyText);
    }

    copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            this.showCopyNotification();
        });
    }

    showCopyNotification() {
        const notification = document.createElement('div');
        notification.textContent = `已复制 ${this.selectedCells.size} 个单元格`;
        notification.className = 'copy-notification';
        document.body.appendChild(notification);

        setTimeout(() => {
            if (document.body.contains(notification)) {
                document.body.removeChild(notification);
            }
        }, NOTIFICATION_DURATION);
    }

    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

class YouTubeAnalyzerUI {
    constructor() {
        this.results = [];
        this.isAnalyzing = false;
        this.shouldStop = false;
        this.currentBatchStartIndex = 0; // 当前批次开始的索引
        this.currentBatchTotal = 0; // 当前批次的总数量
    }

    async init() {
        this.initElements();
        this.initTable();
        this.bindEvents();

        // 检查浏览器配置，如果没有则显示选择对话框
        await this.checkBrowserConfig();
    }

    async checkBrowserConfig() {
        const config = await ipcRenderer.invoke('get-config');
        if (!config.browser) {
            const browserSelector = new BrowserSelector();
            const browserConfig = await browserSelector.show();

            if (!browserConfig) {
                // 用户取消了选择，退出应用
                await ipcRenderer.invoke('quit-app');
                return;
            }

            // 保存浏览器配置
            await ipcRenderer.invoke('set-browser-config', browserConfig);
        }
    }

    initElements() {
        this.urlsInput = document.getElementById('urls-input');
        this.analyzeBtn = document.getElementById('analyze-btn');
        this.analyzeDropdown = document.getElementById('analyze-dropdown');
        this.analyzeMenu = document.getElementById('analyze-menu');
        this.stopBtn = document.getElementById('stop-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.exportBtn = document.getElementById('export-btn');
        this.browserSettingsBtn = document.getElementById('browser-settings-btn');
        this.statusBar = document.getElementById('status-bar');
        this.progressPanel = document.getElementById('progress-panel');
        this.progressText = document.getElementById('progress-text');
        this.progressCount = document.getElementById('progress-count');
        this.progressFill = document.getElementById('progress-fill');
        this.resultStats = document.getElementById('result-stats');
    }

    initTable() {
        const tableContainer = document.getElementById('results-table');
        this.excelTable = new ExcelTable(tableContainer);

        // 设置表头
        this.excelTable.setHeaders(TABLE_HEADERS);
    }

    bindEvents() {
        this.analyzeBtn.addEventListener('click', () => this.startAnalysis(false));
        this.stopBtn.addEventListener('click', () => this.stopAnalysis());
        this.clearBtn.addEventListener('click', () => this.clearInput());
        this.exportBtn.addEventListener('click', () => this.exportResults());
        this.browserSettingsBtn.addEventListener('click', () => this.showBrowserSettings());

        // 下拉按钮事件
        this.analyzeDropdown.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleDropdown();
        });

        // 下拉菜单项事件
        this.analyzeMenu.querySelectorAll('.dropdown-item').forEach(item => {
            item.addEventListener('click', (e) => {
                const action = e.currentTarget.dataset.action;
                this.closeDropdown();
                if (action === 'parse') {
                    this.startAnalysis(false); // 清空重新解析
                } else if (action === 'append') {
                    this.startAnalysis(true); // 追加解析
                }
            });
        });

        // 点击外部关闭下拉菜单
        document.addEventListener('click', () => {
            this.closeDropdown();
        });

        // 快捷键支持
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.startAnalysis(false);
            }
            // 表格复制功能
            if (e.ctrlKey && e.key === 'c' && this.excelTable.hasFocus && this.excelTable.selectedCells.size > 0) {
                this.excelTable.copySelectedCells();
                e.preventDefault();
            }
        });

        // 实时验证输入
        this.urlsInput.addEventListener('input', () => {
            this.validateInput();
        });

        // 监听实时结果更新
        ipcRenderer.on('analysis-result', (event, result, current, total) => {
            this.addResultToTable(result);
            this.updateProgress(current, total);
        });
    }

    validateInput() {
        const urls = this.getValidUrls();
        // 如果正在解析，保持按钮禁用状态
        if (this.isAnalyzing) {
            this.analyzeBtn.disabled = true;
            this.analyzeDropdown.disabled = true;
        } else {
            this.analyzeBtn.disabled = urls.length === 0;
            this.analyzeDropdown.disabled = urls.length === 0;
        }
    }

    getValidUrls() {
        const text = this.urlsInput.value.trim();
        if (!text) return [];

        const lines = text.split('\n').map(line => line.trim()).filter(line => line);
        const youtubeRegex = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/)/;

        return lines.filter(line => youtubeRegex.test(line));
    }

    toggleDropdown() {
        this.analyzeMenu.classList.toggle('show');
    }

    closeDropdown() {
        this.analyzeMenu.classList.remove('show');
    }

    async startAnalysis(appendMode = false) {
        const urls = this.getValidUrls();

        if (urls.length === 0) {
            alert('请输入有效的YouTube链接');
            return;
        }


        this.isAnalyzing = true;
        this.shouldStop = false;
        this.setAnalyzing(true);
        this.showProgress(true);

        // 根据模式决定是否清空结果
        if (!appendMode) {
            this.clearResults();
            this.results = []; // 重置结果数组
            this.currentBatchStartIndex = 0;
        } else {
            this.currentBatchStartIndex = this.results.length;
        }

        try {
            this.currentBatchTotal = urls.length;
            this.updateProgress(0, urls.length);

            const result = await ipcRenderer.invoke('analyze-videos', urls);

            if (result.success) {
                this.exportBtn.disabled = false;
                if (!this.shouldStop) {
                    const message = appendMode ? UI_TEXT.APPEND_COMPLETE : UI_TEXT.PARSE_COMPLETE;
                    this.showNotification(message, 'success');
                }
            } else {
                throw new Error(result.error || '解析失败');
            }

        } catch (error) {
            if (!this.shouldStop) {
                console.error('Analysis error:', error);

                // 如果是浏览器相关错误，提供重新选择浏览器的选项
                if (error.message.includes('浏览器') || error.message.includes('browser') || error.message.includes('launch') || error.message.includes('未找到可用的浏览器')) {
                    const retry = confirm(`浏览器启动失败: ${error.message}\n\n是否重新选择浏览器？`);
                    if (retry) {
                        // 清除当前浏览器配置，下次启动时会重新选择
                        await ipcRenderer.invoke('clear-browser-config');
                        // 重新加载应用
                        location.reload();
                        return;
                    }
                }

                this.showNotification(`解析失败: ${error.message}`, 'error');
            }
        } finally {
            this.isAnalyzing = false;
            this.shouldStop = false;
            this.setAnalyzing(false);
            this.showProgress(false);
        }
    }

    stopAnalysis() {
        this.shouldStop = true;
        ipcRenderer.invoke('stop-analysis');
        this.showNotification(UI_TEXT.STOPPED, 'info');
    }

    addResultToTable(result) {
        // 添加结果到数组
        this.results.push(result);

        // 实时更新表格
        this.excelTable.setData([...this.results]);

        // 更新统计信息
        this.updateStats();
    }

    updateStats() {
        const totalResults = this.results.length;
        const successCount = this.results.filter(r => !r.error).length;

        this.resultStats.textContent = `${totalResults} 项 (${successCount} 成功)`;

        if (this.isAnalyzing) {
            const currentBatchCompleted = totalResults - this.currentBatchStartIndex;
            this.statusBar.textContent = `解析中 - ${currentBatchCompleted}/${this.currentBatchTotal} (${successCount} 成功)`;
        } else {
            this.statusBar.textContent = totalResults > 0 ?
                `完成 - ${successCount}/${totalResults} 成功` : UI_TEXT.READY;
        }
    }

    setAnalyzing(analyzing) {
        this.isAnalyzing = analyzing;
        this.analyzeBtn.disabled = analyzing;
        this.analyzeDropdown.disabled = analyzing;
        this.analyzeBtn.innerHTML = analyzing ? `<span class="icon">⏳</span>${UI_TEXT.ANALYZING}` : `<span class="icon">⚡</span>${UI_TEXT.ANALYZE}`;
        this.stopBtn.style.display = analyzing ? 'inline-flex' : 'none';

        // 更新状态栏
        this.updateStats();

        // 解析开始时关闭下拉菜单
        if (analyzing) {
            this.closeDropdown();
        }
    }

    showProgress(show) {
        this.progressPanel.style.display = show ? 'block' : 'none';
    }

    updateProgress(current, total) {
        const percentage = total > 0 ? (current / total) * 100 : 0;
        this.progressFill.style.width = `${percentage}%`;
        this.progressCount.textContent = `${current}/${total}`;
    }

    clearInput() {
        this.urlsInput.value = '';
        this.validateInput();
    }

    clearResults() {
        this.results = [];
        this.excelTable.setData([]);
        this.updateStats();
        this.exportBtn.disabled = true;
    }

    displayResults(results) {
        if (!results || results.length === 0) {
            this.clearResults();
            this.updateStats();
            return;
        }

        // 设置数据到表格
        this.excelTable.setData(results);

        // 更新统计信息
        this.updateStats();
    }

    async exportResults() {
        if (!this.results || this.results.length === 0) {
            alert('没有可导出的数据');
            return;
        }

        try {
            const result = await ipcRenderer.invoke('export-csv', this.results);

            if (result.success) {
                this.showNotification('导出成功', 'success');
            } else if (result.cancelled) {
                // 用户取消了导出
            } else {
                throw new Error(result.error || '导出失败');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showNotification(`导出失败: ${error.message}`, 'error');
        }
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        Object.assign(notification.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            padding: '15px 20px',
            borderRadius: '6px',
            color: 'white',
            fontSize: '14px',
            fontWeight: '500',
            zIndex: '10000',
            transform: 'translateX(400px)',
            transition: 'transform 0.3s ease'
        });

        if (type === 'success') {
            notification.style.background = '#28a745';
        } else if (type === 'error') {
            notification.style.background = '#dc3545';
        } else {
            notification.style.background = '#17a2b8';
        }

        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.transform = 'translateX(0)';
        }, 100);

        setTimeout(() => {
            notification.style.transform = 'translateX(400px)';
            setTimeout(() => {
                if (document.body.contains(notification)) {
                    document.body.removeChild(notification);
                }
            }, 300);
        }, NOTIFICATION_DISPLAY_DURATION);
    }

    async showBrowserSettings() {
        const config = await ipcRenderer.invoke('get-config');
        let currentBrowser = '未配置';

        if (config.browser) {
            if (config.browser.browser === 'custom') {
                currentBrowser = `自定义: ${config.browser.customPath}`;
            } else {
                currentBrowser = config.browser.browser === 'edge' ? 'Microsoft Edge' : 'Google Chrome';
            }
        }

        const change = confirm(`当前浏览器配置: ${currentBrowser}\n\n是否重新选择浏览器？`);
        if (change) {
            const browserSelector = new BrowserSelector();
            const browserConfig = await browserSelector.show();

            if (browserConfig) {
                await ipcRenderer.invoke('set-browser-config', browserConfig);
                this.showNotification('浏览器配置已更新', 'success');
            }
        }
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', async () => {
    const ui = new YouTubeAnalyzerUI();
    await ui.init();
});

// 处理未捕获的错误
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});