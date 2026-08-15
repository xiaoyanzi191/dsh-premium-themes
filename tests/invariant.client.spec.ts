/** Invariant companion registers a no-op installer under its package name. */
import { Context } from '@deepseek-ai/cordis'
import { describe, expect, it } from 'vitest'
import { apply, inject, name } from '../src/invariant.ts'

describe('premium-themes invariant', () => {
  it('declares its cordis companion shape', () => {
    expect(name).toBe('client-ui-premium-themes-invariant')
    expect(inject).toEqual(['invariants'])
  })

  it('registers the package ownership with the invariants service', async () => {
    const registered: string[] = []
    const ctx = new Context()
    ctx.provide('invariants', { register: (pkg: string) => { registered.push(pkg) } } as never)
    await ctx.plugin({ inject: ['invariants'], apply }).await()
    expect(registered).toEqual(['@deepseek-ai/dsh-client-ui-premium-themes'])
  })
})
