const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseString, normalizePhone } = require('../../services/vcard');

describe('normalizePhone', function() {
  it('should strip non-digit characters', function() {
    assert.strictEqual(normalizePhone('(555) 123-4567'), '5551234567');
  });

  it('should handle +1 country code', function() {
    assert.strictEqual(normalizePhone('+15551234567'), '5551234567');
  });

  it('should handle 1 prefix without +', function() {
    assert.strictEqual(normalizePhone('15551234567'), '5551234567');
  });

  it('should handle tel: URI prefix', function() {
    assert.strictEqual(normalizePhone('tel:+15551234567'), '5551234567');
  });

  it('should return null for short numbers', function() {
    assert.strictEqual(normalizePhone('12345'), null);
  });

  it('should take last 10 digits for long numbers', function() {
    assert.strictEqual(normalizePhone('15551234567890'), '1234567890');
  });
});

describe('parseString', function() {
  it('should parse a basic vCard with FN, N, TEL, EMAIL', function() {
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Smith',
      'N:Smith;John;;;',
      'TEL;TYPE=CELL:+15551234567',
      'EMAIL:john@example.com',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    assert.strictEqual(result.contacts.length, 1);
    assert.strictEqual(result.errors.length, 0);

    var c = result.contacts[0];
    assert.strictEqual(c.first_name, 'John');
    assert.strictEqual(c.last_name, 'Smith');
    assert.strictEqual(c.full_name, 'John Smith');
    assert.strictEqual(c.phone, '5551234567');
    assert.strictEqual(c.email, 'john@example.com');
  });

  it('should derive first/last from FN when N is missing', function() {
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Jane Doe',
      'TEL:5551112222',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    var c = result.contacts[0];
    assert.strictEqual(c.first_name, 'Jane');
    assert.strictEqual(c.last_name, 'Doe');
  });

  it('should handle iPhone-style N field with empty last name', function() {
    // iPhone exports: N:;Client - Miguel Bravo;;;
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Client - Miguel Bravo',
      'N:;Client - Miguel Bravo;;;',
      'TEL;TYPE=CELL:5559876543',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    var c = result.contacts[0];
    assert.strictEqual(c.last_name, 'Bravo');
    assert.strictEqual(c.first_name, 'Client - Miguel');
    assert.strictEqual(c.full_name, 'Client - Miguel Bravo');
  });

  it('should handle iPhone N field with single word in first_name', function() {
    // N:;Madonna;;;
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Madonna',
      'N:;Madonna;;;',
      'TEL;TYPE=CELL:5551111111',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    var c = result.contacts[0];
    // Single-word name with FN: full_name is set, first_name from N is "Madonna", last_name is null
    // The fix only splits when last_name is missing AND there are multiple words
    // Here first_name="Madonna", last_name=null, full_name="Madonna" — single word, so no split
    assert.strictEqual(c.full_name, 'Madonna');
    assert.strictEqual(c.first_name, 'Madonna');
    assert.strictEqual(c.last_name, null);
  });

  it('should split iPhone N field when both N parts are empty but FN exists', function() {
    // N:;;;; with FN
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:John Doe',
      'N:;;;;',
      'TEL;TYPE=CELL:5552223333',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    var c = result.contacts[0];
    assert.strictEqual(c.first_name, 'John');
    assert.strictEqual(c.last_name, 'Doe');
  });

  it('should prefer mobile phone over other types', function() {
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Test User',
      'TEL;TYPE=HOME:5551111111',
      'TEL;TYPE=CELL:5552222222',
      'TEL;TYPE=WORK:5553333333',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    assert.strictEqual(result.contacts[0].phone, '5552222222');
  });

  it('should handle multiple vCards in one file', function() {
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Alice',
      'N:;Alice;;;',
      'END:VCARD',
      'BEGIN:VCARD',
      'VERSION:3.0',
      'FN:Bob Smith',
      'N:Smith;Bob;;;',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    assert.strictEqual(result.contacts.length, 2);
  });

  it('should handle line unfolding (RFC 2425)', function() {
    var vcf = 'BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Very Long\r\n  Name\r\nN:Name;Very Long;;;\r\nEND:VCARD';

    var result = parseString(vcf);
    assert.strictEqual(result.contacts[0].full_name, 'Very Long Name');
  });

  it('should skip vCards with no name info', function() {
    var vcf = [
      'BEGIN:VCARD',
      'VERSION:3.0',
      'TEL:5551234567',
      'END:VCARD',
    ].join('\r\n');

    var result = parseString(vcf);
    assert.strictEqual(result.contacts.length, 0);
  });
});
