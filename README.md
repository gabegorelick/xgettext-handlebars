# xgettext-handlebars

> Extract translatable strings from [Handlebars](http://handlebarsjs.com) templates.

## Warning
**This code is unstable and going through a major rewrite.**

## API

### `new Parser(keywordspec)`

Creates a new parser.
The `keywordspec` parameter is optional, with the default being:
```javascript
{
  gettext: ['msgid'],
  _: ['msgid'],

  ngettext: ['msgid', 'msgid_plural'],
  n_: ['msgid', 'msgid_plural'],

  pgettext: ['msgctxt', 'msgid'],
  p_: ['msgctxt', 'msgid'],

  npgettext: ['msgctxt', 'msgid', 'msgid_plural'],
  np_: ['msgctxt', 'msgid', 'msgid_plural']
}
```
Each keyword (key) requires array of strings indicating the order of expected PO fields.
For example `npgettext: ['msgctxt', 'msgid', 'msgid_plural']` indicates that the
`npgettext` handlebars helper takes arguments of form `{{npgettext "context" "string" "plural" ...}}`

### `.parse(template)`

Parses the string `template` for Handlebars expressions using the keywordspec.
It returns an object with this structure:
```javascript
{
  msgid1: {
    line: [1, 3]
  },
  msgid2: {
    line: [2],
    plural: 'msgid_plural'
  },
  "context\u0004msgid2": {
    line: [4]
  }
}
```

## License
MIT
