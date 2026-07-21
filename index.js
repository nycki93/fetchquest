const fs = require('node:fs/promises');
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

async function download(path, uri) {
  if (await fileExists(path)) return;
  const res = await fetch(uri);
  await fs.writeFile(path, res.body);
}

async function fetchQuest(dir, uri, title=null) {
  let path = `${dir}/${title ?? '_tmp'}`;
  let oldDom;
  if (await fileExists(`${path}/index-original.html`)) {
    oldDom = await JSDOM.fromFile(`${path}/index-original.html`);
  } else {
    oldDom = await JSDOM.fromURL(uri);
  }
  const oldDoc = oldDom.window.document;
  const dom = new JSDOM(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>quest</title>
    <link rel="stylesheet" href="style.css">
    </head>
    <body></body>
    </html>
  `);

  const doc = dom.window.document;
  const titleEl = oldDoc.querySelector('#delform .filetitle');
  // TODO: style author's name as subtitle
  // doc.body.appendChild(oldDoc.querySelector('#delform .postername'));
  doc.body.appendChild(titleEl);

  // move to output folder if none specified
  if (!title) {
    title = titleEl.textContent.trim();
    const newPath = `${dir}/${title}`;
    await fs.mkdir(newPath, { recursive: true });
    path = newPath;
  }
  if (!await fileExists(`${path}/index-original.html`)) {
    await fs.writeFile(`${path}/index-original.html`, oldDom.serialize());
  }

  // download images as needed
  await fs.mkdir(`${path}/res/`, { recursive: true });
  const pending = [];
  pending.push(fs.copyFile('style.css', `${path}/style.css`));
  
  const cover = doc.createElement('div');
  cover.classList.add('post', 'cover');
  const coverImgLink = oldDoc.querySelector('#delform a:has(img)').getAttribute('href');
  const coverImgName = coverImgLink.split('/').at(-1);
  pending.push(download(`${path}/res/${coverImgName}`, `https://questden.org${coverImgLink}`));
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
  let breakAdded = true;
  for (const reply of replies) {
    const imgLink = reply.querySelector('a:has(img)')?.getAttribute('href');

    // add a marker when an image post follows a non-image post.
    if (!imgLink) {
      breakAdded = false;
      continue;
    }
    if (!breakAdded) {
      const breakDiv = doc.createElement('div');
      breakDiv.classList.add('post-break');
      doc.body.appendChild(breakDiv);
      breakAdded = true;
    }
    
    const imgName = imgLink.split('/').at(-1);
    pending.push(download(`${path}/res/${imgName}`, `https://questden.org${imgLink}`));

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
  await fs.writeFile(`${path}/index.html`, dom.serialize());
}

async function main() {
  await fetchQuest('_out', 'https://questden.org/kusaba/quest/res/1129477.html');
}

main();
