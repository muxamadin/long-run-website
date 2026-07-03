import type { ProfileBackend } from '../../backend'
import { describe, expect, it } from 'vitest'
import { createMemoryProfileAdapter } from '../../adapters/memory-profile-adapter'
import { ValidationError } from '../../errors'
import { calculateProfileCredits, createProfileClient, mapProfileUser, mapProfileWallet, mapProfileWorkspace } from '../index'

describe('profile mappers', () => {
  it('maps /user snake_case fields to SDK camelCase fields', () => {
    const user = mapProfileUser({
      id: 'u1',
      email: 'u@example.com',
      business_email: 'biz@example.com',
      verified_business_email: 'verified@example.com',
      workspace_id: 'w1',
      workspace_type: 'shared',
      workspace_role: 'owner',
      workspace_membership_exists: true,
      plan_type: 'pro',
      billing_period: 'monthly',
      credits: 123,
      total_plan_credits: 1000,
      package_credits: 200,
      subscription_credits: 800,
      face_swap_credits: 2,
      character_swap_credits: 3,
      soul_credits: 4,
      is_gift_subscription: true,
      is_test_user: true,
    })

    expect(user).toMatchObject({
      id: 'u1',
      email: 'u@example.com',
      businessEmail: 'biz@example.com',
      verifiedBusinessEmail: 'verified@example.com',
      workspaceId: 'w1',
      workspaceType: 'shared',
      workspaceRole: 'owner',
      workspaceMembershipExists: true,
      planType: 'pro',
      billingPeriod: 'monthly',
      totalPlanCredits: 1000,
      packageCredits: 200,
      subscriptionCredits: 800,
      isGiftSubscription: true,
      isTestUser: true,
    })
  })

  it('maps workspace and wallet models from product responses', () => {
    expect(mapProfileWorkspace({
      id: 'w1',
      name: 'Studio',
      clerk_organization_id: 'org1',
      type: 'shared',
      user_role: 'admin',
      avatar_url: 'https://cdn/avatar.png',
      bio: 'workspace bio',
      grace_period_type: 'soft',
      sso_status: 'enabled',
      is_enterprise_sub_workspace: true,
      sub_workspace_block: { reason: 'out_of_credits', owner_email: 'owner@example.com' },
    })).toMatchObject({
      id: 'w1',
      name: 'Studio',
      clerkOrganizationId: 'org1',
      type: 'shared',
      role: 'admin',
      isOwner: false,
      isAdmin: true,
      isTeamWorkspace: true,
      avatarUrl: 'https://cdn/avatar.png',
      description: 'workspace bio',
      gracePeriodType: 'soft',
      ssoStatus: 'enabled',
      isEnterpriseSubWorkspace: true,
      subWorkspaceBlock: { reason: 'out_of_credits', ownerEmail: 'owner@example.com' },
    })

    expect(mapProfileWallet({
      workspace_id: 'w1',
      subscription_balance: 900,
      total_credits: 1200,
      credits_balance: 300,
      on_demand_credits: -100,
      wallet_created_at: '2026-01-01',
      next_credit_allocation_date: '2026-02-01',
    })).toEqual({
      id: 'w1',
      subscriptionBalance: 900,
      subscriptionTotal: 1200,
      creditsBalance: 300,
      onDemandCredits: 0,
      walletCreatedAt: '2026-01-01',
      nextPaymentDate: '2026-02-01',
    })
  })
})

