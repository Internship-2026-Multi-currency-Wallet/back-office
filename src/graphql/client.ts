import type { TypedDocumentNode } from '@graphql-typed-document-node/core';
import { ClientError, GraphQLClient } from 'graphql-request';
import { type Client, createClient } from 'graphql-ws';
import { print } from 'graphql';
import { config } from '../config-env';
import type { StaffRefreshSessionMutation } from '../gql/wallet-core/graphql';
import { authorizationHeader } from './dev-auth';
import {
  accessToken,
  clearSession,
  loadSession,
  saveSession,
  sessionFromPayload,
  withSessionLock,
} from './session';
import { staffRefreshSessionMutation } from './session.wallet-core';

/** Backends this app talks to. */
export type Service = 'walletCore' | 'ratesService' | 'treasuryService';

const httpUrls: Record<Service, string> = {
  walletCore: config.walletCoreUrl,
  ratesService: config.ratesServiceUrl,
  treasuryService: config.treasuryServiceUrl,
};

const wsUrls: Partial<Record<Service, string>> = {
  ratesService: config.ratesServiceWsUrl,
  treasuryService: config.treasuryServiceWsUrl,
};

/** A signed-in staff session wins; the dev user is only the fallback while nobody is signed in. */
function headers(): Record<string, string> {
  const token = accessToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const authorization = authorizationHeader(config.devUser);
  return authorization ? { Authorization: authorization } : {};
}

const httpClients = new Map<Service, GraphQLClient>();

function httpClient(service: Service): GraphQLClient {
  let client = httpClients.get(service);
  if (!client) {
    // Absolute URL (graphql-request needs one); relative paths resolve against the page.
    const url = new URL(httpUrls[service], globalThis.location?.href).toString();
    // Only wallet-core owns the staff refresh cookie; other services get no credentials.
    client = new GraphQLClient(url, {
      headers,
      ...(service === 'walletCore' && { credentials: 'include' as const }),
    });
    httpClients.set(service, client);
  }
  return client;
}

/** A GraphQL error flattened for UI and Redux (serializable). */
export interface GraphQLRequestError {
  message: string;
  code?: string;
  /** Only `lockedUntil` (ACCOUNT_LOCKED) and `field` (BAD_USER_INPUT) from the server's extensions. */
  extensions?: Record<string, string>;
}

/** Only contract-approved string extensions may enter Redux: server diagnostics can contain input. */
const ALLOWED_EXTENSIONS = ['lockedUntil', 'field'] as const;

export function toRequestError(error: unknown): GraphQLRequestError {
  if (error instanceof ClientError) {
    const first = error.response.errors?.[0];
    const raw = first?.extensions ?? {};
    const extensions = Object.fromEntries(
      ALLOWED_EXTENSIONS.flatMap((key) =>
        typeof raw[key] === 'string' ? [[key, raw[key] as string]] : [],
      ),
    );
    return {
      // Never `error.message`: graphql-request puts the request with its variables (a password) in it.
      message: first?.message ?? `Request failed with HTTP ${error.response.status}`,
      code: (raw.code as string | undefined) ?? String(error.response.status),
      ...(Object.keys(extensions).length > 0 && { extensions }),
    };
  }
  return { message: error instanceof Error ? error.message : String(error) };
}

export function hasErrorCode(error: unknown, code: string): boolean {
  return (
    error instanceof ClientError &&
    !!error.response.errors?.some((e) => e.extensions?.code === code)
  );
}

export interface RequestOptions {
  /** Login and logout must not refresh: their `UNAUTHENTICATED` is final. */
  retryOnUnauthenticated?: boolean;
  /** Cancels the HTTP request, e.g. `AbortSignal.timeout(SESSION_TIMEOUT_MS)`. */
  signal?: AbortSignal;
}

/**
 * Queries and mutations over HTTP (graphql-request). Fully typed by the generated documents.
 * An expired access token (`UNAUTHENTICATED`) is refreshed once and the request is repeated once.
 */
