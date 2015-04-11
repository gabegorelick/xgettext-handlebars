# xgettext-handlebars

> Extract translatable strings from [Handlebars](http://handlebarsjs.com) templates.

## Warning
**This code is unstable and going through a major rewrite.**

## Features

Supports [plurals](https://www.gnu.org/software/gettext/manual/html_node/Plural-forms.html) and
[contexts](https://www.gnu.org/software/gettext/manual/html_node/Contexts.html). Will eventually
support [domains](https://www.gnu.org/software/gettext/manual/html_node/Ambiguities.html) and
[extracted comments](https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html) as well.

## Usage

```javascript
var Parser = require('xgettext-handlebars');

var parser = new Parser();
parser.parse('{{gettext "Hello World!"}}');
```

## API

### `new Parser([spec])`

Creates a new parser.

The `spec` parameter is optional, with the default being:
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
Each key in `spec` indicates a Handlebars helper to extract, while the value indicates
the order of expected PO fields for that helper. For example
`npgettext: ['msgctxt', 'msgid', 'msgid_plural']` indicates that the `npgettext`
handlebars helper takes arguments of the form
`{{npgettext "context" "string" "plural"}}`.

The default `spec` assumes you're using helpers that match the gettext API, but you
can customize it to fit your needs. See the [Examples section](#examples) for more info.

While `spec` allows for a large amount of freedom, there are some limits. Since
`xgettext-handlebars` can't do much without knowing a string's message ID, each
extracted keyword *must* declare a `msgid`. For example, the following will
throw an Error:
```javascript
new Parser({
  // error, no msgid specified
  i18n: ['string']
});
```

Similarly, if you want strings with the same msgid to be distinguished by
their contexts, use `msgctxt`. Otherwise, contexts won't work. Finally, you
should name your plural message ID `msgid_plural`. Otherwise, `xgettext-handlebars`
can't warn you about mismatched plural definitions like the following:
```handlebars
{{ngettext "goose" "goose"}}
{{ngettext "goose" "geese"}}
{{! error, should we use "goose" or "geese"?}}
```

### `.parse(template)`

Parses the string `template` for Handlebars expressions to extract.
Returns an object with the following structure:
```javascript
{
  msgid1: {
    msgid: 'msgid1',
    line: [1, 3]
  },
  msgid2: {
    msgid: 'msgid2',
    line: [2],
    msgid_plural: 'msgid_plural'
  },
  "context\u0004msgid2": {
    msgid: 'msgid2',
    msgctxt: '',
    line: [4]
  }
}
```

## Examples

### Changing field order

Changing the field order is useful if your helpers' signatures don't match the
gettext api. For example, if your Handlebars helper `ngettext` expects the plural
form to be first, initialize `xgettext-handlebars` like so:
```javascript
new Parser({
  ngettext: ['msgid_plural', 'msgid']
  // declare other keywords as needed
});
```

### Custom keywords

You can define totally new keywords to extract, for example:
```javascript
new Parser({
  i18n: ['msgid']
});
```
would allow you to extract something like:
```handlebars
{{i18n "foo"}}
```

### Custom fields

You don't have to limit yourself to extracting
[gettext fields](https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html).
For example, let's say you mark the gender of your strings (a field gettext doesn't
otherwise support) like so:
```handlebars
{{i18n-gender "You" "female"}}
```
Extracting this gender parameter is easy:
```javascript
new Parser({
  'i18n-gender': ['msgid', 'gender']
});
```
`parse()` will subsequently include the `gender` field in its output for this message:
```javascript
{
  msgid: 'You',
  gender: 'female'
  // other fields not shown
}
```

### Ignoring arguments

`xgettext-handlebars` ignores any extra arguments it encounters.
Take this example, using the default config for `gettext` (`['msgid']`):
```handlebars
{{! ignored will be ignored, only "message" will be extracted}}
{{gettext "message" ignored}}
```

### Skipping arguments

Ignoring non-trailing arguments is also possible. Let's say you want to extract something of the form
```handlebars
{{i18n variable "Hi %s"}}
```
The first parameter to `i18n` is a variable and shouldn't be extracted, while
the second field, the msgid, is what we actually care about. We can use
xgettext-handlebar's support for custom fields to ignore fields we don't want:
```javascript
new Parser({
  i18n: ['parameter', 'msgid']
});
```
Note that the parameter will still technically be extracted, it's just in
a field nothing uses. Here's the extracted message for the above example:
```javascript
{
  msgid: 'Hi %s',
  parameter: 'variable'
}
```

## License
MIT
