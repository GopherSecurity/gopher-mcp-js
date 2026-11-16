#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkVersion(name, version, run = spawnSync) {
  const result = run(
    'npm',
    ['view', `${name}@${version}`, 'version', '--json'],
    {
      encoding: 'utf8',
    }
  );
  if (result.error) throw result.error;
  let data;
  try {
    data = JSON.parse(result.stdout);
  } catch {
    /* Reject malformed results below. */
  }
  if (result.status === 0 && data === version) return true;
  if (result.status !== 0 && data?.error?.code === 'E404') return false;
  throw new Error(
    `Unable to verify ${name}@${version}: npm registry lookup failed`
  );
}

if (require.main === module) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(process.argv[2] || 'package.json'), 'utf8')
    );
    const exists = checkVersion(pkg.name, pkg.version);
    if (process.env.GITHUB_OUTPUT) {
      fs.appendFileSync(process.env.GITHUB_OUTPUT, `exists=${exists}\n`);
    }
    console.log(
      `${pkg.name}@${pkg.version}: ${exists ? 'already published; skipping publish' : 'not published yet'}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { checkVersion };
