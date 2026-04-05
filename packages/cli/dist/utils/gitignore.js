"use strict";
/**
 * Gitignore Updater Utility
 *
 * Ensures .neurcode directory is added to .gitignore
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureNeurcodeInGitignore = ensureNeurcodeInGitignore;
const fs_1 = require("fs");
const path_1 = require("path");
const GITIGNORE_FILE = '.gitignore';
const NEURCODE_IGNORE_DIR = '.neurcode/';
/**
 * Ensure .neurcode is in .gitignore
 */
function ensureNeurcodeInGitignore(cwd = process.cwd()) {
    const gitignorePath = (0, path_1.join)(cwd, GITIGNORE_FILE);
    // If .gitignore doesn't exist, create it
    if (!(0, fs_1.existsSync)(gitignorePath)) {
        const block = [
            '# Neurcode local runtime state (never commit)',
            NEURCODE_IGNORE_DIR,
            '',
        ].join('\n');
        (0, fs_1.writeFileSync)(gitignorePath, block, 'utf-8');
        return;
    }
    // Read existing .gitignore
    const content = (0, fs_1.readFileSync)(gitignorePath, 'utf-8');
    const lines = content.split('\n').map(line => line.trim());
    const hasIgnoreDir = lines.includes(NEURCODE_IGNORE_DIR) || lines.includes('.neurcode');
    if (hasIgnoreDir) {
        return;
    }
    const blockLines = [];
    blockLines.push('# Neurcode local runtime state (never commit)');
    blockLines.push(NEURCODE_IGNORE_DIR);
    const block = blockLines.join('\n');
    const newContent = content.trimEnd() + (content.endsWith('\n') ? '' : '\n') + block + '\n';
    (0, fs_1.writeFileSync)(gitignorePath, newContent, 'utf-8');
}
//# sourceMappingURL=gitignore.js.map