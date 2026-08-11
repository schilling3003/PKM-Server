const fs = require('node:fs');
const path = require('node:path');

const src = path.join(__dirname, '..', 'src', 'migrations');
const dest = path.join(__dirname, '..', 'dist', 'migrations');

fs.mkdirSync(dest, { recursive: true });
fs.cpSync(src, dest, { recursive: true, force: true });
