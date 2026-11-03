const dateFormat = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });
const moneyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatDate = (iso: string) => dateFormat.format(new Date(iso));
export const formatCents = (cents: number) => moneyFormat.format(cents / 100);

/** "Vitamin D, 60 softgels" becomes "Vitamin D". */
export const shortName = (name: string) => name.split(/[,(]/)[0].trim();