describe('profile credits', () => {
  it('normalizes wallet credit-cents and clamps negative values', () => {
    const credits = calculateProfileCredits({
      id: 'w1',
      subscriptionBalance: 900,
      subscriptionTotal: 1200,
      creditsBalance: 300,
      onDemandCredits: 600,
      walletCreatedAt: null,
      nextPaymentDate: null,
    })

    expect(credits).toMatchObject({
      monthlyRemaining: 9,
      purchasedCredits: 3,
      onDemandCredits: 6,
      availableCredits: 12,
      totalAvailableCredits: 18,
      totalProgressCapacity: 18,
      planCapacity: 12,
      usedCredits: 3,
      availablePercent: 100,
      usagePercent: 0,
      raw: {
        availableCredits: 1200,
        totalAvailableCredits: 1800,
        totalProgressCapacity: 1800,
      },
    })

    expect(calculateProfileCredits({
      id: 'w1',
      subscriptionBalance: -1,
      subscriptionTotal: 100,
      creditsBalance: -1,
      onDemandCredits: -1,
      walletCreatedAt: null,
      nextPaymentDate: null,
    })).toMatchObject({ availableCredits: 0, totalAvailableCredits: 0, availablePercent: 0 })
  })

  it('can exclude on-demand credits from totals when a host wants to show them separately', () => {
    const credits = calculateProfileCredits({
      id: 'w1',
      subscriptionBalance: 50,
      subscriptionTotal: 100,
      creditsBalance: 0,
      onDemandCredits: 100,
      walletCreatedAt: null,
      nextPaymentDate: null,
    }, { includeOnDemand: false })

    expect(credits.totalAvailableCredits).toBe(0.5)
    expect(credits.onDemandCredits).toBe(0)
    expect(credits.availablePercent).toBe(50)
  })
})

describe('profile client', () => {
  it('binds each method to the profile backend port and composes snapshots', async () => {
    const calls: string[] = []
    const adapter: ProfileBackend = {
      async getUser() {
        calls.push('getUser')
        return { id: 'u1', workspace_id: 'w1', workspace_type: 'private', workspace_role: 'owner' }
      },
      async listWorkspaces() {
        calls.push('listWorkspaces')
        return [{ id: 'w1', name: 'Personal', type: 'private', user_role: 'owner' }]
      },
      async getCurrentWorkspace() {
        calls.push('getCurrentWorkspace')
        return { id: 'w1', name: 'Personal', type: 'private', user_role: 'owner' }
      },
      async getWorkspaceWallet() {
        calls.push('getWorkspaceWallet')
        return { workspace_id: 'w1', subscription_balance: 100, total_credits: 100, credits_balance: 25 }
      },
      async switchWorkspace() {
        calls.push('switchWorkspace')
        return {}
      },
    }
    const client = createProfileClient({ profileAdapter: adapter })

    await expect(client.getUser()).resolves.toMatchObject({ workspaceId: 'w1' })
    await expect(client.listWorkspaces()).resolves.toHaveLength(1)
    await expect(client.getCurrentWorkspace()).resolves.toMatchObject({ id: 'w1' })
    await expect(client.getWallet()).resolves.toMatchObject({ creditsBalance: 25 })
    await expect(client.getCredits()).resolves.toMatchObject({ totalAvailableCredits: 1.25 })
    await expect(client.getSnapshot()).resolves.toMatchObject({
      user: { id: 'u1' },
      currentWorkspace: { id: 'w1' },
      wallet: { id: 'w1' },
      credits: { totalAvailableCredits: 1.25 },
    })

    expect(calls).toEqual([
      'getUser',
      'listWorkspaces',
      'getCurrentWorkspace',
      'getWorkspaceWallet',
      'getWorkspaceWallet',
      'getUser',
      'listWorkspaces',
      'getCurrentWorkspace',
      'getWorkspaceWallet',
    ])
  })

  it('switches backend context and returns a refreshed snapshot', async () => {
    const client = createProfileClient({
      profileAdapter: createMemoryProfileAdapter({
        user: { id: 'u1', workspace_id: 'personal' },
        workspaces: [
          { id: 'personal', name: 'Personal', type: 'private', user_role: 'owner' },
          { id: 'team', name: 'Team', type: 'shared', user_role: 'member' },
        ],
        wallet: { subscription_balance: 200, total_credits: 400, credits_balance: 0 },
      }),
    })

    const snapshot = await client.switchWorkspace({ workspaceId: 'team' })
    expect(snapshot.user).toMatchObject({ workspaceId: 'team', workspaceType: 'shared', workspaceRole: 'member' })
    expect(snapshot.currentWorkspace).toMatchObject({ id: 'team', isTeamWorkspace: true })
    expect(snapshot.credits).toMatchObject({ totalAvailableCredits: 2 })
  })

  it('rejects empty workspace ids before hitting the adapter', async () => {
    const client = createProfileClient({ profileAdapter: createMemoryProfileAdapter() })
    await expect(client.switchWorkspace({ workspaceId: '   ' })).rejects.toBeInstanceOf(ValidationError)
  })
})
