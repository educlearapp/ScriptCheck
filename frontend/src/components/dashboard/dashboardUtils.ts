export function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function firstName(fullName: string): string {
  return fullName.split(" ")[0] ?? fullName;
}

export function currentTerm(): string {
  const month = new Date().getMonth();
  if (month >= 0 && month <= 2) return "Term 1";
  if (month >= 3 && month <= 5) return "Term 2";
  if (month >= 6 && month <= 8) return "Term 3";
  return "Term 4";
}

export function currentYear(): number {
  return new Date().getFullYear();
}
