/**
 * 建置腳本
 *
 * 用 esbuild 的 JS API 而非命令列，唯一的理由是**授權聲明**：
 * standalone 產物整包內嵌 lunar-javascript，而 MIT 條款要求
 * 「The above copyright notice and this permission notice shall be included
 * in all copies or substantial portions of the Software」。
 * `--minify` 會剝掉原始碼中的註解，且 lunar.js 本身沒有 banner，
 * 兩頭都掉，故必須由建置端明文補上——授權全文塞不進一行 npm script。
 *
 * 聲明中的版本號直接讀自 node_modules，因此相依套件一升版，
 * 產物即隨之改變，CI 的 `git diff --quiet -- dist/` 就會擋下未重建的提交。
 * 這順帶成為相依漂移的偵測器：lunar-javascript 曾在 patch 版更動 ΔT 參數，
 * 而 ΔT 直接決定節氣交接時刻。
 */

import { build } from 'esbuild';
import { readFileSync, writeFileSync } from 'fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const pkg = JSON.parse(read('./package.json'));
const dep = JSON.parse(read('./node_modules/lunar-javascript/package.json'));
const depLicense = read('./node_modules/lunar-javascript/LICENSE').trim();

const selfBanner =
`/*!
 * ${pkg.name} v${pkg.version} — ${pkg.description}
 * ${pkg.homepage || 'https://github.com/arc119226/qimen_dunjia'}
 * Licensed under ${pkg.license}.
 */`;

const thirdPartyBanner =
`/*!
 * This bundle embeds the following third-party software.
 *
 * lunar-javascript v${dep.version}
 * ${dep.homepage}
 *
${depLicense.split('\n').map(line => ` * ${line}`.trimEnd()).join('\n')}
 */`;

const common = {
    entryPoints: ['index.js'],
    bundle: true,
    minify: true,
    legalComments: 'inline'
};

// ESM 產物不內嵌 lunar-javascript（外部相依），故只需自身聲明
await build({
    ...common,
    format: 'esm',
    outfile: 'dist/qimen.min.js',
    external: ['lunar-javascript'],
    banner: { js: selfBanner }
});

// standalone 產物整包內嵌 lunar-javascript，必須隨附其授權全文
await build({
    ...common,
    format: 'iife',
    globalName: 'Qimen',
    outfile: 'dist/qimen.standalone.min.js',
    banner: { js: `${selfBanner}\n${thirdPartyBanner}` }
});

// 同一份聲明另存一檔，隨 release zip 散布
writeFileSync(
    new URL('./dist/THIRD-PARTY-LICENSES.txt', import.meta.url),
    `${pkg.name} v${pkg.version} 的打包產物 dist/qimen.standalone.min.js
內嵌下列第三方軟體。dist/qimen.min.js 不內嵌，改以外部相依方式引入。

本檔由 build.mjs 自 node_modules 直接產生，請勿手動編輯。

================================================================================
lunar-javascript v${dep.version}
${dep.homepage}

${depLicense}
================================================================================
`,
    'utf8'
);

console.log('dist/qimen.min.js、dist/qimen.standalone.min.js、dist/THIRD-PARTY-LICENSES.txt 已產生');
