const fs = require('fs');
console.log('Node.js version:', process.version);
console.log('Platform:', process.platform);
console.log('Architecture:', process.arch);
console.log('Current directory:', process.cwd());
console.log('Files in current directory:');
fs.readdirSync('.').forEach(file => console.log('  - ' + file));
