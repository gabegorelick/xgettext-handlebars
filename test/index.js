'use strict';

var Parser = require('..');
var fs = require('fs');
require('should');

describe('Parser', function () {
  describe('#()', function () {
    it('should have default keyword spec when none is passed', function () {
      new Parser().keywords.gettext.length.should.be.greaterThan(0);
    });
  });

  describe('#parse()', function () {
    it('should return results', function (done) {
      fs.readFile(__dirname + '/fixtures/template.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

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

        var result = new Parser().parse(data).messages;

        result.duplicate.references.should.eql([
          {
            firstLine: 1,
            firstColumn: 2,
            lastLine: 1,
            lastColumn: 15,
          },
          {
            firstLine: 2,
            firstColumn: 2,
            lastLine: 2,
            lastColumn: 15,
          }
        ]);

        result.unique.references.length.should.equal(1);

        done();
      });
    });

    it('should extract domains', function () {
      var result = new Parser().parse('{{d_ "plugin" "message"}}');

      result.should.containEql('plugin')
        .and.not.containEql('messages');
    });

    it('should allow customizing default domain', function () {
      var result = new Parser({domain: 'foo'}).parse('{{_ "hello"}}');

      result.should.containEql('foo');
      result.foo.should.containEql('hello');
      result.should.not.containEql('messages');
    });

    it('should return plural results', function (done) {
      fs.readFile(__dirname + '/fixtures/plural.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

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

        (function () {new Parser().parse(data);}).should.throw();

        done();
      });
    });

    it('should recognize subexpressions', function (done) {
      fs.readFile(__dirname + '/fixtures/subexpression.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

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

        var result = new Parser({keywords: {_: ['variable', 'msgid', 'msgid_plural']}}).parse(data).messages;

        result.msgid.msgid.should.equal('msgid');
        result.msgid.msgid_plural.should.equal('plural');

        done();
      });
    });

    it('should support extracting contexts', function (done) {
      fs.readFile(__dirname + '/fixtures/contexts.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

        var key = Parser.messageToKey('pgettext_msgid', 'pgettext context');
        result.should.containEql(key);
        result[key].msgctxt.should.equal('pgettext context');

        key = Parser.messageToKey('p_msgid', 'p_ context');
        result.should.containEql(key);
        result[key].msgctxt.should.equal('p_ context');

        key = Parser.messageToKey('file', 'noun');
        result.should.containEql(key);
        result[key].msgctxt.should.equal('noun');
        result[key].msgid_plural.should.equal('files');

        key = Parser.messageToKey('file', 'verb');
        result.should.containEql(key);
        result[key].msgctxt.should.equal('verb');
        result[key].msgid_plural.should.equal('files');

        Object.keys(result).length.should.equal(4);

        done();
      });
    });

    describe('comments', function () {
      it('should extract comments', function () {
        var result = new Parser().parse('{{_ "Hi" (gettext-comment "comment")}}').messages;
        result.Hi.extractedComments.should.eql(['comment']);
      });

      it('should allow customizing extracted comment identifiers', function () {
        var result = new Parser({
          commentIdentifiers: ['i18n-comment']
        }).parse('{{_ "Hi" (i18n-comment "comment")}}').messages;

        result.Hi.extractedComments.should.eql(['comment']);
      });

      it('should support multiple comment identifiers', function () {
        var result = new Parser({
          commentIdentifiers: ['i18n-comment', 'gettext-comment']
        }).parse('{{_ "Hi" (i18n-comment "comment1") (gettext-comment "comment2")}}').messages;

        result.Hi.extractedComments.should.eql(['comment1', 'comment2']);
      });

      it('should support passing a single comment', function () {
        var result = new Parser({
          commentIdentifiers: 'i18n-comment'
        }).parse('{{_ "Hi" (i18n-comment "comment")}}').messages;

        result.Hi.extractedComments.should.eql(['comment']);
      });
    });

    it('should support being called without `new`', function (done) {
      /* jshint newcap: false */
      fs.readFile(__dirname + '/fixtures/template.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = Parser().parse(data).messages;

        result.should.containEql('inside block');

        done();
      });
    });
  });
});
