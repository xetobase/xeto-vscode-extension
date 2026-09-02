import { describe, it, expect } from "vitest";
import { Tokenizer } from "../../server/src/compiler/Tokenizer";
import { Token } from "../../server/src/compiler/Token";

// Drain all tokens (with values) until EOF
const lex = (input: string): Array<{ tok: Token; val: any }> => {
  const t = new Tokenizer(input + "\0");
  const out: Array<{ tok: Token; val: any }> = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const tok = t.next();
    if (tok === Token.EOF) break;
    out.push({ tok, val: t.val });
  }
  return out;
};

// Single-token convenience
const one = (input: string): { tok: Token; val: any } => {
  const toks = lex(input);
  expect(toks).toHaveLength(1);
  return toks[0];
};

describe("identifiers", () => {
  it("simple name", () => {
    const r = one("Foo");
    expect(r.tok).toBe(Token.ID);
    expect(r.val).toBe("Foo");
  });

  it("lower-case marker name", () => {
    expect(one("marker").val).toBe("marker");
  });

  it("name with digits and underscore", () => {
    expect(one("foo_2bar").val).toBe("foo_2bar");
  });

  it("dotted name lexes as ID DOT ID", () => {
    const toks = lex("ph.points");
    expect(toks.map((t) => t.tok)).toEqual([Token.ID, Token.DOT, Token.ID]);
    expect(toks[0].val).toBe("ph");
    expect(toks[2].val).toBe("points");
  });

  it("qualified name lexes with DOUBLE_COLON", () => {
    const toks = lex("sys::Str");
    expect(toks.map((t) => t.tok)).toEqual([
      Token.ID,
      Token.DOUBLE_COLON,
      Token.ID,
    ]);
  });
});

describe("quoted strings", () => {
  it("simple string", () => {
    const r = one('"hi"');
    expect(r.tok).toBe(Token.STR);
    expect(r.val).toBe("hi");
  });

  it("empty string", () => {
    expect(one('""').val).toBe("");
  });

  it("escape sequences", () => {
    expect(one('"a\\nb"').val).toBe("a\nb");
    expect(one('"a\\tb"').val).toBe("a\tb");
    expect(one('"a\\\\b"').val).toBe("a\\b");
    expect(one('"a\\"b"').val).toBe('a"b');
  });

  it("unicode escape", () => {
    expect(one('"\\u0041"').val).toBe("A");
  });

  it("unclosed string reports error, still yields STR", () => {
    const t = new Tokenizer('"oops\0');
    const tok = t.next();
    expect(tok).toBe(Token.STR);
    expect(t.currentError).toBeDefined();
    expect(t.currentError?.message).toMatch(/end of str/i);
  });
});

describe("triple-quoted strings", () => {
  it("simple triple quote", () => {
    const r = one('"""my name is "Brian", hi!"""');
    expect(r.tok).toBe(Token.STR);
    expect(r.val).toBe('my name is "Brian", hi!');
  });
});

describe("refs", () => {
  it("simple ref", () => {
    const r = one("@foo");
    expect(r.tok).toBe(Token.REF);
    expect(r.val).toBe("foo");
  });

  it("ref with dashes, colons, tilde, underscore", () => {
    expect(one("@a-b").val).toBe("a-b");
    expect(one("@a:b").val).toBe("a:b");
    expect(one("@a_b~c").val).toBe("a_b~c");
  });

  it("ref cannot end with dash — dash not consumed", () => {
    // per grammar refEnd cannot be "-"; trailing dash is left for next token
    const t = new Tokenizer("@foo- x\0");
    const tok = t.next();
    expect(tok).toBe(Token.REF);
    expect(t.val).toBe("foo");
  });

  it("qualified ref", () => {
    expect(one("@lib::name").val).toBe("lib::name");
  });

  it("dotted qualified ref", () => {
    expect(one("@a.b::c.d").val).toBe("a.b::c.d");
  });
});

describe("number-ish scalars (VAL)", () => {
  it("plain integer", () => {
    const r = one("123");
    expect(r.tok).toBe(Token.VAL);
    expect(r.val).toBe("123");
  });

  it("negative number", () => {
    expect(one("-42").val).toBe("-42");
  });

  it("number with percent unit", () => {
    expect(one("123%").val).toBe("123%");
  });

  it("date literal", () => {
    expect(one("2023-03-04").val).toBe("2023-03-04");
  });

  it("time with colons", () => {
    expect(one("10:30:00").val).toBe("10:30:00");
  });

  it("number with unicode unit", () => {
    expect(one("75°F").val).toBe("75°F");
  });

  it("number with embedded letters (duration)", () => {
    expect(one("15min").val).toBe("15min");
  });
});

