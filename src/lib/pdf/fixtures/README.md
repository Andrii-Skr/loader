# Synthetic parser fixtures

All documents under `order-invoices/` are fictional test data, including company
names, document and order numbers, dates, quantities, prices and totals. The
positioned text cells use a synthetic coordinate grid, not an exported PDF.

The cases cover wrapped headers/descriptions, joined unit and price cells,
three-decimal quantities, language suffixes, repeated pages, partial discounts
and a fully discounted row with an empty final amount.

Keep these fixtures in Git so tests work in clean checkouts and CI. Do not add
real documents, OCR exports, bank details, addresses, personal names or document
screenshots. Put local inspection artifacts in the ignored `tmp/` directory.
