export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  isStreaming: boolean
  isAvailable: boolean | null  // null = pas encore vérifié
  error: string | null
}
