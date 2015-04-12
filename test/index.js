'use strict';

var Parser = require('..');
var fs = require('fs');
var assert = require('assert');

describe('Parser', function () {
  describe('#()', function () {
    it('should have default keyword spec when none is passed', function () {
      assert(new Parser().keywords.gettext.length > 0);
    });
  });

  describe('#parse()', function () {
    it('should return results', function (done) {
      fs.readFile(__dirname + '/fixtures/template.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

        assert.equal(typeof result, 'object');
        assert('inside block' in result);
        assert('inside block inverse' in result);
        assert.equal(Object.keys(result).length, 8);
        assert.equal(result['Image description'].line.length, 2);

        done();
      });
    });

    it('should extract domains', function (done) {
      var result = new Parser().parse('{{d_ "plugin" "message"}}');
      assert('plugin' in result);
      assert.equal('messages' in result, false);

      done();
    });

    it('should allow customizing default domain', function (done) {
      var result = new Parser({domain: 'foo'}).parse('{{_ "hello"}}');
      assert('foo' in result);
      assert.equal('messages' in result, false);
      assert('hello' in result.foo);

      done();
    });

    it('should return plural results', function (done) {
      fs.readFile(__dirname + '/fixtures/plural.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

        assert.equal(Object.keys(result).length, 2);
        assert.equal(result['default'].msgid_plural, 'defaults');

        done();
      });
    });

    it('should throw an error if there are mismatched plurals', function (done) {
      fs.readFile(__dirname + '/fixtures/mismatched-plurals.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        assert.throws(function() { new Parser().parse(data); }, Error);

        done();
      });
    });

    it('should recognize subexpressions', function (done) {
      fs.readFile(__dirname + '/fixtures/subexpression.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser().parse(data).messages;

        assert('subexpression' in result);
        assert('%s subexpression' in result);
        assert.equal(result['%s subexpression'].msgid_plural, '%s subexpressions');
        assert('%s %s subexpression' in result);
        assert.equal(result['%s %s subexpression'].msgid_plural, '%s %s subexpressions');
        assert('second' in result);
        assert('regular' in result);
        assert('%s %s other' in result);
        assert('nested %s' in result);
        assert.equal(7, Object.keys(result).length);

        done();
      });
    });

    it('should support skipping parameters', function (done) {
      fs.readFile(__dirname + '/fixtures/skip-params.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = new Parser({keywords: {_: ['variable', 'msgid', 'msgid_plural']}}).parse(data).messages;

        assert.equal(result.msgid.msgid, 'msgid');
        assert.equal(result.msgid.msgid_plural, 'plural');

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
        assert(key in result);
        assert.equal(result[key].msgctxt, 'pgettext context');

        key = Parser.messageToKey('p_msgid', 'p_ context');
        assert(key in result);
        assert.equal(result[key].msgctxt, 'p_ context');

        key = Parser.messageToKey('file', 'noun');
        assert(key in result);
        assert.equal(result[key].msgctxt, 'noun');
        assert.equal(result[key].msgid_plural, 'files');

        key = Parser.messageToKey('file', 'verb');
        assert(key in result);
        assert.equal(result[key].msgctxt, 'verb');
        assert.equal(result[key].msgid_plural, 'files');

        assert.equal(4, Object.keys(result).length);

        done();
      });
    });

    describe('comments', function () {
      it('should extract comments', function () {
        var result = new Parser().parse('{{_ "Hi" (gettext-comment "comment")}}').messages;
        assert.deepEqual(result.Hi.extractedComments, ['comment']);
      });

      it('should allow customizing extracted comment identifiers', function () {
        var result = new Parser({
          commentIdentifiers: ['i18n-comment']
        }).parse('{{_ "Hi" (i18n-comment "comment")}}').messages;

        assert.deepEqual(result.Hi.extractedComments, ['comment']);
      });

      it('should support multiple comment identifiers', function () {
        var result = new Parser({
          commentIdentifiers: ['i18n-comment', 'gettext-comment']
        }).parse('{{_ "Hi" (i18n-comment "comment1") (gettext-comment "comment2")}}').messages;

        assert.deepEqual(result.Hi.extractedComments, ['comment1', 'comment2']);
      });

      it('should support passing a single comment', function () {
        var result = new Parser({
          commentIdentifiers: 'i18n-comment'
        }).parse('{{_ "Hi" (i18n-comment "comment")}}').messages;

        assert.deepEqual(result.Hi.extractedComments, ['comment']);
      });
    });

    it('should support being called without `new`', function (done) {
      /* jshint newcap: false */
      fs.readFile(__dirname + '/fixtures/template.hbs', {encoding: 'utf8'}, function (err, data) {
        if (err) {
          throw err;
        }

        var result = Parser().parse(data).messages;

        assert('inside block' in result);

        done();
      });
    });
  });
});
