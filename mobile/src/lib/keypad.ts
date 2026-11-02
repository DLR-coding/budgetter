// Pavé numérique de la saisie rapide : chaque touche transforme le texte saisi.
// Le texte reste une formule lisible par parseFormula : « 12+2+5×2,99 ».
// Règles : 2 décimales max, une virgule par nombre, pas de zéro de tête,
// pas d'opérateur en tête ni en double, un seul « × » par article.

export type Key = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | ',' | '+' | '×' | 'del';

const MAX_INT_DIGITS = 6; // 999 999 € : largement assez pour un achat

export function pressKey(input: string, key: Key): string {
  if (key === 'del') return input.slice(0, -1);

  const last = input.at(-1) ?? '';
  const lastIsOp = last === '+' || last === '×';
  const number = input.split(/[+×]/).at(-1) ?? ''; // nombre en cours de saisie

  if (key === '+' || key === '×') {
    if (input === '') return input;
    if (lastIsOp) return input.slice(0, -1) + key; // remplace l'opérateur précédent
    if (key === '×' && (input.split('+').at(-1) ?? '').includes('×')) return input; // « 5×2×3 » refusé
    return input + key;
  }

  if (key === ',') {
    if (number.includes(',')) return input;
    return input + (number === '' ? '0,' : ',');
  }

  // chiffre
  const [int, dec] = number.split(',');
  if (dec !== undefined) return dec.length >= 2 ? input : input + key;
  if (int === '0') return input.slice(0, -1) + key; // « 0 » puis « 5 » → « 5 »
  if (int.length >= MAX_INT_DIGITS) return input;
  return input + key;
}

/** Texte saisi → suite de touches (pratique pour les tests). */
export const typeKeys = (keys: Key[], start = '') => keys.reduce(pressKey, start);
