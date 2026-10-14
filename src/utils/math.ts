/**
 * Evalúa expresiones matemáticas simples (+, -, *, /) de forma segura.
 * No utiliza eval() ni new Function() para evitar riesgos de inyección de código (XSS).
 * 
 * @param expression Expresión matemática a evaluar (ej. "2+3*4")
 * @returns El resultado numérico o 0 si la expresión no es válida.
 */
// Constantes de módulo — se compilan/crean una sola vez
const RE_DIGIT_DOT = /[0-9.]/
const OP_CHARS = new Set(['+', '-', '*', '/'])

export function safeEval(expression: string): number {
  // 1. Sanitizar expresión (solo permitir números, operadores +, -, *, /, .)
  const sanitized = expression.replace(/[^0-9+\-*/.]/g, '');
  if (!sanitized) return 0;
  
  // 2. Tokenizar la expresión en números y operadores
  const tokens: string[] = [];
  let currentNum = '';
  
  for (let i = 0; i < sanitized.length; i++) {
    const char = sanitized[i];
    if (RE_DIGIT_DOT.test(char)) {
      currentNum += char
    } else {
      if (currentNum !== '') {
        tokens.push(currentNum)
        currentNum = ''
      }

      // Manejar números negativos al inicio o después de otro operador
      const lastToken = tokens[tokens.length - 1]
      if (char === '-' && (tokens.length === 0 || OP_CHARS.has(lastToken!))) {
        currentNum = '-'
      } else {
        tokens.push(char)
      }
    }
  }
  if (currentNum !== '') {
    tokens.push(currentNum);
  }
  
  if (tokens.length === 0) return 0;
  
  // 3. Evaluar multiplicaciones y divisiones primero (precedencia de operadores)
  const intermediateTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === '*' || token === '/') {
      const prev = parseFloat(intermediateTokens.pop() || '0');
      const next = parseFloat(tokens[++i] || '0');
      if (token === '*') {
        intermediateTokens.push((prev * next).toString());
      } else {
        intermediateTokens.push(next === 0 ? '0' : (prev / next).toString());
      }
    } else {
      intermediateTokens.push(token);
    }
  }
  
  if (intermediateTokens.length === 0) return 0;
  
  // 4. Evaluar sumas y restas de izquierda a derecha
  let result = parseFloat(intermediateTokens[0] || '0');
  for (let i = 1; i < intermediateTokens.length; i += 2) {
    const op = intermediateTokens[i];
    const nextVal = parseFloat(intermediateTokens[i + 1] || '0');
    if (op === '+') {
      result += nextVal;
    } else if (op === '-') {
      result -= nextVal;
    }
  }
  
  return result;
}

/**
 * Presentational layer ONLY: maps the canonical internal decimal '.' to the
 * user's regional decimal separator so the keypad shows what the user expects
 * (',' for comma-regions). Operators, digits and sign are untouched, and
 * emitted values stay canonical — parseFloat consumers never trunc.
 *
 * @param expr canonical keypad expression ('.', operators + - * /)
 * @param decimalSeparator user's regional decimal separator ('.' or ',')
 */
export function withUserDecimalSeparator(expr: string, decimalSeparator: string): string {
  if (decimalSeparator !== ',') return expr
  return expr.replace(/\./g, ',')
}
