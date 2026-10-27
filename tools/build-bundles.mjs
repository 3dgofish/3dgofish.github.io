#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transformSync } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const cssSources = [
  'static/css/noto-sans.css',
  'static/css/bulma.min.css',
  'static/css/theme.css',
  'static/css/rhythm.css',
  'static/css/icons.css',
  'static/css/pdf-modal.css',
  'static/css/index.css',
  'static/css/interactions.css',
  'static/css/slideshow.css',
  'static/css/unibrep.css',
  'static/css/gofish-comparison.css',
  'static/css/logo-modal.css',
];

const jsSources = [
  'static/js/slideshow.js',
  'static/js/script.js',
  'static/js/pdf-modal.js',
  'static/js/theme-switcher.js',
  'static/js/gofish-comparison.js',
  'static/js/teaser-comparison.js',
  'static/js/inview-video.js',
  'static/js/logo-modal.js',
];

function bundle(sources, destination, banner) {
  let output = [banner, ...sources.map(source => {
    const contents = readFileSync(join(root, source), 'utf8').trimEnd();
    return `\n/* Source: ${source} */\n${contents}\n`;
  })].join('\n');

  // CSS comments account for most of this template's transfer size because the
  // source files intentionally document every layout decision in detail. Keep
  // readable sources and /*! license/build notices, but omit prose from delivery.
  if (destination.endsWith('.css')) {
    output = output
      .replace(/\/\*(?!\!)[\s\S]*?\*\//g, '')
      .replace(/[ \t]+$/gm, '')
      .replace(/\n{3,}/g, '\n\n');
  }

  output = transformSync(output, {
    loader: destination.endsWith('.css') ? 'css' : 'js',
    minify: true,
    legalComments: 'inline',
    charset: 'utf8',
  }).code;

  writeFileSync(join(root, destination), output, 'utf8');
  console.log(`${destination}: ${sources.length} sources, ${Buffer.byteLength(output)} bytes`);
}

bundle(
  cssSources,
  'static/css/site.css',
  '/*! Generated and minified by tools/build-bundles.mjs. Edit the source stylesheets, then rebuild. */',
);

bundle(
  jsSources,
  'static/js/site.js',
  '/*! Generated and minified by tools/build-bundles.mjs. Edit the source scripts, then rebuild. */',
);
