const USER_MESSAGES: Record<string, string> = {
  'new row violates row-level security': 'You do not have permission to perform this action.',
  'violates foreign key constraint': 'This record is linked to other data and cannot be modified.',
  'duplicate key value': 'A record with this value already exists.',
  'insufficient_stock': 'Insufficient stock available for this order.',
  'credit_limit_exceeded': 'This order exceeds the shop\'s credit limit.',
  'invalid_pin': 'Incorrect PIN. Please try again.',
  'session_expired': 'Your session has expired. Please log in again.',
  'JWT expired': 'Your session has expired. Please log in again.',
  'Failed to fetch': 'Network error. Please check your connection.',
  'Invalid login credentials': 'Invalid email or password.',
}

export function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  for (const [key, friendly] of Object.entries(USER_MESSAGES)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return friendly
  }
  return 'Something went wrong. Please try again.'
}
