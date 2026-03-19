const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  normalizeName,
  levenshteinDistance,
  findMatches,
  stripInitials,
} = require('../../services/matcher');

describe('normalizeName', function() {
  it('should strip category prefixes', function() {
    assert.strictEqual(normalizeName('Client - Ana Pham'), 'ana pham');
    assert.strictEqual(normalizeName('Agent - John Doe'), 'john doe');
    assert.strictEqual(normalizeName('LD - Michael Smith'), 'michael smith');
    assert.strictEqual(normalizeName('Lender: Sarah Jones'), 'sarah jones');
    assert.strictEqual(normalizeName('Seller - Bob White'), 'bob white');
    assert.strictEqual(normalizeName('Buyer - Jane Black'), 'jane black');
    assert.strictEqual(normalizeName('Friend - Tom Green'), 'tom green');
  });

  it('should strip suffixes', function() {
    assert.strictEqual(normalizeName('John Smith Jr.'), 'john smith');
    assert.strictEqual(normalizeName('Sarah Doe MD'), 'sarah doe');
    assert.strictEqual(normalizeName('Bob Jones III'), 'bob jones');
  });

  it('should handle combined prefixes and suffixes', function() {
    assert.strictEqual(normalizeName('Client - John Smith Jr.'), 'john smith');
  });

  it('should normalize whitespace and case', function() {
    assert.strictEqual(normalizeName('  JOHN   SMITH  '), 'john smith');
  });

  it('should handle empty and null input', function() {
    assert.strictEqual(normalizeName(''), '');
    assert.strictEqual(normalizeName(null), '');
    assert.strictEqual(normalizeName(undefined), '');
  });

  it('should not strip names that start with prefix-like words', function() {
    assert.strictEqual(normalizeName('Agente Rodriguez'), 'agente rodriguez');
  });
});

describe('stripInitials', function() {
  it('should remove single-letter tokens', function() {
    assert.strictEqual(stripInitials('michael v aguirre'), 'michael aguirre');
    assert.strictEqual(stripInitials('ryan j garcia'), 'ryan garcia');
  });

  it('should remove multiple single-letter tokens', function() {
    assert.strictEqual(stripInitials('alejandro r s gomez'), 'alejandro gomez');
  });

  it('should preserve multi-letter tokens', function() {
    assert.strictEqual(stripInitials('michael van aguirre'), 'michael van aguirre');
  });

  it('should handle names without initials', function() {
    assert.strictEqual(stripInitials('john smith'), 'john smith');
  });

  it('should handle empty and null input', function() {
    assert.strictEqual(stripInitials(''), '');
    assert.strictEqual(stripInitials(null), '');
  });

  it('should not strip if all tokens are single letters', function() {
    assert.strictEqual(stripInitials('j s'), 'j s');
  });
});

describe('levenshteinDistance', function() {
  it('should return 0 for identical strings', function() {
    assert.strictEqual(levenshteinDistance('test', 'test'), 0);
  });

  it('should compute correct distances', function() {
    assert.strictEqual(levenshteinDistance('michael', 'michel'), 1);
    assert.strictEqual(levenshteinDistance('kitten', 'sitting'), 3);
  });

  it('should handle empty strings', function() {
    assert.strictEqual(levenshteinDistance('', 'abc'), 3);
    assert.strictEqual(levenshteinDistance('abc', ''), 3);
  });

  it('should show julio vs justin is distance 3', function() {
    assert.strictEqual(levenshteinDistance('julio', 'justin'), 3);
  });
});

