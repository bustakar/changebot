/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as commits from "../commits.js";
import type * as commitsInternal from "../commitsInternal.js";
import type * as commitsQuery from "../commitsQuery.js";
import type * as releases from "../releases.js";
import type * as releasesInternal from "../releasesInternal.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  commits: typeof commits;
  commitsInternal: typeof commitsInternal;
  commitsQuery: typeof commitsQuery;
  releases: typeof releases;
  releasesInternal: typeof releasesInternal;
}>;
declare const fullApiWithMounts: typeof fullApi;

export declare const api: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApiWithMounts,
  FunctionReference<any, "internal">
>;

export declare const components: {};
