import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { request } from '@/shared/api/client'

export const REFRESH_MS = 15_000
export const AUDIT_LIMIT = 100

export type TenantStatus = 'ACTIVE' | 'BLOCKED'

export type TenantOverview = {
  id: number
  name: string
  status: TenantStatus
  legacy: boolean
  createdAt: string
  users: number
  session: string
  account: string | null
  dispatcher: string
  activeGroups: number
  sentToday: number
  sentLastHour: number
  queueLength: number
  stoppedByRisk: boolean
  proxy: string | null
  proxyRequired: boolean
}

export type PlatformUser = { id: number; login: string; enabled: boolean; createdAt: string; lastLoginAt: string | null }

export type AuditAction =
  | 'LOGIN'
  | 'LOGIN_FAILED'
  | 'ENTER'
  | 'TENANT_CREATED'
  | 'TENANT_RENAMED'
  | 'TENANT_BLOCKED'
  | 'TENANT_UNBLOCKED'
  | 'TENANT_DELETED'
  | 'USER_CREATED'
  | 'USER_UPDATED'
  | 'USER_DELETED'
  | 'PASSWORD_CHANGED'
  | 'PROXY_CHANGED'

export type AuditEntry = { at: string; actor: string | null; tenantId: number | null; tenantName: string | null; action: AuditAction; detail: string | null; ip: string | null }

export type NewTenant = { name: string; login: string; password: string; proxy?: string }
export type TenantPatch = { name?: string; status?: TenantStatus; proxy?: string | null }
export type ProxyCheck = { ok: boolean; ip?: string; error?: string }
export type UserPatch = { enabled?: boolean; password?: string }

const TENANTS = '/api/platform/tenants'

const platformKeys = {
  all: ['platform'] as const,
  tenants: () => [...platformKeys.all, 'tenants'] as const,
  users: (tenantId: number) => [...platformKeys.all, 'users', tenantId] as const,
  audit: (tenantId: number | null) => [...platformKeys.all, 'audit', tenantId] as const,
}

export function useTenants(enabled = true) {
  return useQuery({ queryKey: platformKeys.tenants(), queryFn: () => request<TenantOverview[]>('GET', TENANTS), refetchInterval: REFRESH_MS, enabled })
}

export function useTenantUsers(tenantId: number) {
  return useQuery({ queryKey: platformKeys.users(tenantId), queryFn: () => request<PlatformUser[]>('GET', `${TENANTS}/${tenantId}/users`), refetchInterval: REFRESH_MS })
}

export function useAudit(tenantId: number | null) {
  const params = new URLSearchParams({ limit: String(AUDIT_LIMIT) })
  if (tenantId !== null) params.set('tenantId', String(tenantId))
  return useQuery({ queryKey: platformKeys.audit(tenantId), queryFn: () => request<AuditEntry[]>('GET', `/api/platform/audit?${params}`), refetchInterval: REFRESH_MS })
}

function useInvalidatePlatform() {
  const client = useQueryClient()
  return () => client.invalidateQueries({ queryKey: platformKeys.all })
}

export function useCreateTenant() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (body: NewTenant) => request<TenantOverview>('POST', TENANTS, body), onSuccess: invalidate })
}

export function useUpdateTenant() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: ({ id, ...body }: TenantPatch & { id: number }) => request<TenantOverview>('PATCH', `${TENANTS}/${id}`, body), onSuccess: invalidate })
}

export function useDeleteTenant() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: ({ id, confirmName }: { id: number; confirmName: string }) => request<void>('POST', `${TENANTS}/${id}/delete`, { confirmName }), onSuccess: invalidate })
}

export function useEnterTenant() {
  return useMutation({
    mutationFn: (id: number) => request<{ url: string }>('POST', `${TENANTS}/${id}/enter`),
    onSuccess: ({ url }) => window.location.assign(url),
  })
}

export function useCreateUser(tenantId: number) {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (body: { login: string; password: string }) => request<PlatformUser>('POST', `${TENANTS}/${tenantId}/users`, body), onSuccess: invalidate })
}

export function useUpdateUser() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: ({ id, ...body }: UserPatch & { id: number }) => request<PlatformUser>('PATCH', `/api/platform/users/${id}`, body), onSuccess: invalidate })
}

export function useDeleteUser() {
  const invalidate = useInvalidatePlatform()
  return useMutation({ mutationFn: (id: number) => request<void>('DELETE', `/api/platform/users/${id}`), onSuccess: invalidate })
}

export function useProxyCheck() {
  return useMutation({ mutationFn: (id: number) => request<ProxyCheck>('POST', `${TENANTS}/${id}/proxy-check`) })
}
