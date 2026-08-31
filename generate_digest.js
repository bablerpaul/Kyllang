const fs = require('fs');
const path = require('path');

const rootDir = __dirname;
const outputFile = path.join(rootDir, 'CODEBASE_DIGEST_FOR_GEMINI.md');

const includedExtensions = ['.circom', '.sol', '.js', '.jsx', '.ts', '.tsx', '.json', '.example'];
const excludedDirs = ['node_modules', 'dist', 'build', '.git', 'coverage', 'cache', 'artifacts', 'typechain-types'];
const excludedFiles = ['package-lock.json', 'yarn.lock'];

// Helper to walk directories
function walkDir(dir, fileList = []) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            if (!excludedDirs.includes(file)) {
                walkDir(filePath, fileList);
            }
        } else {
            const ext = path.extname(file);
            if (includedExtensions.includes(ext) || file === '.env.example') {
                if (!excludedFiles.includes(file)) {
                    fileList.push(filePath);
                }
            }
        }
    }
    return fileList;
}

const allFiles = walkDir(rootDir);

let markdown = `# CODEBASE_DIGEST_FOR_GEMINI\n\n`;

// SECTION 1: Architecture & Repository Map
markdown += `## SECTION 1: Architecture & Repository Map\n\n`;
allFiles.forEach(file => {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    markdown += `- \`${relPath}\`\n`;
});
markdown += `\n`;

function stripCommentsAndWhitespace(code, ext) {
    if (ext === '.json') return code; // Don't strip JSON
    
    // Remove block comments
    let stripped = code.replace(/\/\*[\s\S]*?\*\//g, '');
    
    // Remove single line comments
    stripped = stripped.replace(/\/\/.*/g, '');
    
    // Remove empty lines
    stripped = stripped.split('\n').filter(line => line.trim() !== '').join('\n');
    
    return stripped;
}

// SECTION 2: Exact Cryptographic & Smart Contract Logic
markdown += `## SECTION 2: Exact Cryptographic & Smart Contract Logic\n\n`;
allFiles.forEach(file => {
    const ext = path.extname(file);
    if (ext === '.sol' || ext === '.circom') {
        const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
        markdown += `### ${relPath}\n\`\`\`${ext === '.sol' ? 'solidity' : 'circom'}\n`;
        markdown += fs.readFileSync(file, 'utf8') + `\n\`\`\`\n\n`;
    }
});

// SECTION 3: Backend Services, Cryptographic Workers & Controllers
markdown += `## SECTION 3: Backend Services, Cryptographic Workers & Controllers\n\n`;
allFiles.forEach(file => {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    if (relPath.startsWith('backend/') && (relPath.endsWith('.js') || relPath.endsWith('.ts'))) {
        markdown += `### ${relPath}\n\`\`\`javascript\n`;
        markdown += stripCommentsAndWhitespace(fs.readFileSync(file, 'utf8'), path.extname(file)) + `\n\`\`\`\n\n`;
    }
});

// SECTION 4: Frontend State, Workers & Cryptographic Bridges
markdown += `## SECTION 4: Frontend State, Workers & Cryptographic Bridges\n\n`;
allFiles.forEach(file => {
    const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
    if (relPath.startsWith('certificate-portal/') && (relPath.endsWith('.js') || relPath.endsWith('.jsx') || relPath.endsWith('.ts') || relPath.endsWith('.tsx'))) {
        markdown += `### ${relPath}\n\`\`\`javascript\n`;
        markdown += stripCommentsAndWhitespace(fs.readFileSync(file, 'utf8'), path.extname(file)) + `\n\`\`\`\n\n`;
    }
});

fs.writeFileSync(outputFile, markdown);
console.log('Digest generated successfully at ' + outputFile);
