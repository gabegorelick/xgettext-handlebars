'use strict';

var Handlebars = require('handlebars');

function Parser (options) {
  // make new optional
  if (!(this instanceof Parser)) {
    return new Parser(options);
  }

  options = options || {};

  // n and category shouldn't be needed in your PO files, but we try to mirror
  // the gettext API as much as possible
  var specs = {
    gettext: ['msgid'],
    dgettext: ['domain', 'msgid'],
    dcgettext: ['domain', 'msgid', 'category'],
    ngettext: ['msgid', 'msgid_plural', 'n'],
    dngettext: ['domain', 'msgid', 'msgid_plural', 'n'],
    dcngettext: ['domain', 'msgid', 'msgid_plural', 'n', 'category'],
    pgettext: ['msgctxt', 'msgid'],
    dpgettext: ['domain', 'msgctxt', 'msgid'],
    npgettext: ['msgctxt', 'msgid', 'msgid_plural', 'n'],
    dnpgettext: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n'],
    dcnpgettext: ['domain', 'msgctxt', 'msgid', 'msgid_plural', 'n', 'category']
  };

  // TODO rename identifiers
  var keywords = options.keywords || Object.keys(specs).reduce(function (keywords, key) {
    // Add commonly used shorthands for each helper:
    // gettext -> _, dgettext -> d_, dcgettext -> dc_, etc.
    keywords[key.replace('gettext', '_')] = keywords[key];
    return keywords;
  }, specs);

  Object.keys(keywords).forEach(function (keyword) {
    if (keywords[keyword].indexOf('msgid') === -1) {
      throw new Error('Every keyword must have a msgid parameter, but "' + keyword + '" doesn\'t have one');
    }
  });

  this.keywords = keywords;

  if (options.domain || options.domain === '') { // empty domain is a valid domain
    this.domain = options.domain;
  } else {
    this.domain = Parser.DEFAULT_DOMAIN;
  }

  // name of subexpressions to extract comments from
  this.commentIdentifiers = options.commentIdentifiers || ['gettext-comment'];
  if (!Array.isArray(this.commentIdentifiers)) {
    this.commentIdentifiers = [this.commentIdentifiers];
  }
}

Parser.DEFAULT_DOMAIN = 'messages';

// Same as what Jed.js uses
Parser.CONTEXT_DELIMITER = String.fromCharCode(4);

Parser.messageToKey = function (msgid, msgctxt) {
  return msgctxt ? msgctxt + Parser.CONTEXT_DELIMITER + msgid : msgid;
};

/**
 * Given a Handlebars template string returns the list of i18n strings.
 *
 * @param String template The content of a HBS template.
 * @return Object The list of translatable strings, the line(s) on which each appears and an optional plural form.
 */
Parser.prototype.parse = function (template) {
  var collectMsgs = function (msgs, statement) {
    statement = statement.sexpr || statement;

    if (statement.type === 'sexpr') {
      if (Object.keys(this.keywords).indexOf(statement.id.string) !== -1) {
        var spec = this.keywords[statement.id.string];
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
              throw new Error('Expected a context for msgid "' + msgid + '" but none was given');
            }
            if (contextParam.type !== 'STRING') {
              throw new Error('Context must be a string literal (msgid "' + msgid + '")');
            }

            context = contextParam.string;
          }

          var domain = this.domain;
          var domainIndex = spec.indexOf('domain');
          if (domainIndex !== -1) {
            var domainParam = params[domainIndex];
            if (!domainParam) {
              throw new Error('Expected a domain for msgid "' + msgid + '" but none was given');
            }
            if (domainParam.type !== 'STRING') {
              throw new Error('Domain must be a string literal (msgid "' + msgid + '")');
            }

            domain = domainParam.string;
          }

          msgs[domain] = msgs[domain] || {};
          var key = Parser.messageToKey(msgid, context);
          msgs[domain][key] = msgs[domain][key] || {extractedComments: [], references: []};
          var message = msgs[domain][key];

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
            var existingPlural = message.msgid_plural;
            if (plural && existingPlural && existingPlural !== plural) {
              throw new Error('Incompatible plural definitions for msgid "' + msgid +
                '" ("' + message.msgid_plural + '" and "' + plural + '")');
            }
          }

          message.references.push({
            firstLine: statement.firstLine,
            firstColumn: statement.firstColumn,
            lastLine: statement.lastLine,
            lastColumn: statement.lastColumn
          });

          spec.forEach(function(prop, i) {
            var param = params[i];
            if (param && param.type === 'STRING') {
              message[prop] = params[i].string;
            }
          });

          // extract comments
          statement.params.forEach(function (param) {
            if (param.type !== 'sexpr') {
              return;
            }

            var id = param.id.string;
            if (this.commentIdentifiers.indexOf(id) === -1) {
              return;
            }

            if (!param.params[0]) {
              throw new Error('Helper "' + id + '" has no parameters. Expected a comment string.');
            } else if (param.params[0].type !== 'STRING') {
              throw new Error("Can't extract non-string comment");
            }

            message.extractedComments.push(param.params[0].string);

            // continue iterating, in case there are more
            // subexpression with comments
          }.bind(this));
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
  }.bind(this);

  return Handlebars.parse(template).statements.reduce(collectMsgs, {});
};

module.exports = Parser;