export async function request<TResult, TVariables extends Record<string, unknown>>(
  service: Service,
  document: TypedDocumentNode<TResult, TVariables>,
  ...[variables, options]: TVariables extends Record<string, never>
    ? [variables?: TVariables, options?: RequestOptions]
    : [variables: TVariables, options?: RequestOptions]
): Promise<TResult> {
  const send = () =>
    httpClient(service).request<TResult>({
      document,
      variables: variables as Record<string, unknown> | undefined,
      signal: options?.signal,
    });
  const used = loadSession();
  try {
    return await send();
  } catch (error) {
    if (
      !used ||
      options?.retryOnUnauthenticated === false ||
      !hasErrorCode(error, 'UNAUTHENTICATED')
    ) {
      throw error;
    }
    // Another request may have refreshed already: then just repeat with its token.
    if (accessToken() === used.accessToken && !(await refreshSession())) throw error;
    // Signed out or signed in again meanwhile (even as the same staff member): never repeat it in another session.
    if (loadSession()?.sessionId !== used.sessionId) throw error;
    return send();
  }
}

/** wallet-core: the staff refresh cookie is missing, expired (8 h), rotated or revoked. */
export const INVALID_REFRESH_TOKEN = 'INVALID_REFRESH_TOKEN';
/** Login, refresh and logout hold the session lock: a hung one must not hold it (and every tab) forever. */
export const SESSION_TIMEOUT_MS = 15_000;

let refreshing: Promise<boolean> | null = null;

/**
 * `true` = a valid session exists now; `false` = it is over (and cleared). Network errors, 5xx and timeouts are
 * thrown and keep the session. One refresh per tab at a time; the lock orders it with other tabs.
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= refreshWithLock().finally(() => (refreshing = null));
  return refreshing;
}

async function refreshWithLock(): Promise<boolean> {
  const tokenAtStart = accessToken();
  return withSessionLock(async () => {
    // Changed while we waited: another tab refreshed (reuse its token), or somebody logged out / in.
    // Without a stored session there is nothing to refresh: the cookie alone never signs anybody in.
    if (accessToken() !== tokenAtStart || tokenAtStart === null) return accessToken() !== null;
    let payload: StaffRefreshSessionMutation['staffRefreshSession'];
    try {
      ({ staffRefreshSession: payload } = await httpClient(
        'walletCore',
      ).request<StaffRefreshSessionMutation>({
        document: staffRefreshSessionMutation,
        signal: AbortSignal.timeout(SESSION_TIMEOUT_MS),
      }));
    } catch (error) {
      if (!hasErrorCode(error, INVALID_REFRESH_TOKEN)) throw error;
      if (accessToken() === tokenAtStart) clearSession();
      return false;
    }
    // A logout or login during the request wins over this answer.
    if (accessToken() !== tokenAtStart) return accessToken() !== null;
    saveSession(sessionFromPayload(payload, loadSession()!.sessionId));
    return true;
  });
}

const wsClients = new Map<Service, Client>();

function wsClient(service: Service): Client {
  let client = wsClients.get(service);
  if (!client) {
    const url = wsUrls[service];
    if (!url) throw new Error(`No websocket URL configured for ${service}`);
    client = createClient({ url, lazy: true, connectionParams: headers, retryAttempts: 5 });
    wsClients.set(service, client);
  }
  return client;
}

export interface SubscriptionHandlers<TResult> {
  next: (data: TResult) => void;
  error?: (error: GraphQLRequestError) => void;
}

/** Subscriptions over websocket (graphql-ws). Returns an unsubscribe function. */
export function subscribe<TResult, TVariables extends Record<string, unknown>>(
  service: Service,
  document: TypedDocumentNode<TResult, TVariables>,
  handlers: SubscriptionHandlers<TResult>,
  variables?: TVariables,
): () => void {
  return wsClient(service).subscribe<TResult>(
    { query: print(document), variables },
    {
      next: (result) => {
        if (result.errors?.length) {
          handlers.error?.({
            message: result.errors[0].message,
            code: result.errors[0].extensions?.code as string | undefined,
          });
        } else if (result.data) {
          handlers.next(result.data);
        }
      },
      error: (error) => handlers.error?.(toRequestError(error)),
      complete: () => undefined,
    },
  );
}
