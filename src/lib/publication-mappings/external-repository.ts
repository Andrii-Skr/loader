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

export type ExternalIssuePairRecord = {
  externalEditionId: number;
  externalEditionName: string;
  externalIssueId: number;
  externalIssueNumber: string;
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
const ISSUE_NUMBER_COMPACT_PATTERN = /[^0-9\p{L}]+/gu;

const tokenizeExternalSearchQuery = (query: string) =>
  query
    .toLocaleLowerCase("uk-UA")
    .replace(SEARCH_PUNCTUATION_PATTERN, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter((token) => token.length > 0);

const compactIssueNumberSearchQuery = (query: string) =>
  query.toLocaleLowerCase("uk-UA").replace(ISSUE_NUMBER_COMPACT_PATTERN, "");

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
  const compactQuery = compactIssueNumberSearchQuery(trimmedQuery);
  const tokens = tokenizeMatchingText(query).slice(0, 6);

  if (trimmedQuery.length === 0) {
    const result = await pool.query<{
      externalIssueId: number;
      externalIssueNumber: string;
    }>(
      `
        SELECT
          dedup."externalIssueId",
          dedup."externalIssueNumber"
        FROM (
          SELECT DISTINCT
            issue."КодНомера" AS "externalIssueId",
            issue."Номер" AS "externalIssueNumber"
          FROM ${schemaSql}."ПриходТовар" goods
          INNER JOIN ${schemaSql}."Номер_Издания" issue
            ON issue."КодНомера" = goods."КодНомера"
        ) dedup
        ORDER BY dedup."externalIssueId" DESC, dedup."externalIssueNumber" ASC
        LIMIT 80
      `,
    );

    return result.rows.map((row) => ({
      id: row.externalIssueId,
      number: row.externalIssueNumber,
    })) satisfies ExternalIssueRecord[];
  }

  const tokenParams = tokens.map((token) => `%${token}%`);
  const exactSql = `lower(trim(dedup."externalIssueNumber")) = $1`;
  const compactExactSql =
    compactQuery.length > 0
      ? `regexp_replace(lower(trim(dedup."externalIssueNumber")), '[^0-9[:alpha:]]+', '', 'g') = $2`
      : "FALSE";
  const allTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `dedup."externalIssueNumber" ILIKE $${index + 3}`).join(" AND ")
      : "FALSE";
  const anyTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `dedup."externalIssueNumber" ILIKE $${index + 3}`).join(" OR ")
      : "FALSE";

  const result = await pool.query<{
    externalIssueId: number;
    externalIssueNumber: string;
  }>(
    `
      SELECT
        dedup."externalIssueId",
        dedup."externalIssueNumber"
      FROM (
        SELECT DISTINCT
          issue."КодНомера" AS "externalIssueId",
          issue."Номер" AS "externalIssueNumber"
        FROM ${schemaSql}."ПриходТовар" goods
        INNER JOIN ${schemaSql}."Номер_Издания" issue
          ON issue."КодНомера" = goods."КодНомера"
      ) dedup
      WHERE ${exactSql}
        OR (${compactExactSql})
        OR (${allTokensSql})
        OR (${anyTokensSql})
      ORDER BY
        CASE
          WHEN ${exactSql} THEN 0
          WHEN (${compactExactSql}) THEN 1
          WHEN (${allTokensSql}) THEN 2
          ELSE 3
        END,
        dedup."externalIssueId" DESC,
        dedup."externalIssueNumber" ASC
      LIMIT 400
    `,
    [normalizedQuery, compactQuery, ...tokenParams],
  );

  return result.rows.map((row) => ({
    id: row.externalIssueId,
    number: row.externalIssueNumber,
  })) satisfies ExternalIssueRecord[];
};

