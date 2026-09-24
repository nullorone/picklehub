import createClient from "openapi-fetch";
import type { paths } from "./generated/schema";

export type { components, operations, paths } from "./generated/schema";

export const createApiClient = (baseUrl: string, accessToken?: string) =>
    createClient<paths>({
        baseUrl,
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    });
