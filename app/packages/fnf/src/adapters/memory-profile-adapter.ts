import type { ProfileBackend, SwitchWorkspaceRequest } from '../backend'

export interface MemoryProfileAdapterOptions {
  user?: Record<string, unknown>
  workspaces?: Record<string, unknown>[]
  wallet?: Record<string, unknown>
  currentWorkspaceId?: string
}

const DEFAULT_USER = {
  id: 'mem_user',
  email: 'memory@example.com',
  workspace_id: 'mem_private',
  workspace_type: 'private',
  workspace_role: 'owner',
  workspace_membership_exists: true,
  plan_type: 'free',
  credits: 0,
  billing_period: 'monthly',
  total_plan_credits: 0,
  package_credits: 0,
  subscription_credits: 0,
}

const DEFAULT_WORKSPACES = [
  {
    id: 'mem_private',
    clerk_organization_id: '',
    name: 'Personal',
    type: 'private',
    user_role: 'owner',
  },
]

const DEFAULT_WALLET = {
  workspace_id: 'mem_private',
  subscription_balance: 0,
  total_credits: 0,
  credits_balance: 0,
  on_demand_credits: 0,
  wallet_created_at: null,
  next_credit_allocation_date: null,
}

export function createMemoryProfileAdapter(options: MemoryProfileAdapterOptions = {}): ProfileBackend {
  const user = { ...DEFAULT_USER, ...options.user }
  const workspaces = options.workspaces?.map(item => ({ ...item })) ?? DEFAULT_WORKSPACES.map(item => ({ ...item }))
  const wallet = { ...DEFAULT_WALLET, ...options.wallet }
  let currentWorkspaceId = options.currentWorkspaceId
    ?? (typeof user.workspace_id === 'string' ? user.workspace_id : undefined)
    ?? (typeof workspaces[0]?.id === 'string' ? workspaces[0].id : 'mem_private')

  const currentWorkspace = () => workspaces.find(workspace => workspace.id === currentWorkspaceId) ?? workspaces[0] ?? null

  return {
    async getUser() {
      const workspace = currentWorkspace()
      return {
        ...user,
        ...(workspace
          ? {
              workspace_id: workspace.id,
              workspace_type: workspace.type,
              workspace_role: workspace.user_role,
            }
          : {}),
      }
    },
    async listWorkspaces() {
      return workspaces
    },
    async getCurrentWorkspace() {
      return currentWorkspace()
    },
    async getWorkspaceWallet() {
      return {
        ...wallet,
        workspace_id: currentWorkspaceId,
      }
    },
    async switchWorkspace({ workspaceId }: SwitchWorkspaceRequest) {
      currentWorkspaceId = workspaceId
      return {}
    },
  }
}
