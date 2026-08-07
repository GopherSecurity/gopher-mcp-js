import {
  GopherAgentOAuthOptions,
  GopherAgentRuntimeOptions,
  normalizeRuntimeOptions,
} from './config';

export interface OAuthUrlResolutionInput {
  url: string;
  runtimeOptions?: GopherAgentRuntimeOptions;
  oauth?: GopherAgentOAuthOptions;
}

export type OAuthUrlRuntimeOptionsResolver = (
  input: OAuthUrlResolutionInput
) => Promise<GopherAgentRuntimeOptions | undefined>;

async function defaultOAuthUrlRuntimeOptionsResolver(
  input: OAuthUrlResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  return normalizeRuntimeOptions(input.runtimeOptions);
}

let activeOAuthUrlRuntimeOptionsResolver: OAuthUrlRuntimeOptionsResolver =
  defaultOAuthUrlRuntimeOptionsResolver;

export async function resolveUrlRuntimeOptionsWithOAuth(
  input: OAuthUrlResolutionInput
): Promise<GopherAgentRuntimeOptions | undefined> {
  return activeOAuthUrlRuntimeOptionsResolver(input);
}

export function setOAuthUrlRuntimeOptionsResolverForTest(
  resolver?: OAuthUrlRuntimeOptionsResolver
): void {
  activeOAuthUrlRuntimeOptionsResolver =
    resolver ?? defaultOAuthUrlRuntimeOptionsResolver;
}
