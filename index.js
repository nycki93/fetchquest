const fs = require('node:fs/promises');
const { Readable } = require('node:stream');
const { JSDOM } = require('jsdom');

async function fileExists(path) {
  try {
    await fs.access(path);
  } catch (err) {
    if (err.code == 'ENOENT') {
      return false;
    }
    throw err;
  }
  return true;
}

async function fetchQuest(path, uri) {
  if (!await fileExists(path)) {
    const res = await fetch(uri);
    await fs.writeFile(path, Readable.fromWeb(res.body));
  }
}

async function fetchImage(path, uri) {
  if (await fileExists(path)) return;
  const res = await fetch(uri);
  await fs.writeFile(path, res.body);
}

async function fetchQuest2(path, uri) {
  let oldDom;
  if (await fileExists(`${path}/quest-raw.html`)) {
    oldDom = await JSDOM.fromFile(`${path}/quest-raw.html`);
  } else {
    oldDom = await JSDOM.fromURL(uri);
    await fs.writeFile(`${path}/quest-raw.html`, oldDom.serialize());
  }
  const oldDoc = oldDom.window.document;
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>quest</title>
    <link rel="stylesheet" href="../style2.css">
    </head>
    <body></body>
    </html>
  `);
  const doc = dom.window.document;

  // download images as needed
  await fs.mkdir(`${path}/res/`, { recursive: true });
  const pending = [];

  // extract cover
  const cover = doc.createElement('div');
  doc.body.appendChild(oldDoc.querySelector('#delform .filetitle'));
  // TODO: style author's name as subtitle
  // doc.body.appendChild(oldDoc.querySelector('#delform .postername'));
  cover.classList.add('post', 'cover');
  
  const coverImgLink = oldDoc.querySelector('#delform a:has(img)').getAttribute('href');
  const coverImgName = coverImgLink.split('/').at(-1);
  pending.push(fetchImage(`${path}/res/${coverImgName}`, `https://questden.org${coverImgLink}`));
  const coverImg = doc.createElement('img');
  coverImg.setAttribute('src', `./res/${coverImgName}`);
  coverImg.setAttribute('alt', coverImgName);
  const coverImgWrapper = doc.createElement('div');
  coverImgWrapper.classList.add('img-wrapper');
  coverImgWrapper.appendChild(coverImg);
  cover.appendChild(coverImgWrapper);

  cover.appendChild(oldDoc.querySelector('#delform blockquote'));
  doc.body.appendChild(cover);

  // extract image replies
  const replies = oldDoc.querySelectorAll('.reply');
  for (const reply of replies) {
    const imgLink = reply.querySelector('a:has(img)')?.getAttribute('href');
    if (!imgLink) continue;
    const imgName = imgLink.split('/').at(-1);
    pending.push(fetchImage(`${path}/res/${imgName}`, `https://questden.org${imgLink}`));

    const post = doc.createElement('div');
    post.classList.add('post');
    const img = doc.createElement('img');
    img.setAttribute('src', `./res/${imgName}`);
    img.setAttribute('alt', imgName);
    const imgWrapper = doc.createElement('div');
    imgWrapper.classList.add('img-wrapper');
    imgWrapper.appendChild(img);
    post.appendChild(imgWrapper);
    post.appendChild(reply.querySelector('blockquote'));
    doc.body.appendChild(post);
  }

  // remove unnecessary js
  for (const el of doc.querySelectorAll('.spoiler')) {
    el.removeAttribute('onmouseover');
    el.removeAttribute('onmouseout');
  }

  await Promise.all(pending);
  await fs.writeFile(`${path}/quest2.html`, dom.serialize());
}

async function fetchImages(path, posts) {
  return Promise.all(posts.map(async (post) => {
    const uri = post.imgSrc;
    const name = uri.split('/').at(-1);
    if (await fileExists(`${path}/${name}`)) return;
    console.log(`fetching ${uri}`);
    const res = await fetch(uri);
    await fs.writeFile(`${path}/${name}`, res.body);
  }));
}

function getCoverPage(dom) {
  const form = dom.window.document.querySelector('#delform');
  const imgSrc = `https://questden.org/${form.querySelector('a:has(img)').getAttribute('href')}`;
  const title = form.querySelector('.filetitle').textContent.trim();
  const author = form.querySelector('.postername').textContent.trim();
  const desc = form.querySelector('blockquote').textContent.trim();
  return { imgSrc, title, author, desc, id: 0 };
}

function * getPosts(dom) {
  yield getCoverPage(dom);
  let id = 1;
  for (const el of dom.window.document.querySelectorAll('.reply')) {
    const imgLink = el.querySelector('a:has(img)');
    const imgSrc = imgLink && `https://questden.org${imgLink.getAttribute('href')}`;
    const desc = el.querySelector('blockquote').textContent.trim();
    yield { desc, id, imgSrc };
    id += 1;
  }
}

// TODO: set this up like the slime quest demo from nycki.net
function pageHtml({ imgSrc, questTitle, title, desc, nextPage }) {
  title = title ?? '==&gt;';
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
        <section>
          <img src="${imgSrc}">
          <p>
            ${desc}
          </p>
        </section>
      </main>
      ${nextPage && `
        <span class="next">&gt; <a href="${nextPage}">==&gt;</a></span>
      `}
      <nav>
        <ul>
          <li><a href="../p0">Start Over</a></li>
          <li><a href="../p0">Go Back</a></li>
        </ul>
      </nav>
    </body>
    </html>
  `;
}

async function main() {
  await fs.mkdir('_tmp', {recursive: true});
  await fs.mkdir('_out', {recursive: true});
  await fs.copyFile('style.css', '_out/style.css');

  await fetchQuest('_tmp/quest.html', 'https://questden.org/kusaba/questarch/res/1002454.html');
  const dom = await JSDOM.fromFile('_tmp/quest.html');

  let questTitle = '';
  const imagePosts = Array.from(getPosts(dom)).filter(p => p.imgSrc);
  await fetchImages('_out', imagePosts);

  for (let i = 0; i < imagePosts.length; i += 1) {
    const { title, imgSrc, desc } = imagePosts[i];
    if (!imgSrc) continue;
    
    const nextPage = (imagePosts[i+1] ? `../p${i+1}/` : null);
    
    const html = pageHtml({ questTitle, title, imgSrc, desc, nextPage });
    await fs.mkdir(`_out/p${i}/`, { recursive: true });
    await fs.writeFile(`_out/p${i}/index.html`, html);

    if (!questTitle) {
      questTitle = title;
    }
  }

  console.log('ok.');
  process.exit(0);
}

async function main2() {
  await fetchQuest2('_tmp', 'https://questden.org/kusaba/quest/res/1129477.html');
}

main2();
