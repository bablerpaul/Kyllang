import fs from 'fs';
import { execSync } from 'child_process';
try {
    execSync('npm run build', { stdio: 'pipe' });
} catch (e) {
    fs.writeFileSync('true_error.txt', e.stderr ? e.stderr.toString() : e.stdout.toString(), 'utf8');
}
