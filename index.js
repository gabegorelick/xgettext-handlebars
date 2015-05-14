'use strict';

var Handlebars = require('handlebars');
var search = require('binary-search');
var PO = require('pofile');

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
 * @param String template The content of a HBS template.
 * @return Object The list of translatable strings, the line(s) on which each appears and an optional plural form.
 */
Parser.prototype.parse = function (template) {
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
            firstLine: statement.firstLine,
            firstColumn: statement.firstColumn,
            lastLine: statement.lastLine,
            lastColumn: statement.lastColumn
          });

          spec.forEach(function(prop, i) {
            var param = params[i];
            if (param && param.type === 'STRING') {
              var knownFields = Parser.DEFAULT_IDENTIFIERS.dcnpgettext;
              if (knownFields.indexOf(prop) !== -1) {
                // field name doesn't conflict with anything, we can save it at top level
                message[prop] = params[i].string;
              }

              // save all fields under .fields to prevent collisions
              message.fields[prop] = params[i].string;
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

/**
 *
 * @param strings - the result of a call to `.parse()`
 */
Parser.prototype.addStrings = function addStrings (strings) {
  var parser = this;
  Object.keys(strings).forEach(function (domain) {
    if (!parser.strings[domain]) {
      // we haven't encountered this domain yet
      parser.strings[domain] = strings[domain];

      // TODO add missing fields like references
      return;
    }

    Object.keys(strings[domain]).forEach(function (key) {
      var message = strings[domain][key];
      var existingMessage = parser.strings[domain][key];

      if (!existingMessage) {
        // we haven't encountered this domain/msgid/msgctxt combination yet
        parser.strings[domain][key] = message;
        return;
      }

      // We've seen this domain/string/context combination before,
      // need to add references, extracted comments, and plural

      var references = message.references || [];
      references.forEach(function (reference) {
        var i = search(existingMessage.references, reference, function(a, b) {
          var filename = a.filename || '';
          return filename.localeCompare(b.filename || '') ||
            (a.firstLine || 0) - (b.firstLine || 0) ||
            (a.firstColumn || 0) - (b.firstColumn || 0) ||
            0;
        });
        if (i < 0) { // don't add duplicate references
          // when not found, binary-search returns -(index_where_it_should_be + 1)
          existingMessage.references.splice(Math.abs(i + 1), 0, reference);
        }
      });

      var extractedComments = message.extractedComments || [];
      extractedComments.forEach(function (comment) {
        if (existingMessage.extractedComments.indexOf(comment) === -1) {
          // TODO sort
          existingMessage.extractedComments.push(comment);
        }
      });

      // don't overwrite existing plurals if new string doesn't have one
      if (message.msgid_plural) {
        if (existingMessage.msgid_plural && existingMessage.msgid_plural !== message.msgid_plural) {
          throw new Error('Mismatched plural definitions for msgid ' + message.msgid);
        }

        existingMessage.msgid_plural = message.msgid_plural;
      }
    });
  });
};

/**
 *
 * @returns {Array} array of pofile instances, 1 for each domain
 */
Parser.prototype.toPOs = function toPOs () {
  var strings = this.strings;
  var pos = Object.keys(strings).map(function (domain) {
    var po = new PO();
    po.headers = {
      // standard PO headers most software expects
      'Content-Type': 'text/plain; charset=UTF-8',
      'Content-Transfer-Encoding': '8bit',
      'Project-Id-Version': ''
    };

    // pofile doesn't have a notion of domain, but we need to add this so consumers
    // know what domain a catalog corresponds to
    po.domain = domain;

    Object.keys(strings[domain]).forEach(function (key) {
      var message = strings[domain][key];
      var item = new PO.Item();
      item.msgid = message.msgid;
      item.msgctxt = message.msgctxt;
      item.msgid_plural = message.msgid_plural;
      item.extractedComments = message.extractedComments.map(function (c) {
        return c; // this will change once #8 is implemented
      });

      // convert references to strings
      item.references = message.references.reduce(function (refs, r) {
        if (!r.filename && !r.firstLine && r.firstLine !== 0) {
          // don't add empty references
          return refs;
        }

        var ref = r.filename || '';
        if (r.firstLine || r.firstLine === 0) {
          ref += ':' + r.firstLine;
        }

        refs.push(ref);
        return refs;
      }, []);

      po.items.push(item);
    });

    // sort entries by msgid, then context
    po.items.sort(function (a, b) {
      return a.msgid.localeCompare(b.msgid) ||
        (a.msgctxt || '').localeCompare(b.msgctxt || '') ||
        0;
    });

    return po;
  });

  // sort PO files by domain
  pos.sort(function (a, b) {
    var domain = a.domain || '';
    return domain.localeCompare(b.domain || '');
  });

  return pos;
};

module.exports = Parser;
