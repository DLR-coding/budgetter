// Parseur de formule de saisie.
// Transforme ce que tu tapes dans le champ montant en lignes d'articles :
//   "12,49"                 -> 1 ligne  (12,49)
//   "(12+2+1.55+(5*2.99))"  -> 4 lignes (12 / 2 / 1,55 / 5 × 2,99)
//   "5-(1.29+2.27)"         -> 3 lignes (5 / -1,29 / -2,27)  (corrections, remboursements)
//
// Tous les montants sont en centimes (entiers) pour éviter les erreurs d'arrondi.

export type FormulaLine = {
  quantity: number;        // entier >= 1
  unitPriceCents: number;  // peut être négatif (correction / remboursement)
};

export type FormulaResult =
  | { ok: true; lines: FormulaLine[]; totalCents: number }
  | { ok: false; error: string };

type Token =
  | { kind: 'num'; value: number; isInteger: boolean }
  | { kind: 'op'; value: '+' | '-' | '*' | 'x' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const s = input.replace(/\s+/g, '').replace(/€/g, '').replace(/×/g, '*');
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.,]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9.,]/.test(s[j])) j++;
      const raw = s.slice(i, j).replace(',', '.');
      if ((raw.match(/\./g) ?? []).length > 1) throw new Error(`Nombre invalide : ${s.slice(i, j)}`);
      const value = Number(raw);
      if (Number.isNaN(value)) throw new Error(`Nombre invalide : ${s.slice(i, j)}`);
      tokens.push({ kind: 'num', value, isInteger: !raw.includes('.') });
      i = j;
    } else if (c === '+' || c === '-' || c === '*' || c === 'x' || c === 'X') {
      tokens.push({ kind: 'op', value: (c === 'X' ? 'x' : c) as '+' | '-' | '*' | 'x' });
      i++;
    } else if (c === '(') {
      tokens.push({ kind: 'lparen' });
      i++;
    } else if (c === ')') {
      tokens.push({ kind: 'rparen' });
      i++;
    } else {
      throw new Error(`Caractère non reconnu : « ${c} »`);
    }
  }
  return tokens;
}

const toCents = (v: number) => Math.round(v * 100);

// Grammaire :
//   expr    := term (('+' | '-') term)*
//   term    := product | '(' expr ')'
//   product := num (('*'|'x') num)?
class Parser {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) { this.tokens = tokens; }

  parse(): FormulaLine[] {
    const lines = this.expr(1);
    if (this.pos < this.tokens.length) throw new Error('Formule incomplète ou parenthèse en trop');
    return lines;
  }

  private peek() { return this.tokens[this.pos]; }

  private expr(sign: 1 | -1): FormulaLine[] {
    let lines = this.term(sign);
    for (;;) {
      const t = this.peek();
      if (t?.kind === 'op' && (t.value === '+' || t.value === '-')) {
        this.pos++;
        const s = (t.value === '-' ? -sign : sign) as 1 | -1;
        lines = lines.concat(this.term(s));
      } else break;
    }
    return lines;
  }

  private term(sign: 1 | -1): FormulaLine[] {
    const t = this.peek();
    if (!t) throw new Error('Formule incomplète');
    if (t.kind === 'lparen') {
      this.pos++;
      const inner = this.expr(sign);
      if (this.peek()?.kind !== 'rparen') throw new Error('Parenthèse non fermée');
      this.pos++;
      return inner;
    }
    if (t.kind === 'op' && t.value === '-') {
      // signe négatif en tête : "-2"
      this.pos++;
      return this.term((-sign) as 1 | -1);
    }
    if (t.kind !== 'num') throw new Error('Un nombre est attendu');
    this.pos++;
    const next = this.peek();
    if (next?.kind === 'op' && (next.value === '*' || next.value === 'x')) {
      this.pos++;
      const b = this.peek();
      if (b?.kind !== 'num') throw new Error('Un nombre est attendu après ×');
      this.pos++;
      // La quantité est le facteur entier ; s'il y en a deux, le premier.
      let qty: typeof t, price: typeof t;
      if (t.isInteger && !b.isInteger) { qty = t; price = b; }
      else if (!t.isInteger && b.isInteger) { qty = b; price = t; }
      else if (t.isInteger && b.isInteger) { qty = t; price = b; }
      else return [{ quantity: 1, unitPriceCents: sign * toCents(t.value * b.value) }];
      if (qty.value < 1) throw new Error('Quantité invalide');
      return [{ quantity: qty.value, unitPriceCents: sign * toCents(price.value) }];
    }
    return [{ quantity: 1, unitPriceCents: sign * toCents(t.value) }];
  }
}

export function parseFormula(input: string): FormulaResult {
  if (!input.trim()) return { ok: false, error: 'Montant vide' };
  try {
    const lines = new Parser(tokenize(input)).parse();
    const totalCents = lines.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
    return { ok: true, lines, totalCents };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Vrai si l'entrée est une formule (et pas un simple montant). */
export const isFormula = (input: string) => /[+\-*x×()]/i.test(input.trim().replace(/^-/, ''));
