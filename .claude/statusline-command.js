#!/usr/bin/env node
// Claude Code statusline (Dalmiro, Windows). Node — NOT bash+jq (jq absent on this machine).
// Renders a single color-coded line:
//   user | branch | model | $cost | ctx:N% | 5H:N% | 7D:N%
// Each segment only if present, joined by " | ".

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const C = {
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  magenta: '\x1b[35m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
};
const paint = (color, text) => `${color}${text}${C.reset}`;

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

let data = {};
const raw = readStdin();
try {
  data = JSON.parse(raw || '{}');
} catch {
  data = {};
}

// Share the payload mid-session for DDS-RAG cost capture.
try {
  fs.writeFileSync(path.join(os.tmpdir(), 'statusline-last-input.json'), raw || '{}');
} catch {
  /* best effort */
}

const segments = [];

// user (cyan)
let user = '';
try {
  user = os.userInfo().username;
} catch {
  /* ignore */
}
if (user) segments.push(paint(C.cyan, user));

// git branch (yellow) — run in the workspace dir
const cwd = data?.workspace?.current_dir || process.cwd();
let branch = '';
try {
  branch = execSync('git rev-parse --abbrev-ref HEAD', {
    cwd,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
    .toString()
    .trim();
} catch {
  /* not a repo */
}
if (branch) segments.push(paint(C.yellow, branch));

// model (magenta)
const model = data?.model?.display_name;
if (model) segments.push(paint(C.magenta, model));

// cost (green) — actual billing cost, not token estimate
const cost = data?.cost?.total_cost_usd;
if (typeof cost === 'number') {
  segments.push(paint(C.green, `$${cost.toFixed(4)}`));
}

// context window % used (blue) — already model-aware (Opus 1M vs 200k)
const ctx = data?.context_window?.used_percentage;
if (typeof ctx === 'number') {
  segments.push(paint(C.blue, `ctx:${Math.round(ctx)}%`));
}

// rate limits (red)
const fiveHour = data?.rate_limits?.five_hour?.used_percentage;
if (typeof fiveHour === 'number') {
  segments.push(paint(C.red, `5H:${Math.round(fiveHour)}%`));
}
const sevenDay = data?.rate_limits?.seven_day?.used_percentage;
if (typeof sevenDay === 'number') {
  segments.push(paint(C.red, `7D:${Math.round(sevenDay)}%`));
}

process.stdout.write(segments.join(' | '));
