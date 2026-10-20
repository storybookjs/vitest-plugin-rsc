// The condition of a `// @gate` pragma, with the grammar that
// test/lib/gate/expr.ts of Next's repository has for it:
//
//   expression → binary ( ( "||" | "&&" ) binary )*
//   binary     → unary ( ( "===" | "!==" | "==" | "!=" ) unary )*
//   unary      → "!" unary | primary
//   primary    → NAME | STRING | "true" | "false" | "(" expression ")"

/** What a condition comes to, for the conditions of a run by name. */
export function evaluateGate(source: string, conditions: Record<string, unknown>): unknown {
  const unparsable = () => new Error(`Unparsable @gate pragma: ${source}`);
  const tokens: string[] = [];
  const token = /\s*(===|!==|==|!=|&&|\|\||[!()]|'[^']*'|"[^"]*"|[\w$]+)\s*/y;
  while (token.lastIndex < source.length) {
    const match = token.exec(source);
    if (!match) throw unparsable();
    tokens.push(match[1]!);
  }
  if (tokens.length === 0) throw unparsable();

  let at = 0;
  const primary = (): unknown => {
    const token = tokens[at++];
    if (token === undefined || /^(===|!==|==|!=|&&|\|\||!|\))$/.test(token)) throw unparsable();
    if (token === "(") {
      const value = expression();
      if (tokens[at++] !== ")") throw unparsable();
      return value;
    }
    if (/^['"]/.test(token)) return token.slice(1, -1);
    if (token === "true" || token === "false") return token === "true";
    return readCondition(token, conditions);
  };
  const unary = (): unknown => {
    if (tokens[at] !== "!") return primary();
    at++;
    return !unary();
  };
  const binary = (): unknown => {
    let left = unary();
    while (/^[!=]==?$/.test(tokens[at] ?? "")) {
      const equal = tokens[at++]!.startsWith("=");
      left = (left === unary()) === equal;
    }
    return left;
  };
  function expression(): unknown {
    let left = binary();
    while (tokens[at] === "&&" || tokens[at] === "||") {
      const and = tokens[at++] === "&&";
      const right = binary();
      left = and ? left && right : left || right;
    }
    return left;
  }

  const value = expression();
  if (at !== tokens.length) throw unparsable();
  return value;
}

// A typo must not turn a gate off without a word, as in Next's own runs.
function readCondition(name: string, conditions: Record<string, unknown>): unknown {
  if (!Object.hasOwn(conditions, name)) {
    throw new Error(`\`@gate\` references an undeclared condition "${name}".`);
  }
  return conditions[name];
}

/**
 * The conditions as the function form of `gate()` gets them: a name that no
 * run has throws, as in a pragma.
 */
export function declaredConditions(conditions: Record<string, unknown>): Record<string, unknown> {
  return new Proxy(conditions, {
    get: (target, name) => (typeof name === "string" ? readCondition(name, target) : undefined),
    has: () => true,
  });
}
