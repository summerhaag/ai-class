// Small safe arithmetic expression evaluator for curvature inputs, so a field
// can hold something like "(1+sqrt(2))^2" instead of only a plain number.
// Hand-rolled recursive-descent (no eval/Function) — supports + - * / ^,
// unary +/-, parentheses, sqrt(), and the constants pi/phi.
const CONSTANTS = { pi: Math.PI, phi: (1 + Math.sqrt(5)) / 2 };
const FUNCTIONS = { sqrt: Math.sqrt };

function tokenize(src) {
  const tokens = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      const value = parseFloat(text);
      if (Number.isNaN(value)) throw new Error(`Invalid number '${text}'`);
      tokens.push({ type: 'num', value });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(ch)) {
      let j = i + 1;
      while (j < src.length && /[a-zA-Z]/.test(src[j])) j++;
      tokens.push({ type: 'ident', value: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^()'.includes(ch)) {
      tokens.push({ type: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}'`);
  }
  return tokens;
}

// Grammar (lowest to highest precedence): expr -> term (+|- term)*,
// term -> unary (*|/ unary)*, unary -> (+|-) unary | power,
// power -> atom (^ unary)?  [right-associative, so 2^-1 and -2^2 both parse
// as expected], atom -> number | (expr) | ident | ident(expr).
export function evaluateExpression(src) {
  const tokens = tokenize(String(src));
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectType = (type) => {
    if (!peek() || peek().type !== type) throw new Error(`Expected '${type}'`);
    next();
  };

  function parseExpr() {
    let value = parseTerm();
    while (peek() && (peek().type === '+' || peek().type === '-')) {
      const op = next().type;
      const rhs = parseTerm();
      value = op === '+' ? value + rhs : value - rhs;
    }
    return value;
  }

  function parseTerm() {
    let value = parseUnary();
    while (peek() && (peek().type === '*' || peek().type === '/')) {
      const op = next().type;
      const rhs = parseUnary();
      value = op === '*' ? value * rhs : value / rhs;
    }
    return value;
  }

  function parseUnary() {
    if (peek() && peek().type === '-') {
      next();
      return -parseUnary();
    }
    if (peek() && peek().type === '+') {
      next();
      return parseUnary();
    }
    return parsePower();
  }

  function parsePower() {
    const base = parseAtom();
    if (peek() && peek().type === '^') {
      next();
      return Math.pow(base, parseUnary());
    }
    return base;
  }

  function parseAtom() {
    const tok = peek();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.type === 'num') {
      next();
      return tok.value;
    }
    if (tok.type === '(') {
      next();
      const value = parseExpr();
      expectType(')');
      return value;
    }
    if (tok.type === 'ident') {
      next();
      const name = tok.value.toLowerCase();
      if (peek() && peek().type === '(') {
        next();
        const arg = parseExpr();
        expectType(')');
        const fn = FUNCTIONS[name];
        if (!fn) throw new Error(`Unknown function '${tok.value}'`);
        return fn(arg);
      }
      if (name in CONSTANTS) return CONSTANTS[name];
      throw new Error(`Unknown identifier '${tok.value}'`);
    }
    throw new Error(`Unexpected token '${tok.type}'`);
  }

  if (!peek()) throw new Error('Empty expression');
  const result = parseExpr();
  if (pos !== tokens.length) throw new Error(`Unexpected trailing input at '${peek().value ?? peek().type}'`);
  if (!Number.isFinite(result)) throw new Error('Expression did not evaluate to a finite number');
  return result;
}
