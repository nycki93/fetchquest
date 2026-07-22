# fetchquest

a questden archiver for your static website

## usage

first time:
```
npm install
```

second tries:
```
npm run fetch-quest <url>
```

take a trip to the mountains:
```
npm run preview
```

## todo

- [x] import css from last time I did this
- [x] download page text
- [x] download images
- [x] convert each image into a separate page with a "==>" link
- [ ] if the post is replying to a command, use that as the link text instead
- [x] if there are several posts in a row with no commands in between, consolidate them into one page
- [x] fix "Go Back" link
- [ ] override: "manual break" in the middle of a chain, in case you don't want images to be consolidated into one post
- [ ] override: "skip", in case there's an image that isn't part of your story
- [x] oh heck questden has spoiler markup? add support for that too.
- [x] install a dev server so you can test out the navigation while working on this
- [ ] use the original filenames instead of the questden file ids, when possible
- [ ] save extracted text and images in an intermediate json format for overrides
