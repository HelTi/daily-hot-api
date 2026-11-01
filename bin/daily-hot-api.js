#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const entry = path.join(__dirname, '..', 'dist', 'cli', 'index.js');

if (!fs.existsSync(entry)) {
  console.error('[daily-hot-api] 未找到编译产物: ' + entry);
  console.error(
    '[daily-hot-api] 如果从源码运行，请先执行 npm run build；如果是通过 npm 安装，请重新安装。',
  );
  process.exit(1);
}

try {
  require(entry).main();
} catch (error) {
  console.error(
    '[daily-hot-api] 启动失败:',
    error && error.stack ? error.stack : error,
  );
  process.exit(1);
}
