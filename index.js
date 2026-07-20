const fs = require('node:fs/promises');
const { Readable } = require('node:stream');



async function saveHtml() {
  try {
    await fs.access('_tmp/quest.html');
  } catch (err) {
    if (err.code == 'ENOENT') {
      // file does not exist, fetch it now
      const res = await fetch('https://questden.org/kusaba/questarch/res/1002454.html');
      await fs.writeFile('_tmp/quest.html', Readable.fromWeb(res.body));
    } else {
      // unknown error, log it
      console.log(err);
    }
  }
}

async function main() {
  await saveHtml();
  
  console.log('ok.');
  process.exit(0);
}

main();
