import { FirebaseError } from 'firebase/app'

export const firebaseErrorMessage = (error: unknown, fallback: string) => {
  if (!(error instanceof FirebaseError)) return fallback

  if (error.code.startsWith('auth/')) {
    return 'FirebaseのAuthenticationで「匿名」ログインを有効にしてください。'
  }
  if (
    error.code === 'permission-denied' ||
    error.code === 'firestore/permission-denied' ||
    error.code === 'storage/unauthorized'
  ) {
    return 'Firebaseのセキュリティルールがまだ反映されていません。'
  }
  if (
    error.code === 'storage/retry-limit-exceeded' ||
    error.code === 'unavailable' ||
    error.code === 'firestore/unavailable'
  ) {
    return '通信が安定してから、もう一度お試しください。'
  }
  return fallback
}
