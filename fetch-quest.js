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
  console.log(`downloading ${uri}`);
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
  console.log(`fetching quest ${id}`);

  let path = `${dir}/${id}`;
  let oldDom;
  if (await fileExists(`${path}/index-original.html`)) {
    console.log(`reusing index-original.html`);
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
  doc.body.appendChild(titleEl);
  // TODO: style author's name as subtitle
  const author = oldDoc.querySelector('#delform .postername').textContent.trim();
  const authorEl = oldDoc.createElement('template');
  authorEl.innerHTML = `
    <span class="subtitle">by ${author}</span>
  `;
  doc.body.appendChild(authorEl.content);

  // move to output folder if none specified
  let title = id;
  if (addTitle) {
    title = `${titleEl.textContent.trim()} [${id}]`;
  }
  const newPath = `${dir}/${title} [${id}]`;
  await fs.mkdir(newPath, { recursive: true });
  path = newPath;

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
  return path;
}

async function paginate(questDir, questUri) {
  const everything = `${questDir}/everything.html`;
  if (await fileExists(everything)) {
    console.log('reusing everything.html');
  } else {
    console.log('combining posts into everything.html');
    await fs.copyFile(`${questDir}/index.html`, everything);

  }
  const mainDom = await JSDOM.fromFile(everything);
  
  const clone = async () => {
    let dom = await JSDOM.fromFile(everything);
    dom.window.document.body.innerHTML = '';
    return dom;
  }

  const pages = [];
  let nextPage = await clone();
  for (const el of mainDom.window.document.querySelectorAll('body > *')) {
    if (el.classList.contains('post-break')) {
      pages.push(nextPage);
      nextPage = await clone();
      continue;
    }
    nextPage.window.document.body.appendChild(el);
  }
  pages.push(nextPage);

  for (let i = 0; i < pages.length; i += 1) {
    const doc = pages[i].window.document;

    // move later pages into sub-folders
    if (i > 0) {
      for (const el of doc.querySelectorAll('img')) {
        el.setAttribute('src', '../' + el.getAttribute('src'));
      }
      for (const el of doc.querySelectorAll('link[rel="stylesheet"')) {
        el.setAttribute('href', '../' + el.getAttribute('href'));
      }
    }

    // add nav links
    const t = doc.createElement('template');
    t.innerHTML = `
      ${
        (i == 0) ? `<span class="next">> <a href="page-2/">==&gt;</a></span>`
        : (i < pages.length - 1) ? `<span class="next">> <a href="../page-${i+2}/">==&gt;</a></span>`
        : ''
      }
      <nav>
        <ul>
          ${
            (i == 0) ? `<li><a href=".">Start Over</a></li>`
            : `<li><a href="../">Start Over</a></li>`
          }
          ${
            (i == 0) ? ''
            : (i == 1) ? `<li><a href="../">Go Back</a></li>`
            : `<li><a href="../page-${i}">Go Back</a></li>`
          }
          <li><a href="${questUri}">Questden<a></li>
        </ul>
      </nav>
    `;
    doc.body.appendChild(t.content);

    let html = pages[i].serialize();
    html = await prettier.format(html, { parser: 'html' });
    let dir = (i == 0) ? questDir : `${questDir}/page-${i+1}`;
    await fs.mkdir(dir, { recursive: true });
    console.log(`writing ${dir}/`);
    await fs.writeFile(`${dir}/index.html`, html);
  }
}

async function main() {
  let questUri = 'https://questden.org/kusaba/quest/res/1129477.html';
  if (process.argv.length > 2) {
    questUri = process.argv[2];
  }
  const questDir = await fetchQuest('_out', questUri);
  await paginate(questDir, questUri);
}

main();
