// 简单创建应用图标的脚本
const fs = require('fs');

// 创建一个简单的SVG图标作为占位符
const svgIcon = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" fill="#FF0000" rx="24"/>
  <rect x="32" y="80" width="192" height="96" fill="white" rx="8"/>
  <polygon points="96,112 96,144 160,128" fill="#FF0000"/>
  <text x="128" y="200" text-anchor="middle" fill="white" font-family="Arial" font-size="24" font-weight="bold">YT Analyzer</text>
</svg>`;

// 写入SVG文件
fs.writeFileSync('icon.svg', svgIcon);
console.log('已创建 icon.svg 文件');
console.log('请将 icon.svg 转换为 icon.ico 文件用于Windows应用程序');
console.log('可以使用在线转换工具或者ImageMagick等工具进行转换');