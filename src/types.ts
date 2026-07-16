export type Assignment = {
  id: string
  title: string
  description: string
  className: string
  dueDate: string
  active: boolean
  createdAt?: unknown
}

export type Student = {
  id: string
  name: string
  className: string
  studentNumber: string
  identityKey: string
  active: boolean
  createdAt?: unknown
}

export type SubmissionStatus = 'submitted' | 'confirmed'

export type Submission = {
  id: string
  assignmentId: string
  assignmentTitle: string
  className: string
  studentName: string
  studentNumber: string
  identityKey: string
  submitterUid: string
  fileName: string
  fileType: string
  storagePath: string
  status: SubmissionStatus
  submittedAt?: unknown
  confirmedAt?: unknown
  confirmedBy?: string
}

export const makeIdentityKey = (
  className: string,
  studentNumber: string,
) => `${className.trim().toLowerCase()}::${studentNumber.trim().toLowerCase()}`

export const formatDateTime = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('toDate' in value)) return 'たった今'
  const toDate = (value as { toDate: () => Date }).toDate
  return toDate().toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
