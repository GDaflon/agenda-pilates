/** minúsculas + sem acentos, para busca tolerante */
export function norm(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function primeiroNome(nome: string): string {
  return nome.split(' ')[0];
}

export function titleCase(s: string): string {
  return s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(^|\s)\S/g, (c) => c.toUpperCase());
}
