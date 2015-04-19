# xgettext-handlebars

> Extract translatable strings from [Handlebars](http://handlebarsjs.com) templates.

## Warning
**This code is unstable and going through a major rewrite.**

## Usage

```javascript
var Parser = require('xgettext-handlebars');

var parser = new Parser();
parser.parse('{{gettext "Hello World!"}}');
```

## Features

### Basic extraction
```handlebars
{{gettext "Hello World!"}}
```

### Plurals
```handlebars
{{ngettext "boat" "boats" numBoats}}
```
[gettext documentation on plural forms](https://www.gnu.org/software/gettext/manual/html_node/Plural-forms.html)

### Contexts
Necessary to disambiguate things like homonyms:
```handlebars
{{pgettext "noun" "file"}}
```
[gettext documentation on contexts](https://www.gnu.org/software/gettext/manual/html_node/Contexts.html)

### Domains
Useful for splitting your translation catalogs up:
```handlebars
{{dgettext "plugin_catalog" "Hello World!"}}
```
[gettext documentation on domains](https://www.gnu.org/software/gettext/manual/html_node/Ambiguities.html)

### Extracted comments
Useful for providing instructions to your localizers. Comments are extracted
from [Handlebars subexpressions](http://handlebarsjs.com/expressions.html#subexpressions):
```handlebars
{{gettext "Hi %s" (gettext-comment "%s is a variable")}}
```
[gettext documentation on extracted comments](https://www.gnu.org/software/gettext/manual/html_node/PO-Files.html)

## API

### `new Parser([options])`

Instantiates a parser. Accepts a single, optional options object, consisting
of:

#### `identifiers`

Set of identifiers to extract. Defaults to every function in the standard
gettext API, plus a common shorthand version of each function:
```javascript
{
  gettext: ['msgid'],
  _: ['msgid'],

  dgettext: ['domain', 'msgid'],
  d_: ['domain', 'msgid'],

  dcgettext: ['domain', 'msgid', 'category'],
  dc_: ['domain', 'msgid', 'category'],

  ngettext: ['msgid', 'msgid_plural', 'n'],
  n_: ['msgid', 'msgid_plural', 'n'],

  dngettext: ['domain', 'msgid', 'msgid_plural', 'n'],
  dn_: ['domain', 'msgid', 'msgid_plural', 'n'],

  dcngettext: ['domain', 'msgid', 'msgid_plural', 'n', 'category'],
  dcn_: ['domain', 'msgid', 'msgid_plural', 'n', 'category'],

  pgettext: ['msgctxt', 'msgid'],
  p_: ['msgctxt', 'msgid'],

  dpgettext: ['domain', 'msgctxt', 'msgid'],
  dp_: ['domain', 'msgctxt', 'msgid'],

  npgettext: ['msgctxt', 'msgid', 'msgid_plural', 'n'],
  np_: ['msgctxt', 'msgid', 'msgid_plural', 'n'],

  dnpgettext: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n'],
  dnp_: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n'],

  dcnpgettext: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n', 'category'],
  dcnp_: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n', 'category']
}
```
Each key in `identifiers` indicates a Handlebars helper to extract, while the value indicates
the order of expected PO fields for that helper. For example,
`npgettext: ['msgctxt', 'msgid', 'msgid_plural']` indicates that the `npgettext`
handlebars helper takes arguments of the form
`{{npgettext "context" "string" "plural"}}`.

The default `identifiers` assumes you're using helpers that match the gettext API, but you
can customize it to fit your needs. See the [Examples section](#examples) for more info.

While `identifiers` allows for a large amount of freedom, there are some limits. Since
`xgettext-handlebars` can't do much without knowing a string's message ID, each
extracted identifier *must* declare a `msgid`. For example, the following will
throw an Error:
```javascript
new Parser({
  // error, no msgid specified
  i18n: ['string']
});
```

Similarly, if you want strings with the same msgid to be distinguished by
their contexts, use `msgctxt`. Otherwise, contexts won't work. Likewise,
domain parameters should be called `domain`.

Finally, you should name your plural message ID `msgid_plural`. Otherwise, `xgettext-handlebars`
can't warn you about mismatched plural definitions like the following:
```handlebars
{{ngettext "goose" "goose"}}
{{ngettext "goose" "geese"}}
{{! error, should we use "goose" or "geese"?}}
```

#### `defaultDomain`

Optional string indicating the default domain. Defaults to `messages`.

#### `commentIdentifiers`

Optional array of strings indicating names of subexpressions to extract
comments from. Defaults to `['gettext-comment']`.

### `.parse(template)`

Parses the string `template` for Handlebars expressions to extract.
Returns an object with the following structure:
```javascript
{
  "domain": { // defaults to "messages"
    msgid1: {
      msgid: 'msgid1', // useful when you have context
      extractedComments: [
        // Extracted comments are different from translator comments.
        // Extracted comments come from the developers who put them in the
        // code. Translator comments are added to PO files by translators.
        'TRANSLATORS: please listen to me'
      ],
      references: [ // list of all the places this msgid is used
        {
          firstLine: 1,
          firstColumn: 10,
          lastColumn: 20,
          lastLine: 1
        }
        // there can be more references if this msigd appears multiple times
      ]
    },
    boat: {
      msgid: 'boat',
      msgid_plural: 'boats',
      references: [/* ...you get the idea...*/],
      extractedComments: []
    },

    // Messages with context are stored as keys prefixed by their context
    // and a separator. This is the same technique Jed uses.
    "context\u0004msgid1": {
      msgid: 'msgid1',
      msgctxt: 'context',
      references: [/* ... */]
    }
  },
  "another domain": {
    // if you define multiple domains in your strings, by using the dgettext
    // family of functions, you'll get multiple domains in your ouput
  }
}
```

## Examples

### Changing field order

Changing the field order is useful if your helpers' signatures don't match the
gettext API. For example, if your Handlebars helper `ngettext` expects the plural
form to be passed first, initialize `xgettext-handlebars` like so:
```javascript
new Parser({
  ngettext: ['msgid_plural', 'msgid']
  // declare other identifiers as needed
});
```

### Custom identifiers

You can define totally new identifiers to extract, for example:
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