export const searchExternalIssueNumbersByEdition = async ({
  externalEditionId,
  query,
}: {
  externalEditionId: number;
  query?: string;
}) => {
  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const trimmedQuery = query?.trim() ?? "";
  const normalizedQuery = trimmedQuery.toLocaleLowerCase("uk-UA");
  const compactQuery = compactIssueNumberSearchQuery(trimmedQuery);
  const tokens = tokenizeMatchingText(trimmedQuery).slice(0, 6);

  if (trimmedQuery.length === 0) {
    const result = await pool.query<{
      externalIssueId: number;
      externalIssueNumber: string;
    }>(
      `
        SELECT
          dedup."externalIssueId",
          dedup."externalIssueNumber"
        FROM (
          SELECT DISTINCT
            issue."КодНомера" AS "externalIssueId",
            issue."Номер" AS "externalIssueNumber"
          FROM ${schemaSql}."ПриходТовар" goods
          INNER JOIN ${schemaSql}."Номер_Издания" issue
            ON issue."КодНомера" = goods."КодНомера"
          WHERE goods."КодИздания" = $1
        ) dedup
        ORDER BY dedup."externalIssueId" DESC, dedup."externalIssueNumber" ASC
        LIMIT 120
      `,
      [externalEditionId],
    );

    return result.rows.map((row) => ({
      id: row.externalIssueId,
      number: row.externalIssueNumber,
    })) satisfies ExternalIssueRecord[];
  }

  const tokenParams = tokens.map((token) => `%${token}%`);
  const exactSql = `lower(trim(dedup."externalIssueNumber")) = $2`;
  const compactExactSql =
    compactQuery.length > 0
      ? `regexp_replace(lower(trim(dedup."externalIssueNumber")), '[^0-9[:alpha:]]+', '', 'g') = $3`
      : "FALSE";
  const allTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `dedup."externalIssueNumber" ILIKE $${index + 4}`).join(" AND ")
      : "FALSE";
  const anyTokensSql =
    tokens.length > 0
      ? tokens.map((_, index) => `dedup."externalIssueNumber" ILIKE $${index + 4}`).join(" OR ")
      : "FALSE";

  const result = await pool.query<{
    externalIssueId: number;
    externalIssueNumber: string;
  }>(
    `
      SELECT
        dedup."externalIssueId",
        dedup."externalIssueNumber"
      FROM (
        SELECT DISTINCT
          issue."КодНомера" AS "externalIssueId",
          issue."Номер" AS "externalIssueNumber"
        FROM ${schemaSql}."ПриходТовар" goods
        INNER JOIN ${schemaSql}."Номер_Издания" issue
          ON issue."КодНомера" = goods."КодНомера"
        WHERE goods."КодИздания" = $1
      ) dedup
      WHERE ${exactSql}
        OR (${compactExactSql})
        OR (${allTokensSql})
        OR (${anyTokensSql})
      ORDER BY
        CASE
          WHEN ${exactSql} THEN 0
          WHEN (${compactExactSql}) THEN 1
          WHEN (${allTokensSql}) THEN 2
          ELSE 3
        END,
        dedup."externalIssueId" DESC,
        dedup."externalIssueNumber" ASC
      LIMIT 400
    `,
    [externalEditionId, normalizedQuery, compactQuery, ...tokenParams],
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

export const getExternalIssuePairsByIds = async (
  pairs: Array<{ externalEditionId: number; externalIssueId: number }>,
) => {
  const uniquePairs = Array.from(
    new Map(
      pairs.map((pair) => [`${pair.externalEditionId}:${pair.externalIssueId}`, pair] as const),
    ).values(),
  );

  if (uniquePairs.length === 0) {
    return [];
  }

  const schemaSql = quoteSchemaIdentifier(getExternalEditionSchema());
  const result = await pool.query<ExternalIssuePairRecord>(
    `
      WITH requested_pairs AS (
        SELECT *
        FROM unnest($1::int[], $2::int[]) AS requested("externalEditionId", "externalIssueId")
      )
      SELECT DISTINCT ON (requested."externalEditionId", requested."externalIssueId")
        requested."externalEditionId",
        edition."Издание" AS "externalEditionName",
        requested."externalIssueId",
        issue."Номер" AS "externalIssueNumber"
      FROM requested_pairs requested
      INNER JOIN ${schemaSql}."ПриходТовар" goods
        ON goods."КодИздания" = requested."externalEditionId"
        AND goods."КодНомера" = requested."externalIssueId"
      INNER JOIN ${schemaSql}."Издание" edition
        ON edition."КодИздания" = requested."externalEditionId"
      INNER JOIN ${schemaSql}."Номер_Издания" issue
        ON issue."КодНомера" = requested."externalIssueId"
      ORDER BY requested."externalEditionId", requested."externalIssueId"
    `,
    [
      uniquePairs.map((pair) => pair.externalEditionId),
      uniquePairs.map((pair) => pair.externalIssueId),
    ],
  );

  return result.rows satisfies ExternalIssuePairRecord[];
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
        lower(trim(dedup."externalIssueNumber")) AS "key",
        count(*)::int AS "count"
      FROM (
        SELECT DISTINCT
          issue."КодНомера" AS "externalIssueId",
          issue."Номер" AS "externalIssueNumber"
        FROM ${schemaSql}."ПриходТовар" goods
        INNER JOIN ${schemaSql}."Номер_Издания" issue
          ON issue."КодНомера" = goods."КодНомера"
      ) dedup
      WHERE lower(trim(dedup."externalIssueNumber")) = ANY($1::text[])
      GROUP BY lower(trim(dedup."externalIssueNumber"))
    `,
    [numbers.map((number) => number.trim().toLocaleLowerCase("uk-UA"))],
  );

  return new Map(result.rows.map((row) => [row.key, row.count]));
};
