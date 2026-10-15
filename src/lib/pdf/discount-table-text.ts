type PositionedText = {
  str: string;
  transform: number[];
  width: number;
  hasEOL: boolean;
};

/** Keep an empty final amount distinct from a populated discount column. */
export const preserveEmptyDiscountAmounts = (items: PositionedText[]): string | null => {
  const discount = items.find((item) => item.str.trim() === "Знижка");
  const finalAmount = items.find(
    (item) =>
      item.str.trim() === "Сума без" && discount && item.transform[4] > discount.transform[4],
  );
  const number = items.find((item) => item.str.trim() === "№");
  if (!discount || !finalAmount || !number) return null;

  const finalColumnStart = (discount.transform[4] + discount.width + finalAmount.transform[4]) / 2;
  const footerIndex = items.findIndex((item) => item.str.trim() === "Разом:");
  if (footerIndex < 0) return null;
  const rows = items.flatMap((item, index) =>
    index < footerIndex &&
    item.transform[5] < number.transform[5] &&
    item.transform[4] < number.transform[4] + number.width &&
    /^\d+$/u.test(item.str.trim())
      ? [index]
      : [],
  );
  const insertions = new Set<number>();
  for (const [index, start] of rows.entries()) {
    const end = rows[index + 1] ?? footerIndex;
    const row = items.slice(start, end);
    const hasFinalAmount = row.some(
      (item) => item.transform[4] >= finalColumnStart && /\d/u.test(item.str),
    );
    const hasDiscount = row.some(
      (item) =>
        item.transform[4] >= discount.transform[4] - discount.width / 2 &&
        item.transform[4] < finalColumnStart &&
        /\d[,.]\d{2}$/u.test(item.str.trim()),
    );
    if (!hasFinalAmount && hasDiscount) insertions.add(end);
  }
  if (insertions.size === 0) return null;
  return items
    .map(
      (item, index) =>
        `${insertions.has(index) ? " 0,00 " : ""}${item.str}${item.hasEOL ? "\n" : " "}`,
    )
    .join("");
};
