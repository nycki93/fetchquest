const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const jsdom = require('jsdom');

async function fetchQuest(path, uri) {
  try {
    await fs.access(path);
  } catch (err) {
    if (err.code == 'ENOENT') {
      // file does not exist, fetch it now
      const res = await fetch(uri);
      await fs.writeFile(path, Readable.fromWeb(res.body));
    } else {
      // unknown error, log it
      console.log(err);
    }
  }
}

function getCoverPage(dom) {
  const form = dom.window.document.querySelector('#delform');
  const imgSrc = form.querySelector('a:has(img)').getAttribute('href');
  const title = form.querySelector('.filetitle').textContent.trim();
  const author = form.querySelector('.postername').textContent.trim();
  const desc = form.querySelector('blockquote').textContent.trim();
  return { imgSrc, title, author, desc, index: 0 };
}

function * getPosts(dom) {
  yield getCoverPage(dom);
  let i = 1;
  for (const el of dom.window.document.querySelectorAll('.reply')) {
    const imgLink = el.querySelector('a:has(img)');
    const imgSrc = imgLink && imgLink.getAttribute('href');
    const desc = el.querySelector('blockquote').textContent.trim();
    yield { imgSrc, desc, index: i };
    i += 1;
  }
}

// TODO: set this up like the slime quest demo from nycki.net
function pageHtml({ imgSrc, questTitle, title, desc }) {
  const pageTitle = (questTitle) ? `${questTitle} | ${title}` : title;
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${pageTitle}</title>
  <link rel="stylesheet" href="../style.css">
</head>
<body>
  <main>
    <h1>${title}</h1>
    <img src="${imgSrc}" height=10em>
    <p>
      ${desc}
    </p>
  </main>
</body>
</html>
  `;
}

async function main() {
  await fs.mkdir('_tmp', {recursive: true});
  await fs.mkdir('_out', {recursive: true});
  await fs.copyFile('style.css', '_out/style.css');

  await fetchQuest('_tmp/quest.html', 'https://questden.org/kusaba/questarch/res/1002454.html');
  const dom = await jsdom.JSDOM.fromFile('_tmp/quest.html');

  let questTitle = '';
  for (const p of getPosts(dom)) {
    const { title, imgSrc, desc, index } = p;
    if (!imgSrc) continue;
    
    const html = pageHtml({ questTitle, title, imgSrc, desc });
    await fs.mkdir(`_out/p${index}/`, { recursive: true });
    await fs.writeFile(`_out/p${index}/index.html`, html);

    if (!questTitle) {
      questTitle = title;
    }
    break;
  }
  
  console.log('ok.');
  process.exit(0);
}

main();
