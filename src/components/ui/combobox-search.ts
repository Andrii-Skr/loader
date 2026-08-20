const SEARCH_SEPARATOR_PATTERN = /[^0-9\p{L}]+/gu;

const normalizeSearchValue = (value: string) =>
  value.toLocaleLowerCase("uk-UA").replace(SEARCH_SEPARATOR_PATTERN, " ").trim();

const compactSearchValue = (value: string) =>
  value.toLocaleLowerCase("uk-UA").replace(SEARCH_SEPARATOR_PATTERN, "");

export const matchesNormalizedComboboxSearch = (label: string, query: string) => {
  const normalizedQuery = normalizeSearchValue(query);

  if (!normalizedQuery) {
    return true;
  }

  const normalizedLabel = normalizeSearchValue(label);

  return (
    normalizedLabel.includes(normalizedQuery) ||
    compactSearchValue(label).includes(compactSearchValue(query))
  );
};
