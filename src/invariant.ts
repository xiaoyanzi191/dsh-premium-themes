/**
 * Package-owned invariant companion for
 * `@deepseek-ai/dsh-client-ui-premium-themes`.
 * @module @deepseek-ai/dsh-client-ui-premium-themes/invariant
 */

/* jscpd:ignore-start */
import type { Context } from '@deepseek-ai/cordis'
import type { InvariantInstaller } from '@deepseek-ai/dsh-invariants'

const PACKAGE_NAME = '@deepseek-ai/dsh-client-ui-premium-themes'

/** Cordis companion plugin name. */
export const name = 'client-ui-premium-themes-invariant'
/** Service required before the companion can reserve package ownership. */
export const inject = ['invariants']

/**
 * No runtime invariant: the plugin's settings namespace validates and
 * publishes the durable palette selection, while palette definitions are
 * static data covered directly by this package's specs.
 */
const install: InvariantInstaller = () => {}

/**
 * Register this package's invariant companion.
 * @param ctx - Cordis context carrying the invariant service.
 * @returns the installed registration's disposer after setup succeeds.
 */
export const apply = (ctx: Context): Promise<() => void> =>
  Promise.resolve(ctx.invariants.register(PACKAGE_NAME, install))
/* jscpd:ignore-end */
