import { GoogleGenerativeAI } from '@fuyun/generative-ai'

const apiKey = process.env.GEMINI_API_KEY
const apiBaseUrl = process.env.API_BASE_URL

const genAI = apiBaseUrl
  ? new GoogleGenerativeAI(apiKey, apiBaseUrl)
  : new GoogleGenerativeAI(apiKey)

export const startChatAndSendMessageStream = async(history: ChatMessage[], newMessage: string) => {
  const model = genAI.getGenerativeModel({ model: 'gemini-pro' })

  const chat = model.startChat({
    history: history.map(msg => ({
      role: msg.role,
      parts: msg.parts.map(part => part.text).join(''), // Join parts into a single string
    })),
    generationConfig: {
      maxOutputTokens: 8000,
    },
  })

  // Use sendMessageStream for streaming responses
  const result = await chat.sendMessageStream(newMessage)

  const bufferedStream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder('utf-8', { stream: true })
      let buffer = ''

      for await (const chunk of result.stream) {
        // Ensure the chunk is a Uint8Array
        const uint8Chunk = new Uint8Array(await chunk.arrayBuffer())

        // Combine the buffer with the new chunk
        const combinedChunk = buffer + decoder.decode(uint8Chunk, { stream: true })

        // Find the last complete character
        const lastCompleteCharIndex = findLastCompleteCharIndex(combinedChunk)

        // The complete text is everything up to the last complete character
        const completeText = combinedChunk.slice(0, lastCompleteCharIndex)

        // Buffer the rest (incomplete character or empty if none)
        buffer = combinedChunk.slice(lastCompleteCharIndex)

        // Enqueue the complete text to the stream
        controller.enqueue(encoder.encode(completeText))
      }

      // Decode and enqueue any remaining buffered text
      if (buffer.length > 0)
        controller.enqueue(encoder.encode(decoder.decode(buffer)))

      controller.close()
    },
  })

  return bufferedStream
}

// Helper function to find the index of the last complete UTF-8 character
function findLastCompleteCharIndex(text) {
  const encoder = new TextEncoder()
  for (let i = text.length; i >= 0; i--) {
    // Try to encode the text up to the current index
    try {
      // If this does not throw, it means we have a valid UTF-8 string
      encoder.encode(text.slice(0, i))
      return i // Return the index of the last valid character
    } catch (e) {
      // If an error is thrown, it means the character at the current index is not complete
      // We continue the loop to try with one less character
    }
  }
  return 0 // If no valid character was found, return 0
}
