'use strict';

var Handlebars = require('handlebars');

function Parser (options) {
  // make new optional
  if (!(this instanceof Parser)) {
    return new Parser(options);
  }

  options = options || {};

  var identifiers = options.identifiers || Parser.DEFAULT_IDENTIFIERS;

  Object.keys(identifiers).forEach(function (id) {
    if (identifiers[id].indexOf('msgid') === -1) {
      throw new Error('Every id must have a msgid parameter, but "' + id + '" doesn\'t have one');
    }
  });

  this.identifiers = identifiers || Parser.DEFAULT_IDENTIFIERS;

  // domain to be used when none is specified
  if (options.defaultDomain || options.defaultDomain === '') { // empty domain is a valid domain
    this.defaultDomain = options.defaultDomain;
  } else {
    this.defaultDomain = 'messages';
  }

  // name of subexpressions to extract comments from
  this.commentIdentifiers = options.commentIdentifiers || ['gettext-comment'];
  if (!Array.isArray(this.commentIdentifiers)) {
    this.commentIdentifiers = [this.commentIdentifiers];
  }

  this.strings = {};
}

Parser.DEFAULT_IDENTIFIERS = (function () {
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

  return Object.keys(specs).reduce(function (identifiers, id) {
    // Add commonly used shorthands for each helper:
    // gettext -> _, dgettext -> d_, dcgettext -> dc_, etc.
    identifiers[id.replace('gettext', '_')] = identifiers[id];
    return identifiers;
  }, specs);
})();

// Same as what Jed.js uses
Parser.CONTEXT_DELIMITER = String.fromCharCode(4);

Parser.messageToKey = function (msgid, msgctxt) {
  return msgctxt ? msgctxt + Parser.CONTEXT_DELIMITER + msgid : msgid;
};

/**
 * Given a Handlebars template string returns the list of i18n strings.
 *
 * @param template {string} The content of a HBS template.
 * @param {object} options Currently just filename
 * @return {object} The list of translatable strings, the line(s) on which each appears and an optional plural form.
 */
Parser.prototype.parse = function (template, options) {
  options = options || {};
  var filename = options.filename;

  var collectMsgs = function (msgs, statement) {
    statement = statement.sexpr || statement;

    if (statement.type === 'sexpr') {
      if (Object.keys(this.identifiers).indexOf(statement.id.string) !== -1) {
        var spec = this.identifiers[statement.id.string];
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

          var domain = this.defaultDomain;
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
          msgs[domain][key] = msgs[domain][key] || {
            extractedComments: [],
            references: [],
            fields: {} // extracted fields get placed here so they don't clobber anything
          };
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

          // return AST so consumer has as much information as possible
          message.ast = statement;

          message.references.push({
            filename: filename,
            firstLine: statement.firstLine,
            firstColumn: statement.firstColumn,
            lastLine: statement.lastLine,
            lastColumn: statement.lastColumn
          });

          spec.forEach(function(prop, i) {
            var param = params[i];
            if (!param) {
              return;
            }

            if (param.type !== 'STRING') {
              if (prop === 'domain' || prop === 'msgid' || prop === 'msgctxt' || prop === 'msgid_plural') {
                // Non-string literals mean you're extracting a variable or something else
                // funky that doesn't gel with gettext-style workflows
                console.warn('WARNING: Extracting non-string literal `' + param.string + '`');
              }
            }

            var knownFields = Parser.DEFAULT_IDENTIFIERS.dcnpgettext;
            if (knownFields.indexOf(prop) !== -1) {
              // field name doesn't conflict with anything, we can save it at top level
              message[prop] = params[i].string;
            }

            // save all fields under .fields to prevent collisions
            message.fields[prop] = params[i].string;
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
