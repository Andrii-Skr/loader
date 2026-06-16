const DEFAULT_SOURCE_CODE = "idz-ukr";
const DEFAULT_SOURCE_NAME = "IDZ-UKR";
const DEFAULT_SOURCE_SCHEMA = "idz_ukr";

const stripSchemaQueryParam = (connectionString: string): string => {
  const url = new URL(connectionString);
  url.searchParams.delete("schema");
  return url.toString();
};

export const getExternalEditionSourceCode = () =>
  process.env.EXTERNAL_EDITION_SOURCE_CODE?.trim() || DEFAULT_SOURCE_CODE;

export const getExternalEditionSourceName = () =>
  process.env.EXTERNAL_EDITION_SOURCE_NAME?.trim() || DEFAULT_SOURCE_NAME;

export const getExternalEditionSchema = () =>
  process.env.EXTERNAL_EDITION_SCHEMA?.trim() || DEFAULT_SOURCE_SCHEMA;

export const getExternalEditionConnectionString = () => {
  const explicitConnection = process.env.EXTERNAL_EDITION_DATABASE_URL?.trim();

  if (explicitConnection) {
    return stripSchemaQueryParam(explicitConnection);
  }

  const sharedConnection = process.env.DATABASE_URL?.trim();

  if (!sharedConnection) {
    throw new Error("DATABASE_URL is required to access the external edition source.");
  }

  return stripSchemaQueryParam(sharedConnection);
};
