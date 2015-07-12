'use strict';

var Handlebars = require('handlebars');
var Catalog = require('gettext-catalog');

/**
 * Given a Handlebars template string returns the list of i18n strings.
 *
 * @param template {string} Handlebars template
 * @param {object} options
 * @return {object} set of translatable strings
 */
function xgettext (template, options) {
  options = options || {};
  var identifiers = options.identifiers || Catalog.DEFAULT_IDENTIFIERS;
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

    if (!msgidParam) {
      throw new Error('No msgid');
    }

    if (msgidParam.type !== 'StringLiteral') {
      // don't extract variables
      return;
    }

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
        // Don't extract if context isn't a string literal.
        // Hopefully they've statically defined this message somewhere else
        return;
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
        // don't extract if domain isn't a string literal
        return;
      }

      domain = domainParam.value;
    }

    var key = Catalog.messageToKey(msgid, context);

    var pluralIndex = spec.indexOf('msgid_plural');
    if (pluralIndex !== -1) {
      var pluralParam = params[pluralIndex];
      if (!pluralParam) {
        throw new Error('No plural specified for msgid "' + msgid + '"');
      }
      if (pluralParam.type !== 'StringLiteral') {
        return;
      }

      if (msgs[domain] && msgs[domain][key]) {
        // there's an existing message, check it's plural form to make sure it matches
        var plural = pluralParam.value;
        var existingPlural = msgs[domain][key].msgid_plural;

        if (plural && existingPlural && existingPlural !== plural) {
          throw new Error('Incompatible plural definitions for msgid "' + msgid +
            '" ("' + existingPlural + '" and "' + plural + '")');
        }
      }
    }

    // only add message to catalog after we've sanity checked it
    msgs[domain] = msgs[domain] || {};
    msgs[domain][key] = msgs[domain][key] || {
      extractedComments: [],
      references: [],
      fields: {} // extracted fields get placed here so they don't clobber anything
    };
    var message = msgs[domain][key];

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

      var knownFields = Catalog.DEFAULT_IDENTIFIERS.dcnpgettext;
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
        // there's no good reason to have a variable comment, since comments are
        // only useful for extraction
        throw new Error("Can't extract non-string comment");
      }

      message.extractedComments.push(param.params[0].value);

      // continue iterating, in case there are more
      // subexpression with comments
    });
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

module.exports = xgettext;
