const { ipcRenderer } = require('electron');

// 常量定义
const NOTIFICATION_DURATION = 1000; // 1秒 - 复制提示时间
const NOTIFICATION_DISPLAY_DURATION = 1500; // 1.5秒 - 系统通知显示时间

// UI 文本常量
const UI_TEXT = {
    ANALYZING: '解析中...',
    ANALYZE: '解析',
    READY: '就绪',
    PARSING: '正在解析',
    STOPPED: '正在停止解析...',
    PARSE_COMPLETE: '解析完成',
    APPEND_COMPLETE: '追加解析完成'
};

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
        this.initElements();
        this.initTable();
        this.bindEvents();
        this.results = [];
        this.isAnalyzing = false;
        this.shouldStop = false;
        this.currentBatchStartIndex = 0; // 当前批次开始的索引
        this.currentBatchTotal = 0; // 当前批次的总数量
    }

    initElements() {
        this.urlsInput = document.getElementById('urls-input');
        this.analyzeBtn = document.getElementById('analyze-btn');
        this.analyzeDropdown = document.getElementById('analyze-dropdown');
        this.analyzeMenu = document.getElementById('analyze-menu');
        this.stopBtn = document.getElementById('stop-btn');
        this.clearBtn = document.getElementById('clear-btn');
        this.exportBtn = document.getElementById('export-btn');
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
        const headers = ['链接', '标题', '频道', '订阅量', '播放量', '点赞', '评论', '发布日期', '状态'];
        this.excelTable.setHeaders(headers);
    }

    bindEvents() {
        this.analyzeBtn.addEventListener('click', () => this.startAnalysis(false));
        this.stopBtn.addEventListener('click', () => this.stopAnalysis());
        this.clearBtn.addEventListener('click', () => this.clearInput());
        this.exportBtn.addEventListener('click', () => this.exportResults());

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
}

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    new YouTubeAnalyzerUI();
});

// 处理未捕获的错误
window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
});