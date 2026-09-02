/**
 * Simple Toast Alternative
 * 
 * Basic toast implementation for now until sonner is installed
 */

// Simple toast interface
interface ToastOptions {
  duration?: number
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'
}

// Create a simple toast element
function createToastElement(message: string, type: 'success' | 'error' | 'warning' | 'info'): HTMLElement {
  const toast = document.createElement('div')
  
  const baseClasses = [
    'fixed', 'top-4', 'right-4', 'z-50', 'p-4', 'rounded-surface', 'shadow-lg',
    'max-w-sm', 'text-sm', 'font-medium', 'animate-in', 'slide-in-from-right',
    'transition-all', 'duration-300'
  ]
  
  const typeClasses = {
    success: ['bg-green-600', 'text-white'],
    error: ['bg-red-600', 'text-white'],
    warning: ['bg-amber-600', 'text-white'],
    info: ['bg-blue-600', 'text-white']
  }
  
  toast.className = [...baseClasses, ...typeClasses[type]].join(' ')
  toast.textContent = message
  
  return toast
}

// Show toast function
function showToast(message: string, type: 'success' | 'error' | 'warning' | 'info', options: ToastOptions = {}) {
  const { duration = 3000 } = options
  
  const toast = createToastElement(message, type)
  document.body.appendChild(toast)
  
  // Remove after duration
  setTimeout(() => {
    toast.style.opacity = '0'
    toast.style.transform = 'translateX(100%)'
    
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    }, 300)
  }, duration)
}

// Export simple toast API
export const toast = {
  success: (message: string, options?: ToastOptions) => showToast(message, 'success', options),
  error: (message: string, options?: ToastOptions) => showToast(message, 'error', options),
  warning: (message: string, options?: ToastOptions) => showToast(message, 'warning', options),
  info: (message: string, options?: ToastOptions) => showToast(message, 'info', options),
  loading: (message: string, options?: ToastOptions) => showToast(message, 'info', { ...options, duration: 0 }),
  dismiss: () => {
    // Remove all toasts
    const toasts = document.querySelectorAll('[class*="fixed"][class*="top-4"][class*="right-4"]')
    toasts.forEach(toast => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast)
      }
    })
  }
}