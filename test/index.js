'use strict';

var xgettext = require('..');
var fs = require('fs');
var should = require('should');
var Catalog = require('gettext-catalog');

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

  it('should not throw an error if plurals are not mismatched', function () {
    var messages = xgettext('{{n_ "boat" "boats" numBoats}} {{n_ "boat" "boats" variable}}').messages;
    Object.keys(messages).length.should.equal(1);
    messages.boat.references.length.should.equal(2);
    messages.boat.msgid_plural.should.equal('boats');
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

      var key = Catalog.messageToKey('pgettext_msgid', 'pgettext context');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('pgettext context');

      key = Catalog.messageToKey('p_msgid', 'p_ context');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('p_ context');

      key = Catalog.messageToKey('file', 'noun');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('noun');
      result[key].msgid_plural.should.equal('files');

      key = Catalog.messageToKey('file', 'verb');
      result.should.containEql(key);
      result[key].msgctxt.should.equal('verb');
      result[key].msgid_plural.should.equal('files');

      Object.keys(result).length.should.equal(4);

      done();
    });
  });

  // if we return the corresponding AST node with an extracted string,
  // consumers can pretty much do anything they want
  it('should return AST', function () {
    var messages = xgettext('{{_ "Hi"}}').messages;

    messages.Hi.ast.type.should.equal('MustacheStatement');
  });

  it('should return {} if there are no strings', function () {
    xgettext('{{randomHelper ""}}').should.have.keys();
  });

  it('should throw error if spec does not have msigd', function () {
    (function () {
      return xgettext('{{_ ""}}', {
        identifiers: {
          '_': ['foo']
        }
      });
    }).should.throw();
  });

  it('should throw an error if message does not have msgid', function () {
    (function () {
      xgettext('{{_}}');
    }).should.throw();
  });

  it('should throw an error if context was expected but not given', function () {
    (function () {
      xgettext('{{i18n "msigd"}}', {
        identifiers: {
          i18n: ['msgid', 'msgctxt']
        }
      });
    }).should.throw();
  });

  it('should throw an error if domain was expected but not given', function () {
    (function () {
      xgettext('{{i18n "msigd"}}', {
        identifiers: {
          i18n: ['msgid', 'domain']
        }
      });
    }).should.throw();
  });

  it('should throw an error if plural was expected but not given', function () {
    (function () {
      xgettext('{{i18n "msigd"}}', {
        identifiers: {
          i18n: ['msgid', 'msgid_plural']
        }
      });
    }).should.throw();
  });

  describe('arguments that are not string literals', function () {
    it('should not extract non-literal msgids', function () {
      xgettext('{{_ variable}}').should.have.keys();
    });

    it('should not extract non-literal plurals', function () {
      xgettext('{{n_ "boat" boats numBoats}}').should.have.keys();
    });

    it('should not extract non-literal contexts', function () {
      xgettext('{{p_ context "whatever"}}').should.have.keys();
    });

    it('should not extract non-literal domains', function () {
      xgettext('{{d_ domain "whatever"}}').should.have.keys();
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

    it('should throw an error if comment has no arguments', function () {
      (function () {
        xgettext('{{_ "Hi" (gettext-comment)}}');
      }).should.throw();
    });

    it('should throw an error if comment is not a string literal', function () {
      (function () {
        xgettext('{{_ "Hi" (gettext-comment variable)}}');
      }).should.throw();
    });
  });
});
