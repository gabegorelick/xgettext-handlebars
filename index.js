'use strict';

var Handlebars = require('handlebars');

var DEFAULT_IDENTIFIERS = (function () {
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
var CONTEXT_DELIMITER = String.fromCharCode(4);

function messageToKey (msgid, msgctxt) {
  return msgctxt ? msgctxt + CONTEXT_DELIMITER + msgid : msgid;
}

/**
 * Given a Handlebars template string returns the list of i18n strings.
 *
 * @param template {string} Handlebars template
 * @param {object} options
 * @return {object} set of translatable strings
 */
function xgettext (template, options) {
  options = options || {};
  var identifiers = options.identifiers || DEFAULT_IDENTIFIERS;
  var defaultDomain = options.defaultDomain || 'messages';
  var commentIdentifiers = options.commentIdentifiers || ['gettext-comment'];
  var filename = options.filename;

  // sanity check identifiers
  Object.keys(identifiers).forEach(function (id) {
    if (identifiers[id].indexOf('msgid') === -1) {
      throw new Error('Every id must have a msgid parameter, but "' + id + '" doesn\'t have one');
    }
  });

  var msgs = {};

  var Visitor = Handlebars.Visitor;

  function GettextExtractor () {}
  GettextExtractor.prototype = new Visitor();

  var extract = function (statement) {
    var path = statement.path;
    var params = statement.params;

    if (Object.keys(identifiers).indexOf(path.original) === -1) {
      return;
    }

    var spec = identifiers[path.original];
    var msgidParam = params[spec.indexOf('msgid')];

    if (msgidParam) { // don't extract {{gettext}} without param
      var msgid = msgidParam.value;
      var contextIndex = spec.indexOf('msgctxt');

      var context = null; // null context is *not* the same as empty context
      if (contextIndex >= 0) {
        var contextParam = params[contextIndex];
        if (!contextParam) {
          // throw an error if there's supposed to be a context but not enough
          // parameters were passed to the handlebars helper
          throw new Error('Expected a context for msgid "' + msgid + '" but none was given');
        }
        if (contextParam.type !== 'StringLiteral') {
          throw new Error('Context must be a string literal (msgid "' + msgid + '")');
        }

        context = contextParam.value;
      }

      var domain = defaultDomain;
      var domainIndex = spec.indexOf('domain');
      if (domainIndex !== -1) {
        var domainParam = params[domainIndex];
        if (!domainParam) {
          throw new Error('Expected a domain for msgid "' + msgid + '" but none was given');
        }
        if (domainParam.type !== 'StringLiteral') {
          throw new Error('Domain must be a string literal (msgid "' + msgid + '")');
        }

        domain = domainParam.value;
      }

      msgs[domain] = msgs[domain] || {};
      var key = messageToKey(msgid, context);
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
        if (pluralParam.type !== 'StringLiteral') {
          throw new Error('Plural must be a string literal for msgid ' + msgid);
        }

        var plural = pluralParam.value;
        var existingPlural = message.msgid_plural;
        if (plural && existingPlural && existingPlural !== plural) {
          throw new Error('Incompatible plural definitions for msgid "' + msgid +
          '" ("' + message.msgid_plural + '" and "' + plural + '")');
        }
      }

      // return AST so consumer has as much information as possible
      message.ast = statement;

      var loc = statement.loc;
      message.references.push({
        filename: filename,
        start: {
          line: loc.start.line,
          column: loc.start.column
        },
        end: {
          line: loc.end.line,
          column: loc.end.column
        }
      });

      spec.forEach(function (prop, i) {
        var param = params[i];
        if (!param) {
          return;
        }

        if (param.type !== 'StringLiteral') {
          if (prop === 'domain' || prop === 'msgid' || prop === 'msgctxt' || prop === 'msgid_plural') {
            // Non-string literals mean you're extracting a variable or something else
            // funky that doesn't gel with gettext-style workflows
            console.warn('WARNING: Extracting non-string literal `' + param.value + '`');
          }
        }

        var knownFields = DEFAULT_IDENTIFIERS.dcnpgettext;
        if (knownFields.indexOf(prop) !== -1) {
          // field name doesn't conflict with anything, we can save it at top level
          message[prop] = params[i].value;
        }

        // save all fields under .fields to prevent collisions
        message.fields[prop] = params[i].value;
      });

      // extract comments
      params.forEach(function (param) {
        if (param.type !== 'SubExpression') {
          return;
        }

        var id = param.path.original;
        if (commentIdentifiers.indexOf(id) === -1) {
          return;
        }

        if (!param.params[0]) {
          throw new Error('Helper "' + id + '" has no parameters. Expected a comment string.');
        } else if (param.params[0].type !== 'StringLiteral') {
          throw new Error("Can't extract non-string comment");
        }

        message.extractedComments.push(param.params[0].value);

        // continue iterating, in case there are more
        // subexpression with comments
      });
    }
  };

  GettextExtractor.prototype.MustacheStatement = function (statement) {
    extract(statement);
    Visitor.prototype.MustacheStatement.call(this, statement);
  };

  GettextExtractor.prototype.SubExpression = function (expression) {
    extract(expression);
    Visitor.prototype.SubExpression.call(this, expression);
  };

  var ast = Handlebars.parse(template);
  new GettextExtractor().accept(ast);

  return msgs;
}

xgettext.DEFAULT_IDENTIFIERS = DEFAULT_IDENTIFIERS;
xgettext.CONTEXT_DELIMITER = CONTEXT_DELIMITER;
xgettext.messageToKey = messageToKey;

module.exports = xgettext;
