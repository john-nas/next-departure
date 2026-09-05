export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function apiRequest<T>(path: string, signal?: AbortSignal): Promise<T> {
  const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')
  const response = await fetch(`${baseUrl}${path}`, {
    cache: 'no-store',
    signal,
    headers: { Accept: 'application/json' },
  })
  if (!response.ok) {
    throw new ApiError(`The local transport API returned ${response.status}.`, response.status)
  }
  return (await response.json()) as T
}
