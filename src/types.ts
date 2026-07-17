export type MaterialStatus = 'sent' | 'confirmed'

export type MaterialSubmission = {
  id: string
  submitterUid: string
  fileName: string
  fileType: 'image/jpeg'
  storagePath: string
  status: MaterialStatus
  submittedAt?: unknown
  confirmedAt?: unknown
}

export const formatDateTime = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return 'たった今'
  const date = (value as { toDate: () => Date }).toDate()
  return date.toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
