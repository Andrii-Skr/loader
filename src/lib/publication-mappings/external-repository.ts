import { Pool } from "pg";

import {
  getExternalEditionConnectionString,
  getExternalEditionSchema,
} from "@/lib/publication-mappings/config";
import { tokenizeMatchingText } from "@/lib/publication-mappings/matching";

type ExternalEditionRecord = {
  id: number;
  name: string;
};

type ExternalIssueRecord = {
  id: number;
  number: string;
};

type ExactCountRecord = {
  key: string;
  count: number;
};

const globalForExternalEditionPool = globalThis as unknown as {
  externalEditionPool: Pool | undefined;
};

const schemaIdentifierPattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

const quoteSchemaIdentifier = (schema: string) => {
  if (!schemaIdentifierPattern.test(schema)) {
    throw new Error(`Unsafe external edition schema name: ${schema}`);
  }

  return `"${schema}"`;
};

const pool =
  globalForExternalEditionPool.externalEditionPool ??
  new Pool({
    connectionString: getExternalEditionConnectionString(),
  });

if (process.env.NODE_ENV !== "production") {
  globalForExternalEditionPool.externalEditionPool = pool;
}

const buildLikeClauses = (
  tokens: string[],
  columnSql: string,
  {
    joiner = " OR ",
    startingParamIndex = 1,
  }: {
    joiner?: " OR " | " AND ";
    startingParamIndex?: number;
  } = {},
) => {
  if (tokens.length === 0) {
    return {
      sql: joiner === " AND " ? "TRUE" : "FALSE",
      params: [] as string[],
    };
  }

  return {
    sql: tokens.map((_, index) => `${columnSql} ILIKE $${startingParamIndex + index}`).join(joiner),
    params: tokens.map((token) => `%${token}%`),
  };
};

const SEARCH_PUNCTUATION_PATTERN = /[.,/\\()[\]{}"'`:+*?!_-]+/g;

const tokenizeExternalSearchQuery = (query: string) =>
  query
    .toLocaleLowerCase("uk-UA")
    .replace(SEARCH_PUNCTUATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0);

export const searchExternalEditions = async (query: string) => {
  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const trimmedQuery = query.trim();

  if (trimmedQuery.length === 0) {
    const result = await pool.query<{
      externalEditionId: number;
      externalEditionName: string;
    }>(
      `
        SELECT
          "КодИздания" AS "externalEditionId",
          "Издание" AS "externalEditionName"
        FROM ${schemaSql}."Издание"
        WHERE COALESCE("Устарело", FALSE) = FALSE
        ORDER BY "КодИздания" DESC, "Издание" ASC
        LIMIT 80
      `,
    );

    return result.rows.map((row) => ({
      id: row.externalEditionId,
      name: row.externalEditionName,
    })) satisfies ExternalEditionRecord[];
  }

  const rawTokens = tokenizeExternalSearchQuery(trimmedQuery).slice(0, 6);
  const meaningfulTokens = rawTokens.filter((token) => token.length > 1);
  const rankingTokens = meaningfulTokens.length > 0 ? meaningfulTokens : rawTokens;
  const rankingTokenParams = rankingTokens.map((token) => `%${token}%`);
  const exactSql = `lower(trim("Издание")) = $1`;
  const { sql: allTokensSql } = buildLikeClauses(rankingTokens, `"Издание"`, {
    joiner: " AND ",
    startingParamIndex: 2,
  });
  const { sql: anyTokensSql } = buildLikeClauses(rankingTokens, `"Издание"`, {
    joiner: " OR ",
    startingParamIndex: 2,
  });

  const result = await pool.query<{
    externalEditionId: number;
    externalEditionName: string;
  }>(
    `
      SELECT
        "КодИздания" AS "externalEditionId",
        "Издание" AS "externalEditionName"
      FROM ${schemaSql}."Издание"
      WHERE COALESCE("Устарело", FALSE) = FALSE
        AND (
          ${exactSql}
          OR (${allTokensSql})
          OR (${anyTokensSql})
        )
      ORDER BY
        CASE
          WHEN ${exactSql} THEN 0
          WHEN (${allTokensSql}) THEN 1
          ELSE 2
        END,
        "КодИздания" DESC,
        "Издание" ASC
      LIMIT 120
    `,
    [trimmedQuery.toLocaleLowerCase("uk-UA"), ...rankingTokenParams],
  );

  return result.rows.map((row) => ({
    id: row.externalEditionId,
    name: row.externalEditionName,
  })) satisfies ExternalEditionRecord[];
};

export const searchExternalIssueNumbers = async (query: string) => {
  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const trimmedQuery = query.trim();
  const normalizedQuery = trimmedQuery.toLocaleLowerCase("uk-UA");
  const tokens = tokenizeMatchingText(query).slice(0, 6);

  if (trimmedQuery.length === 0) {
    const result = await pool.query<{
      externalIssueId: number;
      externalIssueNumber: string;
    }>(
      `
      SELECT
        "КодНомера" AS "externalIssueId",
        "Номер" AS "externalIssueNumber"
      FROM ${schemaSql}."Номер_Издания"
      ORDER BY "КодНомера" DESC, "Номер" ASC
      LIMIT 80
    `,
    );

    return result.rows.map((row) => ({
      id: row.externalIssueId,
      number: row.externalIssueNumber,
    })) satisfies ExternalIssueRecord[];
  }

  const tokenParams = tokens.map((token) => `%${token}%`);
  const exactSql = `lower(trim("Номер")) = $1`;
  const allTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `"Номер" ILIKE $${index + 2}`).join(" AND ")
      : "FALSE";
  const anyTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `"Номер" ILIKE $${index + 2}`).join(" OR ")
      : "FALSE";

  const result = await pool.query<{
    externalIssueId: number;
    externalIssueNumber: string;
  }>(
    `
      SELECT
        "КодНомера" AS "externalIssueId",
        "Номер" AS "externalIssueNumber"
      FROM ${schemaSql}."Номер_Издания"
      WHERE ${exactSql}
        OR (${allTokensSql})
        OR (${anyTokensSql})
      ORDER BY
        CASE
          WHEN ${exactSql} THEN 0
          WHEN (${allTokensSql}) THEN 1
          ELSE 2
        END,
        "КодНомера" DESC,
        "Номер" ASC
      LIMIT 120
    `,
    [normalizedQuery, ...tokenParams],
  );

  return result.rows.map((row) => ({
    id: row.externalIssueId,
    number: row.externalIssueNumber,
  })) satisfies ExternalIssueRecord[];
};

