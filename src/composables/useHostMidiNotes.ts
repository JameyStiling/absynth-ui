import { onMounted, onUnmounted, ref } from 'vue'
import * as Juce from 'juce-framework-frontend'

function parseMidiNotes(result: unknown): number[] {
  if (result == null) return []

  if (Array.isArray(result)) {
    return result
      .map((entry) => Number(entry))
      .filter((note) => Number.isFinite(note) && note >= 0 && note < 128)
  }

  return []
}

export function useHostMidiNotes(pollIntervalMs = 33) {
  const hostNotes = ref<number[]>([])
  let timerId: ReturnType<typeof setInterval> | undefined

  onMounted(() => {
    if (!(window as Window & { __JUCE__?: unknown }).__JUCE__) return

    const getActiveMidiNotes = Juce.getNativeFunction('getActiveMidiNotes')

    const poll = async () => {
      try {
        const result = await getActiveMidiNotes()
        hostNotes.value = parseMidiNotes(result)
      } catch {
        // Bridge unavailable outside plugin host
      }
    }

    void poll()
    timerId = setInterval(() => {
      void poll()
    }, pollIntervalMs)
  })

  onUnmounted(() => {
    if (timerId !== undefined) clearInterval(timerId)
  })

  return hostNotes
}
