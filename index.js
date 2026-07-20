const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const jsdom = require('jsdom');

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

function getCoverPage(dom) {
  const form = dom.window.document.querySelector('#delform');
  const imgSrc = form.querySelector('a:has(img)').getAttribute('href');
  const title = form.querySelector('.filetitle').textContent.trim();
  const author = form.querySelector('.postername').textContent.trim();
  const desc = form.querySelector('blockquote').textContent.trim();
  return { imgSrc, title, author, desc };
}

function * getPosts(dom) {
  yield getCoverPage(dom);
  for (const el of dom.window.document.querySelectorAll('.reply')) {
    const imgLink = el.querySelector('a:has(img)');
    const imgSrc = imgLink && imgLink.getAttribute('href');
    const desc = el.querySelector('blockquote').textContent.trim();
    yield { imgSrc, desc };
  }
}

// TODO: set this up like the slime quest demo from nycki.net
function writeHtml({ imgSrc, desc }) {
  return `
    <div class="post">
      <img src="${imgSrc}" height=10em>
      <p>${desc}</p>
    </div>
  `;
}

async function main() {
  await saveHtml();

  const dom = await jsdom.JSDOM.fromFile('_tmp/quest.html');

  for (const p of getPosts(dom)) {
    if (!p.imgSrc) continue;
    console.log(p.imgSrc);
    console.log(p.desc);
  }
  
  console.log('ok.');
  process.exit(0);
}

main();