export const getExternalEditionsByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await pool.query<{
    externalEditionId: number;
    externalEditionName: string;
  }>(
    `
      SELECT
        "КодИздания" AS "externalEditionId",
        "Издание" AS "externalEditionName"
      FROM ${schemaSql}."Издание"
      WHERE "КодИздания" = ANY($1::int[])
    `,
    [ids],
  );

  return result.rows.map((row) => ({
    id: row.externalEditionId,
    name: row.externalEditionName,
  })) satisfies ExternalEditionRecord[];
};

export const getExternalIssueNumbersByIds = async (ids: number[]) => {
  if (ids.length === 0) {
    return [];
  }

  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await pool.query<{
    externalIssueId: number;
    externalIssueNumber: string;
  }>(
    `
      SELECT
        "КодНомера" AS "externalIssueId",
        "Номер" AS "externalIssueNumber"
      FROM ${schemaSql}."Номер_Издания"
      WHERE "КодНомера" = ANY($1::int[])
    `,
    [ids],
  );

  return result.rows.map((row) => ({
    id: row.externalIssueId,
    number: row.externalIssueNumber,
  })) satisfies ExternalIssueRecord[];
};

export const getExactExternalEditionCounts = async (names: string[]) => {
  if (names.length === 0) {
    return new Map<string, number>();
  }

  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await pool.query<ExactCountRecord>(
    `
      SELECT
        lower(trim("Издание")) AS "key",
        count(*)::int AS "count"
      FROM ${schemaSql}."Издание"
      WHERE COALESCE("Устарело", FALSE) = FALSE
        AND lower(trim("Издание")) = ANY($1::text[])
      GROUP BY lower(trim("Издание"))
    `,
    [names.map((name) => name.trim().toLocaleLowerCase("uk-UA"))],
  );

  return new Map(result.rows.map((row) => [row.key, row.count]));
};

export const getExactExternalIssueNumberCounts = async (numbers: string[]) => {
  if (numbers.length === 0) {
    return new Map<string, number>();
  }

  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await pool.query<ExactCountRecord>(
    `
      SELECT
        lower(trim("Номер")) AS "key",
        count(*)::int AS "count"
      FROM ${schemaSql}."Номер_Издания"
      WHERE lower(trim("Номер")) = ANY($1::text[])
      GROUP BY lower(trim("Номер"))
    `,
    [numbers.map((number) => number.trim().toLocaleLowerCase("uk-UA"))],
  );

  return new Map(result.rows.map((row) => [row.key, row.count]));
};
