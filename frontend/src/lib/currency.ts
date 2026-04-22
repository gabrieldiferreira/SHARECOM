export type Currency = 'BRL' | 'USD' | 'EUR';

export function getCurrencyFromCookie(): Currency {
  if (typeof document === 'undefined') return 'BRL';
  const match = document.cookie.match(new RegExp('(^| )CURRENCY=([^;]+)'));
  return (match?.[2] as Currency) || 'BRL';
}

export function formatCurrency(amount: number, currency?: Currency): string {
  const curr = currency || getCurrencyFromCookie();
  
  const localeMap: Record<Currency, string> = {
    BRL: 'pt-BR',
    USD: 'en-US',
    EUR: 'de-DE',
  };

  return new Intl.NumberFormat(localeMap[curr], {
    style: 'currency',
    currency: curr,
  }).format(amount);
}

export function getCurrencySymbol(currency?: Currency): string {
  const curr = currency || getCurrencyFromCookie();
  const symbols: Record<Currency, string> = {
    BRL: 'R$',
    USD: '$',
    EUR: '€',
  };
  return symbols[curr];
}