describe('findMatches', function() {
  var contacts = [
    { id: 1, first_name: 'Michael V', last_name: 'Aguirre' },
    { id: 2, first_name: 'Ryan J', last_name: 'Garcia' },
    { id: 3, first_name: 'Julio F', last_name: 'Gomez' },
    { id: 4, first_name: 'Ana', last_name: 'Pham' },
    { id: 5, first_name: 'Thang', last_name: 'Le' },
    { id: 6, first_name: 'Mark M', last_name: 'Leod' },
  ];

  it('should match names with category prefixes stripped', function() {
    var imported = { first_name: 'Client - Thang', last_name: 'Le', full_name: 'Client - Thang Le' };
    var matches = findMatches(imported, contacts);
    assert.ok(matches.length >= 1, 'should find at least one match');
    assert.strictEqual(matches[0].contact_id, 5);
    assert.ok(matches[0].confidence >= 90, 'confidence should be >= 90, got ' + matches[0].confidence);
  });

  it('should match names when imported has no middle initial but contact does', function() {
    var imported = { first_name: 'Michael', last_name: 'Aguirre', full_name: 'Michael Aguirre' };
    var matches = findMatches(imported, contacts);
    assert.ok(matches.length >= 1, 'should find at least one match');
    assert.strictEqual(matches[0].contact_id, 1);
    assert.strictEqual(matches[0].confidence, 100);
  });

  it('should match names when both have middle initials', function() {
    var imported = { first_name: 'Michael V', last_name: 'Aguirre', full_name: 'Michael V Aguirre' };
    var matches = findMatches(imported, contacts);
    assert.ok(matches.length >= 1);
    assert.strictEqual(matches[0].contact_id, 1);
    assert.strictEqual(matches[0].confidence, 100);
  });

  it('should NOT match different first names with same last name at high confidence', function() {
    var imported = { first_name: 'Justin', last_name: 'Gomez', full_name: 'Justin Gomez' };
    var matches = findMatches(imported, contacts);
    var julioMatch = matches.find(function(m) { return m.contact_id === 3; });
    // Should not match at all or only at very low confidence
    if (julioMatch) {
      assert.ok(julioMatch.confidence <= 40, 'Julio/Justin should not match above 40, got ' + julioMatch.confidence);
    }
  });

  it('should NOT match Mark Leod to Mark Woods (different last names)', function() {
    var imported = { first_name: 'Mark', last_name: 'Woods', full_name: 'Mark Woods' };
    var matches = findMatches(imported, contacts);
    var leodMatch = matches.find(function(m) { return m.contact_id === 6; });
    assert.ok(!leodMatch, 'Mark Woods should not match Mark M Leod');
  });

  it('should match last name + first initial', function() {
    var imported = { first_name: 'R', last_name: 'Garcia', full_name: 'R Garcia' };
    var matches = findMatches(imported, contacts);
    var ryanMatch = matches.find(function(m) { return m.contact_id === 2; });
    assert.ok(ryanMatch, 'should match Ryan J Garcia');
    assert.strictEqual(ryanMatch.confidence, 70);
  });

  it('should match fuzzy first name with exact last name', function() {
    var imported = { first_name: 'Michel', last_name: 'Aguirre', full_name: 'Michel Aguirre' };
    var matches = findMatches(imported, contacts);
    var michaelMatch = matches.find(function(m) { return m.contact_id === 1; });
    assert.ok(michaelMatch, 'should match Michael V Aguirre');
    assert.ok(michaelMatch.confidence >= 50 && michaelMatch.confidence <= 60,
      'confidence should be 50-60, got ' + michaelMatch.confidence);
  });

  it('should return empty array when no matches exist', function() {
    var imported = { first_name: 'Zzzzz', last_name: 'Xxxxxx', full_name: 'Zzzzz Xxxxxx' };
    var matches = findMatches(imported, contacts);
    assert.strictEqual(matches.length, 0);
  });

  it('should sort matches by confidence descending', function() {
    var pool = [
      { id: 10, first_name: 'Ana', last_name: 'Pham' },
      { id: 11, first_name: 'Anb', last_name: 'Pham' },
    ];
    var imported = { first_name: 'Ana', last_name: 'Pham', full_name: 'Ana Pham' };
    var matches = findMatches(imported, pool);
    for (var i = 1; i < matches.length; i++) {
      assert.ok(matches[i - 1].confidence >= matches[i].confidence, 'should be sorted descending');
    }
  });
});
