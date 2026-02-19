import { describe, it, expect, beforeEach } from 'vitest'
import { useAuthStore } from '../../app/state/useAuthStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.getState().clear()
  })

  it('starts with null authMethod and email', () => {
    const state = useAuthStore.getState()
    expect(state.authMethod).toBeNull()
    expect(state.email).toBeNull()
  })

  it('setAuth sets wallet method', () => {
    useAuthStore.getState().setAuth('wallet')
    const state = useAuthStore.getState()
    expect(state.authMethod).toBe('wallet')
    expect(state.email).toBeNull()
  })

  it('setAuth sets crossmint method with email', () => {
    useAuthStore.getState().setAuth('crossmint', 'user@example.com')
    const state = useAuthStore.getState()
    expect(state.authMethod).toBe('crossmint')
    expect(state.email).toBe('user@example.com')
  })

  it('clear resets state', () => {
    useAuthStore.getState().setAuth('crossmint', 'user@example.com')
    useAuthStore.getState().clear()
    const state = useAuthStore.getState()
    expect(state.authMethod).toBeNull()
    expect(state.email).toBeNull()
  })

  it('setAuth can switch between methods', () => {
    useAuthStore.getState().setAuth('wallet')
    expect(useAuthStore.getState().authMethod).toBe('wallet')

    useAuthStore.getState().setAuth('crossmint', 'a@b.com')
    expect(useAuthStore.getState().authMethod).toBe('crossmint')
    expect(useAuthStore.getState().email).toBe('a@b.com')
  })
})
