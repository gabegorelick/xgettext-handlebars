'use strict';

var xgettext = require('..');
var fs = require('fs');
var should = require('should');

describe('xgettext()', function () {
  it('should return results', function (done) {
    fs.readFile(__dirname + '/fixtures/template.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data).messages;

      result.should.containEql('inside block')
      .and.containEql('inside block inverse');

      Object.keys(result).length.should.equal(8);
      result['Image description'].references.length.should.equal(2);

      done();
    });
  });

  it('should combine references', function (done) {
    fs.readFile(__dirname + '/fixtures/references.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data).messages;

      result.duplicate.references.should.eql([
      {
        filename: undefined,
        start: {
          line: 1,
          column: 0
        },
        end: {
          line: 1,
          column: 17
        }
      },
      {
        filename: undefined,
        start: {
          line: 2,
          column: 0
        },
        end: {
          line: 2,
          column: 17
        }
      }
      ]);

      result.unique.references.length.should.equal(1);

      done();
    });
  });

  it('should extract domains', function () {
    var result = xgettext('{{d_ "plugin" "message"}}');

    result.should.containEql('plugin')
    .and.not.containEql('messages');
  });

  it('should allow customizing default domain', function () {
    var result = xgettext('{{_ "hello"}}', {defaultDomain: 'foo'});

    result.should.containEql('foo');
    result.foo.should.containEql('hello');
    result.should.not.containEql('messages');
  });

  it('should return plural results', function (done) {
    fs.readFile(__dirname + '/fixtures/plural.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data).messages;

      Object.keys(result).length.should.equal(2);
      result['default'].msgid_plural.should.equal('defaults');

      done();
    });
  });

  it('should throw an error if there are mismatched plurals', function (done) {
    fs.readFile(__dirname + '/fixtures/mismatched-plurals.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      (function () {xgettext(data);}).should.throw();

      done();
    });
  });

  it('should recognize subexpressions', function (done) {
    fs.readFile(__dirname + '/fixtures/subexpression.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data).messages;

      result.should.containEql('subexpression')
      .and.containEql('%s subexpression');

      result['%s subexpression'].msgid_plural.should.equal('%s subexpressions');

      result.should.containEql('%s %s subexpression');
      result['%s %s subexpression'].msgid_plural.should.equal('%s %s subexpressions');

      result.should.containEql('second')
      .and.containEql('regular')
      .and.containEql('%s %s other')
      .and.containEql('nested %s');

      Object.keys(result).length.should.equal(7);

      done();
    });
  });

  it('should support skipping parameters', function (done) {
    fs.readFile(__dirname + '/fixtures/skip-params.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data, {identifiers: {_: ['variable', 'msgid', 'msgid_plural']}}).messages;

      result.msgid.msgid.should.equal('msgid');
      result.msgid.msgid_plural.should.equal('plural');

      done();
    });
  });

  it('should support extracting unknown fields', function (done) {
    var messages = xgettext('{{_ "Hi" "Foo"}}', {identifiers: {_: ['msgid', 'foo']}}).messages;

    should(messages.Hi.foo).not.be.ok;
    messages.Hi.fields.foo.should.equal('Foo');

    done();
  });

  it('should not overwrite existing fields', function (done) {
    var messages = xgettext('{{_ "Hi" "Foo"}}', {identifiers: {_: ['msgid', 'references']}}).messages;

    // references shouldn't get overwritten by 'Foo'
    messages.Hi.references.should.eql([{
      filename: undefined,
      start: {
        line: 1,
        column: 0
      },
      end: {
        line: 1,
        column: 16
      }
    }]);
    messages.Hi.fields.references.should.equal('Foo');

    done();
  });

  it('should support extracting contexts', function (done) {
    fs.readFile(__dirname + '/fixtures/contexts.hbs', {encoding: 'utf8'}, function (err, data) {
      if (err) {
        throw err;
      }

      var result = xgettext(data).messages;

      var key = xgettext.messageToKey('pgettext_msgid', 'pgettext context');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('pgettext context');

      key = xgettext.messageToKey('p_msgid', 'p_ context');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('p_ context');

      key = xgettext.messageToKey('file', 'noun');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('noun');
      result[key].msgid_plural.should.equal('files');

      key = xgettext.messageToKey('file', 'verb');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('verb');
      result[key].msgid_plural.should.equal('files');

      Object.keys(result).length.should.equal(4);

      done();
    });
  });

  describe('comments', function () {
    it('should extract comments', function () {
      var result = xgettext('{{_ "Hi" (gettext-comment "comment")}}').messages;
      result.Hi.extractedComments.should.eql(['comment']);
    });

    it('should allow customizing extracted comment identifiers', function () {
      var result = xgettext('{{_ "Hi" (i18n-comment "comment")}}', {
        commentIdentifiers: ['i18n-comment']
      }).messages;

      result.Hi.extractedComments.should.eql(['comment']);
    });

    it('should support multiple comment identifiers', function () {
      var result = xgettext('{{_ "Hi" (i18n-comment "comment1") (gettext-comment "comment2")}}', {
        commentIdentifiers: ['i18n-comment', 'gettext-comment']
      }).messages;

      result.Hi.extractedComments.should.eql(['comment1', 'comment2']);
    });

    it('should support passing a single comment', function () {
      var result = xgettext('{{_ "Hi" (i18n-comment "comment")}}', {
        commentIdentifiers: 'i18n-comment'
      }).messages;

      result.Hi.extractedComments.should.eql(['comment']);
    });
  });

  // if we return the corresponding AST node with an extracted string,
  // consumers can pretty much do anything they want
  it('should return AST', function () {
    var messages = xgettext('{{_ "Hi"}}').messages;

    messages.Hi.ast.type.should.equal('MustacheStatement');
  });
});
