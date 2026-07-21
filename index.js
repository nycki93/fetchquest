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

/**
 * @argument {Document} doc 
 * @argument {Element} el 
 * */
function repackPost(doc, el) {
  imgUri = el.querySelector('a:has(img)')?.getAttribute('href');
  imgName = imgUri?.split('/').at(-1);
  const img = doc.createElement('img');
  img.setAttribute('src', `res/${imgName}`);
  img.setAttribute('alt', imgName);
  const wrapper = doc.createElement('div');
  wrapper.classList.add('img-wrapper');
  wrapper.appendChild(img);
  content = el.querySelector('blockquote');
  const post = doc.createElement('div');
  post.classList.add('post');
  post.appendChild(wrapper);
  post.appendChild(content);
  return { imgUri, imgName, post };
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

  const { imgUri, imgName, post } = repackPost(doc, oldDoc.querySelector('#delform'));
  pending.push(download(`${path}/res/${imgName}`, `https://questden.org${imgUri}`));
  post.classList.add('cover');
  doc.body.appendChild(post);

  // extract image replies
  const replies = oldDoc.querySelectorAll('.reply');
  let breakAdded = true;
  for (const reply of replies) {
    const { imgUri, imgName, post } = repackPost(doc, reply);

    // add a marker when an image post follows a non-image post.
    if (!imgUri) {
      breakAdded = false;
      continue;
    }
    if (!breakAdded) {
      const breakDiv = doc.createElement('div');
      breakDiv.classList.add('post-break');
      doc.body.appendChild(breakDiv);
      breakAdded = true;
    }

    pending.push(download(`${path}/res/${imgName}`, `https://questden.org${imgUri}`));
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
