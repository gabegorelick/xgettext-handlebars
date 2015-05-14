'use strict';

var Parser = require('..');
var fs = require('fs');
var should = require('should');

describe('Parser', function () {
  describe('constructor', function () {
    it('should have default identifiers when none are passed', function () {
      new Parser().identifiers.gettext.length.should.be.greaterThan(0);
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

  describe('.parse()', function () {
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
            lastColumn: 15
          },
          {
            firstLine: 2,
            firstColumn: 2,
            lastLine: 2,
            lastColumn: 15
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
      var result = new Parser({defaultDomain: 'foo'}).parse('{{_ "hello"}}');

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

        var result = new Parser({identifiers: {_: ['variable', 'msgid', 'msgid_plural']}}).parse(data).messages;

        result.msgid.msgid.should.equal('msgid');
        result.msgid.msgid_plural.should.equal('plural');

        done();
      });
    });

    it('should support extracting unknown fields', function (done) {
      var parser = new Parser({identifiers: {_: ['msgid', 'foo']}});
      var messages = parser.parse('{{_ "Hi" "Foo"}}').messages;

      should(messages.Hi.foo).not.be.ok;
      messages.Hi.fields.foo.should.equal('Foo');

      done();
    });

    it('should not overwrite existing fields', function (done) {
      var parser = new Parser({identifiers: {_: ['msgid', 'references']}});
      var messages = parser.parse('{{_ "Hi" "Foo"}}').messages;

      // references shouldn't get overwritten by 'Foo'
      messages.Hi.references.should.eql([{
        firstLine: 1,
        firstColumn: 2,
        lastColumn: 14,
        lastLine: 1
      }]);
      messages.Hi.fields.references.should.equal('Foo');

      done();
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

    // if we return the corresponding AST node with an extracted string,
    // consumers can pretty much do anything they want
    it('should return AST', function () {
        var messages = new Parser().parse('{{_ "Hi"}}').messages;

        messages.Hi.ast.type.should.equal('sexpr');
      });
  });

  describe('.addStrings()', function () {
    it('should add strings to .strings', function () {
      var parser = new Parser();
      var catalog = {
        messages: {
          msgid1: {
            msgid: 'msgid1',
            extractedComments: [],
            references: []
          }
        }
      };
      parser.addStrings(catalog);

      parser.strings.should.eql(catalog);
    });

    it('should combine identical strings', function () {
      var parser = new Parser();
      var catalog1 = {
        messages: {
          msgid1: {
            msgid: 'msgid1',
            extractedComments: ['comment 1'],
            references: [
              {
                firstLine: 1,
                firstColumn: 2,
                lastColumn: 3,
                lastLine: 4
              }
            ]
          }
        }
      };
      var catalog2 = {
        messages: {
          msgid1: {
            msgid: 'msgid1',
            extractedComments: ['comment 2'],
            references: [
              {
                firstLine: 10,
                firstColumn: 20,
                lastColumn: 30,
                lastLine: 40
              }
            ]
          }
        }
      };
      parser.addStrings(catalog1);
      parser.addStrings(catalog2);

      parser.strings.should.eql({
        messages: {
          msgid1: {
            msgid: 'msgid1',
            extractedComments: ['comment 1', 'comment 2'],
            references: [
              {
                firstLine: 1,
                firstColumn: 2,
                lastColumn: 3,
                lastLine: 4
              },
              {
                firstLine: 10,
                firstColumn: 20,
                lastColumn: 30,
                lastLine: 40
              }
            ]
          }
        }
      });
    });

    it("shouldn't combine strings with different domains", function () {
      var parser = new Parser();
      parser.addStrings({
        domain1: {
          msgid1: {
            msgid: 'msgid1'
          }
        }
      });
      parser.addStrings({
        domain2: {
          msgid1: {
            msgid: 'msgid1'
          }
        }
      });

      parser.strings.should.eql({
        domain1: {
          msgid1: {
            msgid: 'msgid1'
          }
        },
        domain2: {
          msgid1: {
            msgid: 'msgid1'
          }
        }
      });
    });

    it("shouldn't combine strings with different contexts", function () {
      var parser = new Parser();
      parser.addStrings({
        messages: {
          'context\u0004msgid1': {
            msgid: 'msgid1',
            msgctxt: 'context'
          }
        }
      });
      parser.addStrings({
        messages: {
          msgid1: {
            msgid: 'msgid1'
          }
        }
      });

      parser.strings.should.eql({
        messages: {
          msgid1: {
            msgid: 'msgid1'
          },
          'context\u0004msgid1': {
            msgid: 'msgid1',
            msgctxt: 'context'
          }
        }
      });
    });

    it("shouldn't add duplicate references", function () {
      var parser = new Parser();
      var catalog = {
        messages: {
          msgid1: {
            msgid: 'msgid1',
            extractedComments: [],
            references: [
              {
                firstLine: 1
              }
            ]
          }
        }
      };
      parser.addStrings(catalog);
      parser.addStrings(catalog);

      parser.strings.messages.should.have.keys('msgid1');
      parser.strings.messages.msgid1.references.length.should.equal(1);
    });

    describe('should sort references', function () {
      it('by filename first', function () {
        var parser = new Parser();
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  filename: 'b'
                }
              ]
            }
          }
        });
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  filename: 'a'
                }
              ]
            }
          }
        });

        parser.strings.messages.msgid1.references.should.eql([{filename: 'a'}, {filename: 'b'}]);
      });

      it('then by line number', function () {
        var parser = new Parser();
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  firstLine: 2
                }
              ]
            }
          }
        });
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  firstLine: 1
                }
              ]
            }
          }
        });

        parser.strings.messages.msgid1.references.should.eql([{firstLine: 1}, {firstLine: 2}]);
      });

      it('then by column number', function () {
        var parser = new Parser();
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  firstLine: 1,
                  firstColumn: 2
                }
              ]
            }
          }
        });
        parser.addStrings({
          messages: {
            msgid1: {
              msgid: 'msgid1',
              extractedComments: [],
              references: [
                {
                  firstLine: 1,
                  firstColumn: 1
                }
              ]
            }
          }
        });

        parser.strings.messages.msgid1.references.should.eql([
          {firstLine: 1, firstColumn: 1},
          {firstLine: 1, firstColumn: 2}
        ]);
      });
    });
  });

  describe('.toPOs', function () {
    it('should work', function () {
      var parser = new Parser();
      parser.addStrings({
        messages: {
          msgid1: {
            msgid: 'msgid1',
            msgid_plural: 'plural',
            extractedComments: ['Comment'],
            references: [
              {
                filename: 'foo.hbs',
                firstLine: 1,
                firstColumn: 1
              }
            ]
          }
        }
      });

      var pos = parser.toPOs();
      pos.length.should.equal(1);

      var po = pos[0];
      po.domain.should.equal('messages');
      po.items.length.should.equal(1);

      var item = po.items[0];
      item.msgid.should.equal('msgid1');
      item.msgid_plural.should.equal('plural');
      item.extractedComments.should.eql(['Comment']);
      item.references.should.eql(['foo.hbs:1']);
    });

    // TODO more tests (domain sorting, entry sorting, empty references, etc.)
  });
});
