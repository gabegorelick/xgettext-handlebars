'use strict';

var Handlebars = require('handlebars');

function Parser (keywordSpec) {
  // make new optional
  if (!(this instanceof Parser)) {
    return new Parser(keywordSpec);
  }

  var gettextSpec = ['msgid'];
  var ngettextSpec = ['msgid', 'msgid_plural'];
  var pgettextSpec = ['msgctxt', 'msgid'];
  var npgettextSpec = ['msgctxt', 'msgid', 'msgid_plural'];

  keywordSpec = keywordSpec || {
    gettext: gettextSpec,
    _: gettextSpec,

    ngettext: ngettextSpec,
    n_: ngettextSpec,

    pgettext: pgettextSpec,
    p_: pgettextSpec,

    npgettext: npgettextSpec,
    np_: npgettextSpec
  };

  Object.keys(keywordSpec).forEach(function (keyword) {
    if (keywordSpec[keyword].indexOf('msgid') === -1) {
      throw new Error('Every keyword must have a msgid parameter, but "' + keyword + '" doesn\'t have one');
    }
  });

  this.keywordSpec = keywordSpec;
}

// Same as what Jed.js uses
Parser.contextDelimiter = String.fromCharCode(4);

Parser.messageToKey = function (msgid, msgctxt) {
  return msgctxt ? msgctxt + Parser.contextDelimiter + msgid : msgid;
};

/**
 * Given a Handlebars template string returns the list of i18n strings.
 *
 * @param String template The content of a HBS template.
 * @return Object The list of translatable strings, the line(s) on which each appears and an optional plural form.
 */
Parser.prototype.parse = function (template) {
  var keywordSpec = this.keywordSpec;
  var keywords = Object.keys(keywordSpec);
  var tree = Handlebars.parse(template);

  var collectMsgs = function (msgs, statement) {
    statement = statement.sexpr || statement;

    if (statement.type === 'sexpr') {
      if (keywords.indexOf(statement.id.string) !== -1) {
        var spec = keywordSpec[statement.id.string];
        var params = statement.params;
        var msgidParam = params[spec.indexOf('msgid')];

        if (msgidParam) { // don't extract {{gettext}} without param
          var msgid = msgidParam.string;
          var contextIndex = spec.indexOf('msgctxt');

          var context = null; // null context is *not* the same as empty context
          if (contextIndex >= 0) {
            var contextParam = params[contextIndex];
            if (!contextParam) {
              // throw an error if there's supposed to be a context but not enough
              // parameters were passed to the handlebars helper
              throw new Error('No context specified for msgid "' + msgid + '"');
            }
            if (contextParam.type !== 'STRING') {
              throw new Error('Context must be a string literal for msgid "' + msgid + '"');
            }

            context = contextParam.string;
          }

          var key = Parser.messageToKey(msgid, context);
          msgs[key] = msgs[key] || {line: []};

          // make sure plural forms match
          var pluralIndex = spec.indexOf('msgid_plural');
          if (pluralIndex !== -1) {
            var pluralParam = params[pluralIndex];
            if (!pluralParam) {
              throw new Error('No plural specified for msgid "' + msgid + '"');
            }
            if (pluralParam.type !== 'STRING') {
              throw new Error('Plural must be a string literal for msgid ' + msgid);
            }

            var plural = pluralParam.string;
            var existingPlural = msgs[key].msgid_plural;
            if (plural && existingPlural && existingPlural !== plural) {
              throw new Error('Incompatible plural definitions for msgid "' + msgid +
                '" ("' + msgs[key].msgid_plural + '" and "' + plural + '")');
            }
          }

          msgs[key].line.push(statement.firstLine);

          spec.forEach(function(prop, i) {
            var param = params[i];
            if (param && param.type === 'STRING') {
              msgs[key][prop] = params[i].string;
            }
          });
        }
      }

      statement.params.reduce(collectMsgs, msgs);
    } else if (statement.type === 'block') {
      if (statement.program) {
        statement.program.statements.reduce(collectMsgs, msgs);
      }

      if (statement.inverse) {
        statement.inverse.statements.reduce(collectMsgs, msgs);
      }
    }

    return msgs;
  };

  return tree.statements.reduce(collectMsgs, {});
};

module.exports = Parser;
