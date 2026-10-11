import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Export the real app as one offline HTML file, without a server or CDN.
const dist = resolve('dist');
const assetDirectory = resolve(dist, 'assets');
const assets = await readdir(assetDirectory);
const javascriptFile = assets.find(name => /^index-.*\.js$/.test(name));
const stylesheetFile = assets.find(name => /^index-.*\.css$/.test(name));
if (!javascriptFile || !stylesheetFile) throw new Error('Build the application before exporting its preview.');
let javascript = await readFile(resolve(assetDirectory, javascriptFile), 'utf8');
let stylesheet = await readFile(resolve(assetDirectory, stylesheetFile), 'utf8');

const urls = [...stylesheet.matchAll(/url\(([^)]+)\)/g)];
for (const [expression, rawUrl] of urls) {
  const url = rawUrl.replace(/^['"]|['"]$/g, '');
  if (!url.startsWith('/assets/')) throw new Error(`Unexpected stylesheet resource: ${url}`);
  const data = await readFile(resolve(dist, url.slice(1)));
  stylesheet = stylesheet.replace(expression, `url(data:font/woff2;base64,${data.toString('base64')})`);
}

const plan = await readFile(resolve(dist, 'college-plan.pdf'));
const favicon = await readFile(resolve(dist, 'favicon.svg'));
const licenses = await readFile(resolve(dist, 'third-party-licenses.txt'), 'utf8');
javascript = javascript.replaceAll('/college-plan.pdf', '#embedded-college-plan');
javascript = javascript.replace(/<\/script/gi, '<\\/script');
const planLoader = `
(() => {
  const bytes = Uint8Array.from(atob(${JSON.stringify(plan.toString('base64'))}), char => char.charCodeAt(0));
  const planUrl = URL.createObjectURL(new Blob([bytes], {type:'application/pdf'}));
  document.addEventListener('click', event => {
    const link = event.target instanceof Element && event.target.closest('a.source-link');
    if (link && link.getAttribute('href') === '#embedded-college-plan') link.href = planUrl;
  }, {capture:true});
})();`;
const escapeHTML = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#164c3d">
<title>كليتي الذكية | Smart College</title>
<link rel="icon" href="data:image/svg+xml;base64,${favicon.toString('base64')}">
<style>${stylesheet}</style>
</head>
<body>
<div id="app"></div>
<noscript>يحتاج الموقع إلى JavaScript لعرض المبنى والملاحة التفاعلية.</noscript>
<template id="third-party-licenses">${escapeHTML(licenses)}</template>
<script>${planLoader}</script>
<script type="module">${javascript}</script>
</body>
</html>`;
const output = resolve(process.argv[2] || 'dist/smart-college-preview.html');
await writeFile(output, html);
console.log(`Standalone interactive preview saved: ${output} (${Buffer.byteLength(html)} bytes)`);
