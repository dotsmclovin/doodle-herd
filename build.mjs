import { readFile, writeFile } from 'node:fs/promises';
const [html, css, engine, app] = await Promise.all(['index.html', 'styles.css', 'engine.js', 'app.js'].map(file => readFile(new URL(file, import.meta.url), 'utf8')));
const standalone = html
  .replace('<link rel="stylesheet" href="styles.css">', `<style>\n${css}\n</style>`)
  .replace('<script src="engine.js"></script>', `<script>\n${engine.replace(/<\/script/gi, '<\\/script')}\n</script>`)
  .replace('<script src="app.js"></script>', `<script>\n${app.replace(/<\/script/gi, '<\\/script')}\n</script>`);
await writeFile(new URL('doodle-herd.html', import.meta.url), standalone);
console.log(`Built doodle-herd.html (${Buffer.byteLength(standalone)} bytes); no external assets or dependencies`);
