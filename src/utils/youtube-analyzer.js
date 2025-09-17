const puppeteer = require('puppeteer-core');

class YouTubeAnalyzer {
  constructor() {
    this.browser = null;
    this.shouldStop = false;
  }

  async initBrowser() {
    if (!this.browser) {
      // 使用系统 Edge 浏览器的常见路径
      const possiblePaths = [
        'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
        'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
        process.env.LOCALAPPDATA + '\\Microsoft\\Edge\\Application\\msedge.exe'
      ];

      let executablePath = null;
      for (const path of possiblePaths) {
        try {
          const fs = require('fs');
          if (fs.existsSync(path)) {
            executablePath = path;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!executablePath) {
        throw new Error('未找到 Microsoft Edge 浏览器。请确保已安装 Edge 浏览器。');
      }

      const launchOptions = {
        executablePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=VizDisplayCompositor',
          '--lang=en-US'
        ]
      };

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }

  async analyzeVideos(urls, progressCallback, resultCallback) {
    const browser = await this.initBrowser();
    const results = [];
    const total = urls.length;
    this.shouldStop = false;

    for (let i = 0; i < urls.length; i++) {
      // 检查是否应该停止
      if (this.shouldStop) {
        console.log('Analysis stopped by user');
        break;
      }

      const url = urls[i];
      let result;

      try {
        result = await this.analyzeVideo(browser, url.trim());
        results.push(result);
      } catch (error) {
        // 如果是因为停止操作导致的错误，直接退出
        if (this.shouldStop) {
          break;
        }

        console.error(`Error analyzing ${url}:`, error);
        result = {
          url: url.trim(),
          error: error.message,
          title: '解析失败',
          channelName: '-',
          subscriberCount: '-',
          viewCount: '-',
          likeCount: '-',
          commentCount: '-',
          publishDate: '-'
        };
        results.push(result);
      }

      // 调用结果回调（实时更新单个结果和进度）
      if (resultCallback && !this.shouldStop) {
        resultCallback(result, i + 1, total, results);
      }
    }

    return results;
  }

  async analyzeVideo(browser, url) {
    const page = await browser.newPage();

    try {
      // 设置用户代理和语言
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9'
      });

      // 访问视频页面
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000
      });

      // 等待页面加载完成
      await page.waitForTimeout(3000);

      // 提取ytInitialData JSON数据
      const videoData = await page.evaluate(() => {
        const result = {};

        try {
          // 1. 从ytInitialData获取所有数据
          if (window.ytInitialData) {
            const data = window.ytInitialData;

            // 获取视频基本信息
            const videoInfo = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[0]?.videoPrimaryInfoRenderer;
            if (videoInfo) {
              // 标题
              result.title = videoInfo?.title?.runs?.[0]?.text;

              // 播放量
              result.viewCount = videoInfo?.viewCount?.videoViewCountRenderer?.viewCount?.simpleText;

              // 点赞数 - 从按钮中获取
              const likeButton = videoInfo?.videoActions?.menuRenderer?.topLevelButtons?.[0]?.segmentedLikeDislikeButtonViewModel?.likeButtonViewModel?.likeButtonViewModel?.toggleButtonViewModel?.toggleButtonViewModel;
              if (likeButton) {
                // 优先获取默认状态的点赞数
                result.likeCount = likeButton?.defaultButtonViewModel?.buttonViewModel?.title ||
                                  likeButton?.toggledButtonViewModel?.buttonViewModel?.title;
              }
            }

            // 获取频道信息
            const videoOwner = data?.contents?.twoColumnWatchNextResults?.results?.results?.contents?.[1]?.videoSecondaryInfoRenderer?.owner?.videoOwnerRenderer;
            if (videoOwner) {
              // 频道名
              result.channelName = videoOwner?.title?.runs?.[0]?.text;

              // 订阅数
              result.subscriberCount = videoOwner?.subscriberCountText?.simpleText;
            }

            // 获取评论数 - 从engagementPanels中获取
            const engagementPanels = data?.engagementPanels;
            if (engagementPanels && Array.isArray(engagementPanels)) {
              for (const panel of engagementPanels) {
                const renderer = panel?.engagementPanelSectionListRenderer;
                if (renderer?.panelIdentifier === 'engagement-panel-comments-section') {
                  const contextualInfo = renderer?.header?.engagementPanelTitleHeaderRenderer?.contextualInfo?.runs?.[0]?.text;
                  if (contextualInfo && /^\d+$/.test(contextualInfo)) {
                    result.commentCount = contextualInfo;
                  }
                  break;
                }
              }
            }

            // 获取发布日期 - 从dateText获取
            if (videoInfo?.dateText?.simpleText) {
              result.publishDate = videoInfo.dateText.simpleText;
            }
          }

          // 2. 备用：从ytInitialPlayerResponse获取补充信息
          if (window.ytInitialPlayerResponse) {
            const playerData = window.ytInitialPlayerResponse;

            if (!result.title && playerData.videoDetails?.title) {
              result.title = playerData.videoDetails.title;
            }

            if (!result.channelName && playerData.videoDetails?.author) {
              result.channelName = playerData.videoDetails.author;
            }

            if (!result.viewCount && playerData.videoDetails?.viewCount) {
              result.viewCount = playerData.videoDetails.viewCount;
            }

            // 从microformat获取发布日期
            if (!result.publishDate && playerData.microformat?.playerMicroformatRenderer?.publishDate) {
              const publishDate = new Date(playerData.microformat.playerMicroformatRenderer.publishDate);
              result.publishDate = publishDate.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              });
            }
          }

          return result;
        } catch (error) {
          console.error('JSON extraction error:', error);
          return result;
        }
      });

      // 数据清理和格式化
      const cleanedData = this.cleanVideoData(videoData);
      cleanedData.url = url;

      return cleanedData;

    } finally {
      await page.close();
    }
  }

  cleanVideoData(data) {
    // 检查是否成功获取到有效数据
    const hasValidData = data.title && data.channelName && (data.viewCount || data.subscriberCount);

    const result = {
      title: data.title || '未知标题',
      channelName: data.channelName || '未知频道',
      subscriberCount: this.formatSubscriberCount(data.subscriberCount),
      viewCount: this.formatViewCount(data.viewCount),
      likeCount: this.formatLikeCount(data.likeCount),
      commentCount: this.formatCommentCount(data.commentCount),
      publishDate: this.formatDate(data.publishDate),
      url: data.url
    };

    // 如果没有获取到有效数据，标记为失败
    if (!hasValidData) {
      result.error = '无法获取视频信息，可能是私有视频或已删除';
    }

    return result;
  }

  formatSubscriberCount(text) {
    if (!text) return '-';
    // 去掉 "subscribers" 文字，只保留数字
    return text.replace(/\s*subscribers?/i, '');
  }

  formatViewCount(text) {
    if (!text) return '-';
    // 去掉 "views" 文字，只保留数字
    return text.replace(/\s*views?/i, '');
  }

  formatLikeCount(text) {
    if (!text) return '-';
    // 返回纯数字
    return text;
  }

  formatCommentCount(text) {
    if (!text) return '-';
    // 返回纯数字，不加 "Comments"
    return text;
  }

  formatDate(text) {
    if (!text) return '-';
    try {
      // 将 "Sep 16, 2025" 格式转换为 "2025-09-16"
      const date = new Date(text);
      if (isNaN(date.getTime())) {
        return text; // 如果解析失败，返回原文本
      }

      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');

      return `${year}-${month}-${day}`;
    } catch (e) {
      return text;
    }
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = YouTubeAnalyzer;