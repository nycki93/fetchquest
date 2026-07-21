const fs = require('node:fs/promises');

const prettier = require('prettier');
const { JSDOM } = require('jsdom');

async function fileExists(path) {
  try { 
    await fs.access(path) 
  } catch (err) {
    if (err.code == 'ENOENT') return false;
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
  const imgUri = el.querySelector('a:has(img)')?.getAttribute('href');
  const imgName = imgUri?.split('/').at(-1);
  const img = doc.createElement('img');
  img.setAttribute('src', `res/${imgName}`);
  img.setAttribute('alt', imgName);
  const wrapper = doc.createElement('div');
  wrapper.classList.add('img-wrapper');
  wrapper.appendChild(img);

  const content = el.querySelector('blockquote');
  const leadingDiv = content.querySelector('div:first-child');
  if (leadingDiv) {
    content.removeChild(leadingDiv);
  }
  
  const post = doc.createElement('div');
  post.classList.add('post');
  post.appendChild(wrapper);
  post.appendChild(content);
  return { imgUri, imgName, post };
}

/** 
 * @param {string} dir 
 * @param {string} uri 
 */
async function fetchQuest(dir, uri, addTitle=true) {
  const id = uri.match(/([^/.]+)\.[^/.]+$/)[1];
  let path = `${dir}/${id}`;
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
  if (addTitle) {
    const title = titleEl.textContent.trim();
    const newPath = `${dir}/${title} [${id}]`;
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

  // extract image replies
  const replies = [oldDoc.querySelector('#delform'), ...oldDoc.querySelectorAll('.reply')];
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
  let html = dom.serialize();
  html = await prettier.format(html, { parser: 'html' });
  await fs.writeFile(`${path}/index.html`, html);
}

async function main() {
  let questUri = 'https://questden.org/kusaba/quest/res/1129477.html';
  if (process.argv.length > 2) {
    questUri = process.argv[2];
  }
  await fetchQuest('_out', questUri);
}

main();