describe("heredocs", () => {
  it("single line heredoc", () => {
    const r = one("--- hello ---");
    expect(r.tok).toBe(Token.TRIPLE_DASH);
    expect(r.val).toBe("hello ");
  });

  it("multi-line heredoc normalizes indentation", () => {
    const r = one("---\n  line1\n  line2\n  ---");
    expect(r.tok).toBe(Token.TRIPLE_DASH);
    expect(r.val).toBe("line1\nline2\n");
  });

  it("heredoc ignores backslash escapes", () => {
    const r = one("--- a\\nb ---");
    expect(r.val).toContain("\\n");
  });

  it("longer dash fences must match", () => {
    const r = one("---- x ----");
    expect(r.tok).toBe(Token.TRIPLE_DASH);
    expect(r.val).toBe("x ");
  });

  it("unclosed heredoc reports error", () => {
    const t = new Tokenizer("--- oops\0");
    const tok = t.next();
    expect(tok).toBe(Token.TRIPLE_DASH);
    expect(t.currentError?.message).toMatch(/end of heredoc/i);
  });
});

describe("operators", () => {
  const cases: Array<[string, Token]> = [
    [",", Token.COMMA],
    [":", Token.COLON],
    ["::", Token.DOUBLE_COLON],
    ["{", Token.LBRACE],
    ["}", Token.RBRACE],
    ["[", Token.LBRACKET],
    ["]", Token.RBRACKET],
    ["(", Token.LPAREN],
    [")", Token.RPAREN],
    ["<", Token.LT],
    [">", Token.GT],
    [".", Token.DOT],
    ["?", Token.QUESTION],
    ["&", Token.AMP],
    ["|", Token.PIPE],
    ["+", Token.PLUS],
    ["*", Token.ASTERISK],
  ];

  for (const [sym, tok] of cases) {
    it(`"${sym}"`, () => {
      expect(one(sym).tok).toBe(tok);
    });
  }

  it("unexpected symbol throws", () => {
    const t = new Tokenizer("#\0");
    expect(() => t.next()).toThrow(/Unexpected symbol/);
  });
});

describe("newlines and whitespace", () => {
  it("newline token", () => {
    const toks = lex("a\nb");
    expect(toks.map((t) => t.tok)).toEqual([Token.ID, Token.NL, Token.ID]);
  });

  it("crlf collapses to single NL", () => {
    const toks = lex("a\r\nb");
    expect(toks.map((t) => t.tok)).toEqual([Token.ID, Token.NL, Token.ID]);
  });

  it("tabs and non-breaking space are skipped", () => {
    const toks = lex("a\t\u00a0b");
    expect(toks.map((t) => t.tok)).toEqual([Token.ID, Token.ID]);
  });
});

describe("comments", () => {
  it("line comment kept when keepComments (default)", () => {
    const toks = lex("// hello\nFoo");
    expect(toks[0].tok).toBe(Token.COMMENT);
    expect(toks[0].val).toBe("hello");
  });

  it("multi-line comment skipped", () => {
    const toks = lex("/* skip /* nested */ me */Foo");
    expect(toks.map((t) => t.tok)).toEqual([Token.ID]);
    expect(toks[0].val).toBe("Foo");
  });
});

describe("positions", () => {
  it("tracks line of tokens (0-based, LSP convention)", () => {
    const t = new Tokenizer("Foo: Dict\nBar: Str\0");
    t.next(); // Foo
    expect(t.line).toBe(0);
    t.next(); // :
    t.next(); // Dict
    t.next(); // NL
    t.next(); // Bar
    expect(t.line).toBe(1);
  });
});

describe("full spec line", () => {
  it("lexes a spec declaration", () => {
    const toks = lex('Foo: Dict <abstract> { bar: Str "hi" }');
    const kinds = toks.map((t) => t.tok);
    expect(kinds).toEqual([
      Token.ID, Token.COLON, Token.ID,
      Token.LT, Token.ID, Token.GT,
      Token.LBRACE, Token.ID, Token.COLON, Token.ID, Token.STR,
      Token.RBRACE,
    ]);
  });
});
