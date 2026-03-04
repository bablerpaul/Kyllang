import fs from 'fs';
const text = fs.readFileSync('build_error.txt', 'utf16le');
fs.writeFileSync('build_err_utf8.txt', text, 'utf8');
