export function getCoupleKey(userId: string, partnerId: string): string {
  const [a, b] = [userId, partnerId].sort();
  return `${a}-${b}`;
}
