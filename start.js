const { spawn } = require('child_process');
const path = require('path');

const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';

const backend = spawn('node', ['index.js'], {
    cwd: path.join(__dirname, 'BackEnd'),
    stdio: ['ignore', 'pipe', 'pipe']
});

const frontend = spawn(npm, ['start'], {
    cwd: path.join(__dirname, 'FrontEnd'),
    stdio: ['ignore', 'pipe', 'pipe']
});

function pipe(proc, label) {
    proc.stdout.on('data', (d) => process.stdout.write(`[${label}] ${d}`));
    proc.stderr.on('data', (d) => process.stderr.write(`[${label}] ${d}`));
    proc.on('exit', (code) => console.log(`[${label}] exited with code ${code}`));
}

pipe(backend, 'backend');
pipe(frontend, 'frontend');

function shutdown() {
    backend.kill();
    frontend.kill();
    process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);