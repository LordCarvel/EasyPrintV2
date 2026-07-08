export function parsePedidos(input) {
  return input
    .split(/[\n,]/)
    .map((p) => p.trim())
    .filter((p) => p !== '');
}
