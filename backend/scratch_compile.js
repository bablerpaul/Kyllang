const fs = require('fs');
const path = require('path');
const solc = require('solc');

function findImports(importPath) {
    if (importPath.startsWith('@openzeppelin/')) {
        try {
            // Strip @version if present, e.g. @openzeppelin/contracts@4.9.3/... -> @openzeppelin/contracts/...
            let cleanPath = importPath.replace(/@openzeppelin\/contracts@[^\/]+\//, '@openzeppelin/contracts/');
            return { contents: fs.readFileSync(path.resolve(__dirname, 'node_modules', cleanPath), 'utf8') };
        } catch (e) {
            return { error: 'File not found: ' + e.message };
        }
    }
    // Also try local contracts
    try {
        return { contents: fs.readFileSync(path.resolve(__dirname, 'contracts', importPath), 'utf8') };
    } catch (e) {
        return { error: 'File not found' };
    }
}

const contractsDir = path.resolve(__dirname, 'contracts');
const files = fs.readdirSync(contractsDir).filter(f => f.endsWith('.sol'));

const sources = {};
for (const file of files) {
    sources[file] = { content: fs.readFileSync(path.join(contractsDir, file), 'utf8') };
}

const input = {
    language: 'Solidity',
    sources: sources,
    settings: {
        outputSelection: {
            '*': {
                '*': ['*']
            }
        }
    }
};

console.log("Compiling contracts...");
const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));

let hasError = false;
if (output.errors) {
    for (const err of output.errors) {
        if (err.severity === 'error') {
            console.error(err.formattedMessage);
            hasError = true;
        } else {
            // Uncomment to see warnings
            // console.warn(err.formattedMessage);
        }
    }
}

if (!hasError) {
    console.log("All contracts compiled successfully without errors!");
} else {
    console.log("Compilation failed.");
    process.exit(1);
}
