/**
 * Scope validation helpers
 *
 * Standalone functions that accept GopherAuthContext directly,
 * designed for per-request usage (not shared class state).
 */

import { GopherAuthContext } from '../ffi/auth/types';
import {
  gopherAuthValidateAllScopes,
  gopherAuthValidateAnyScopes,
} from '../ffi/auth/loader';

/**
 * Check if context has a specific scope
 */
export function hasScope(
  context: GopherAuthContext | undefined,
  scope: string
): boolean {
  if (!context?.scopes) return false;
  return gopherAuthValidateAllScopes(context.scopes, scope);
}

/**
 * Check if context has ALL required scopes (AND logic)
 */
export function hasAllScopes(
  context: GopherAuthContext | undefined,
  scopes: string[]
): boolean {
  if (!context?.scopes || scopes.length === 0) return scopes.length === 0;
  return gopherAuthValidateAllScopes(context.scopes, scopes.join(' '));
}

/**
 * Check if context has ANY of the required scopes (OR logic)
 */
export function hasAnyScope(
  context: GopherAuthContext | undefined,
  scopes: string[]
): boolean {
  if (!context?.scopes || scopes.length === 0) return scopes.length === 0;
  return gopherAuthValidateAnyScopes(context.scopes, scopes.join(' '));
}
