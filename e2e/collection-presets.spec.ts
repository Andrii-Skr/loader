import { expect, test } from "@playwright/test";

import { prisma } from "@/lib/prisma";
import {
  searchExternalEditions,
  searchExternalIssueNumbersByEdition,
} from "@/lib/publication-mappings/external-repository";

test.use({ actionTimeout: 15_000, navigationTimeout: 30_000 });

test("remembers edition-only composition, reapplies aliases and preserves saved allocations", async ({
  page,
}) => {
  const login = process.env.E2E_ADMIN_LOGIN ?? process.env.ADMIN_LOGIN;
  const password = process.env.E2E_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD;
  if (!login || !password) throw new Error("Local E2E credentials are required");
  const name = `E2E collection ${Date.now()}`;
  const editions = [];
  const names = new Set<string>();
  for (const edition of await searchExternalEditions("")) {
    if (names.has(edition.name)) continue;
    const issues = await searchExternalIssueNumbersByEdition({ externalEditionId: edition.id });
    const nextIssue = issues.find((issue) => issue.number !== issues[0]?.number);
    if (!issues[0] || !nextIssue) continue;
    editions.push({ ...edition, issue: issues[0], nextIssue });
    names.add(edition.name);
    if (editions.length === 2) break;
  }
  if (editions.length !== 2) throw new Error("Need two catalogue editions with issues");
  const documentIds: number[] = [];
  const publicationIds: number[] = [];
  const issueNumberIds: number[] = [];
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  try {
    for (const description of [`${name} raw`, `${name} another variant`, `${name} raw`]) {
      const doc = await prisma.document.create({
        data: {
          sourceFileName: `${name}.pdf`,
          documentTypeId: 2,
          lineItems: {
            create: {
              lineNo: 1,
              description,
              quantity: "10",
              unitPrice: "2",
              lineBaseAmount: "20",
              lineVatAmount: "0",
              vatRate: "0",
            },
          },
        },
      });
      documentIds.push(doc.id);
    }
    await page.goto("/ru/login");
    await page.getByLabel("Логин").fill(login);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/\/ru\/dashboard\/?$/);
    const openDocument = async (id: number) => {
      await page.goto(`/ru/dashboard/publication-issue-mappings?documentId=${id}`);
      await page.getByRole("button", { name: "Добавить строку", exact: true }).click();
      await expect(
        page.getByRole("button", { name: "Запомнить состав", exact: true }),
      ).toBeVisible();
    };
    await openDocument(documentIds[0]);
    await page.getByLabel("Название сборника", { exact: true }).fill(name);
    await page.getByRole("spinbutton", { name: "Количество", exact: true }).first().fill("6.45");
    await page.getByRole("button", { name: "Добавить издание", exact: true }).click();
    await expect(
      page.getByRole("spinbutton", { name: "Количество", exact: true }).nth(1),
    ).toHaveValue("3.55");
    for (const [index, edition] of editions.entries()) {
      await page.getByRole("button", { name: "Издание", exact: true }).nth(index).click();
      await page.getByPlaceholder("Необязательный текст для поиска изданий").fill(edition.name);
      await page.getByRole("button", { name: edition.name, exact: true }).first().click();
      await page.getByRole("button", { name: "Номер", exact: true }).nth(index).click();
      await expect(page.getByPlaceholder("Необязательный текст для поиска номеров")).toHaveValue(
        "",
      );
      await expect(
        page.getByRole("button", { name: edition.issue.number, exact: true }).first(),
      ).toBeVisible();
      await page.keyboard.press("Escape");
    }
    await page.getByRole("button", { name: "Запомнить состав", exact: true }).click();
    await expect(
      page.getByText("Состав и вариант названия сохранены.", { exact: true }),
    ).toBeVisible();
    const saved = await prisma.collectionPreset.findFirstOrThrow({
      where: { name },
      include: { editions: true },
    });
    expect(saved.editions.map((edition) => edition.externalEditionId)).toEqual(
      editions.map((edition) => edition.id),
    );
    await openDocument(documentIds[0]);
    const quantities = page.getByRole("spinbutton").filter({ hasNot: page.locator("[hidden]") });
    // Each allocation has a quantity followed by a unit-price input.
    await expect(quantities).toHaveCount(4);
    await expect(quantities.nth(0)).toHaveValue("");
    await expect(quantities.nth(2)).toHaveValue("");
    await expect(quantities.nth(1)).toHaveValue("2.00");
    await expect(
      page
        .getByRole("button", { name: "Номер", exact: true })
        .filter({ hasText: "Выберите номер" }),
    ).toHaveCount(2);
    for (const [index, edition] of editions.entries()) {
      await page
        .getByRole("button", { name: "Номер", exact: true })
        .filter({ hasText: "Выберите номер" })
        .first()
        .click();
      await expect(page.getByPlaceholder("Необязательный текст для поиска номеров")).toHaveValue(
        "",
      );
      await page.getByRole("button", { name: edition.issue.number, exact: true }).first().click();
      await quantities.nth(index * 2).fill("5");
    }
    await page.getByRole("button", { name: "Сохранить распределение", exact: true }).click();
    await expect(page.getByText("Соответствия сохранены.", { exact: true })).toBeVisible();
    const before = await prisma.specialDocumentExternalMatch.findMany({
      where: { specialDocument: { documentId: documentIds[0] } },
    });
    expect(before).toHaveLength(2);
    await openDocument(documentIds[0]);
    await expect(page.getByRole("spinbutton").nth(0)).toHaveValue("5");
    await openDocument(documentIds[2]);
    await expect(page.getByRole("spinbutton").nth(0)).toHaveValue("");
    await expect(
      page
        .getByRole("button", { name: "Номер", exact: true })
        .filter({ hasText: "Выберите номер" }),
    ).toHaveCount(2);
    // The same composition must resolve issues from the current parsed pair, never a prior document.
    const publication = await prisma.publication.create({
      data: { displayName: name, normalizedName: name.toLowerCase() },
    });
    publicationIds.push(publication.id);
    for (const [index, issue] of [editions[0].issue, editions[0].nextIssue].entries()) {
      const issueNumber = await prisma.issueNumber.create({
        data: {
          rawValue: issue.number,
          canonicalValue: issue.number,
          normalizedValue: `${name} issue ${index}`,
        },
      });
      issueNumberIds.push(issueNumber.id);
      const pair = await prisma.publicationIssue.create({
        data: { publicationId: publication.id, issueNumberId: issueNumber.id },
      });
      const doc = await prisma.document.create({
        data: {
          sourceFileName: `${name}.pdf`,
          documentTypeId: 2,
          lineItems: {
            create: {
              lineNo: 1,
              description: `${name} ${issue.number}`,
              publicationIssueId: pair.id,
              quantity: "10",
              unitPrice: "4",
              lineBaseAmount: "40",
              lineVatAmount: "0",
              vatRate: "0",
            },
          },
        },
      });
      documentIds.push(doc.id);
      await openDocument(doc.id);
      const selectedIssue = page.getByRole("button", { name: "Номер", exact: true }).first();
      await expect(selectedIssue).toHaveText(issue.number);
      await expect(page.getByRole("spinbutton").nth(0)).toHaveValue("");
      await expect(page.getByRole("spinbutton").nth(1)).toHaveValue("4.00");
      expect(
        await prisma.specialDocumentExternalMatch.count({
          where: { specialDocument: { documentId: doc.id } },
        }),
      ).toBe(0);
    }
    await openDocument(documentIds[1]);
    await page.getByRole("button", { name: "Сохранённый состав", exact: true }).click();
    await page.getByPlaceholder("Поиск составов").fill(name);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.getByRole("spinbutton")).toHaveCount(4);
    await page.getByRole("button", { name: "Запомнить состав", exact: true }).click();
    await expect(
      page.getByText("Состав и вариант названия сохранены.", { exact: true }),
    ).toBeVisible();
    await openDocument(documentIds[1]);
    await expect(page.getByText(`Выбранный состав: ${name}`, { exact: true })).toBeVisible();
    await expect(page.getByRole("spinbutton")).toHaveCount(4);
    await page.getByRole("button", { name: "Забыть состав", exact: true }).click();
    await expect(
      page.getByText("Состав удалён. Распределения документов сохранены.", { exact: true }),
    ).toBeVisible();
    expect(await prisma.collectionPresetAlias.count({ where: { presetId: saved.id } })).toBe(0);
    expect(await prisma.collectionPresetEdition.count({ where: { presetId: saved.id } })).toBe(0);
    expect(
      await prisma.specialDocumentExternalMatch.findMany({
        where: { specialDocument: { documentId: documentIds[0] } },
      }),
    ).toEqual(before);
    expect(errors).toEqual([]);
  } finally {
    await prisma.collectionPreset.deleteMany({ where: { name } });
    await prisma.document.deleteMany({ where: { id: { in: documentIds } } });
    await prisma.publication.deleteMany({ where: { id: { in: publicationIds } } });
    await prisma.issueNumber.deleteMany({ where: { id: { in: issueNumberIds } } });
  }
});
