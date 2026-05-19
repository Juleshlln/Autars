import { useState } from 'react'

type ToastTone = 'success' | 'info' | 'warning' | 'danger'

export function useToast() {
  const [state, setState] = useState<{ open: boolean; message: string; tone: ToastTone }>({
    open: false,
    message: '',
    tone: 'success',
  })
  return {
    state,
    show: (message: string, tone: ToastTone = 'success') => setState({ open: true, message, tone }),
    hide: () => setState((s) => ({ ...s, open: false })),
  }
}
