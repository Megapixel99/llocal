import {
  activeTabAtom,
  agentApprovalAtom,
  agentModeAtom,
  chatAtom,
  type Message,
  contextUsageAtom,
  effortAtom,
  experimentalSearchAtom,
  selectedChatIndexAtom,
  fileContextAtom,
  generatingAtom,
  imageAttatchmentAtom,
  mascotPhaseAtom,
  notificationPrefsAtom,
  prefModelAtom,
  customInstructionsAtom,
  responseStyleAtom,
  attachedDocAtom,
  memoriesAtom,
  sessionMetricsAtom,
  stopGeneratingAtom,
  streamingAtom,
  suggestionsAtom,
  workingFolderAtom,
} from '@renderer/store/mocks'
import { streamPhase } from '../../../shared/mascot'
import { buildSystemInstructions } from '../../../shared/styles'
import { parseRememberCommand, buildMemoryBlock } from '../../../shared/memory'
import { getOllama } from '@renderer/utils/ollama'
// import axios from 'axios'
import { useAtom, useAtomValue, useSetAtom } from 'jotai'
import { useEffect, useRef, useState } from 'react'
import { useDb } from './useDb'
import { toast } from 'sonner'
import { composeAssistantMessage, findUrls, parseHarmony, t } from '@renderer/utils/utils'
import { makeApprovalRequester, runAgentLoop } from '@renderer/utils/agent'
import { routeIntent, runDeepResearch, runReasoning } from '@renderer/utils/agents'
import { getMcpServers } from '@renderer/platform/config'

// interface experimentalSearchType {
//   output: string,
//   sources: string[]
// }

interface userContentType {
  role: string
  content: string
  images?: string[]
}

// Ollama's /api/show exposes the model's context length under an architecture-prefixed key,
// e.g. "llama.context_length" or "gemma3.context_length". model_info is a Map (older builds used a
// plain object), so we handle both and look up whichever key ends in ".context_length".
function extractContextLength(info: { model_info?: Map<string, unknown> | Record<string, unknown> }): number {
  const modelInfo = info?.model_info
  if (!modelInfo) return 0
  const entries = modelInfo instanceof Map ? modelInfo : new Map(Object.entries(modelInfo))
  for (const [key, value] of entries) {
    if (key.endsWith('.context_length')) return Number(value) || 0
  }
  return 0
}



export function usePrompt(): [boolean, (prompt: string, baseChat?: Message[]) => Promise<void>] {
  // Defining states
  const [isLoading, setLoading] = useState(false)
  const [chat, setChat] = useAtom(chatAtom)
  const [modelName] = useAtom(prefModelAtom)
  const setStream = useSetAtom(streamingAtom) // to handle streaming
  const [stopGenerating, setStopGenerating] = useAtom(stopGeneratingAtom) // to manage the stop generating button
  const { addChat } = useDb() // this is to add to the db
  const stopGeneratingRef = useRef(stopGenerating) // ref to handle the states correctly here, make sure the stop generating works
  const [imageAttatchment, setImageAttachment] = useAtom(imageAttatchmentAtom) // for images
  const [experimentalSearch, setExperimentalSearch] = useAtom(experimentalSearchAtom)
  const [file, setFile] = useAtom(fileContextAtom)
  const [suggestions, setSuggestions] = useAtom(suggestionsAtom)
  const setGenerating = useSetAtom(generatingAtom) // drives the thinking animation while a response is in-flight
  const setMascotPhase = useSetAtom(mascotPhaseAtom) // mascot: reading (thinking/researching) vs responding (writing)
  const setContextUsage = useSetAtom(contextUsageAtom) // tokens used vs the model's context window
  const setSessionMetrics = useSetAtom(sessionMetricsAtom) // per-message analytics (tokens, tokens/sec, tools)
  const activeTab = useAtomValue(activeTabAtom) // chat | agent
  const agentMode = useAtomValue(agentModeAtom) // manual | acceptEdits | plan | auto
  const workingFolder = useAtomValue(workingFolderAtom)
  const setApproval = useSetAtom(agentApprovalAtom)
  const effort = useAtomValue(effortAtom) // DeepResearch breadth: low | medium | high
  const notificationPrefs = useAtomValue(notificationPrefsAtom) // native OS notification settings
  const selectedChatIndex = useAtomValue(selectedChatIndexAtom)
  const customInstructions = useAtomValue(customInstructionsAtom) // user persona/preferences
  const responseStyle = useAtomValue(responseStyleAtom) // response-style preset
  const [attachedDoc, setAttachedDoc] = useAtom(attachedDocAtom) // in-chat document attachment
  const [memories, setMemories] = useAtom(memoriesAtom) // cross-conversation memory
  const firstChatRender = useRef(true)
  // The chat the in-flight request belongs to. Persisting a brand-new chat on send flips
  // selectedChatIndex, which would otherwise trip the abort-on-switch effect below and cancel the
  // very request that created it — so that effect skips this date.
  const activeRequestChatDateRef = useRef('')
  // To Debug
  // useEffect(()=>{console.log(stream);
  // },[stream])

  // To ensure, the state update works just right
  useEffect(() => {
    stopGeneratingRef.current = stopGenerating
  }, [stopGenerating])

  // Switching to (or creating) a different chat cancels any in-flight generation for the previous
  // chat. Without this a request started before the first token arrives keeps running and its
  // response lands in whichever chat is now active — and a hung request leaves the UI stuck
  // "generating" forever. Aborting throws inside the run loop, which routes to its catch/cleanup.
  useEffect(() => {
    if (firstChatRender.current) {
      firstChatRender.current = false
      return
    }
    // Don't abort the request that just created (and switched us into) this very chat.
    if (selectedChatIndex && selectedChatIndex === activeRequestChatDateRef.current) return
    getOllama().abort()
    stopGeneratingRef.current = true
    setStream('')
    setLoading(false)
    setGenerating(false)
  }, [selectedChatIndex])

  // Look up the selected model's context window size so we can show how full the context is.
  useEffect(() => {
    if (!modelName) return
    let cancelled = false
    getOllama()
      .show({ model: modelName })
      .then((info) => {
        if (cancelled) return
        setContextUsage((pre) => ({ ...pre, total: extractContextLength(info) }))
      })
      .catch(() => {
        /* older Ollama / missing model — leave total at its previous value */
      })
    return () => {
      cancelled = true
    }
  }, [modelName])

  // `baseChat` overrides the prior conversation this turn builds on. Normally undefined (continue the
  // current chat), but Edit/Retry pass a TRUNCATED history so the turn re-runs from an earlier point.
  const promptReq = async (prompt: string, baseChat?: Message[]): Promise<void> => {
    setLoading(true)
    setGenerating(true)
    setMascotPhase(null) // reset; streaming below sets reading/responding as it goes
    setStopGenerating(false) // clear any leftover stop flag so this run isn't aborted immediately
    stopGeneratingRef.current = false
    // Capture a single client for this request so chat + abort target the same instance.
    const ollama = getOllama()
    // The history this turn extends. When editing/retrying, it's the truncated chat passed in.
    const base = baseChat ?? chat
    // Custom instructions + response style → a system prompt for this turn ('' when unset). Injected
    // into the model call only; never stored in `base`/`chat`, so it isn't shown or persisted.
    // System prompt for this turn = custom instructions + style + recalled memory.
    const memoryBlock = buildMemoryBlock(memories.map((m) => m.text))
    const systemInstructions = [buildSystemInstructions(customInstructions, responseStyle), memoryBlock]
      .filter(Boolean)
      .join('\n\n')

    // Explicit "remember …" capture: store the fact (still send the message normally).
    const remembered = parseRememberCommand(prompt)
    if (remembered) {
      const id = globalThis.crypto?.randomUUID?.() ?? `m_${Date.now()}`
      setMemories((prev) =>
        prev.some((m) => m.text.toLowerCase() === remembered.toLowerCase())
          ? prev
          : [{ id, text: remembered, createdAt: Date.now() }, ...prev]
      )
      toast.success(t('Saved to memory'))
    }
    // In-chat document: fold the extracted text into the SENT message only (not the
    // displayed/stored turn, which stays the plain prompt). Consumed for this turn.
    const docPrefix = attachedDoc
      ? `The user attached a document "${attachedDoc.name}". Use its contents to answer.\n"""\n${attachedDoc.text}\n"""\n\n`
      : ''
    if (attachedDoc) setAttachedDoc(null)
    const withDoc = (text: string): string => docPrefix + text
    try {
      let user: userContentType = { role: 'user', content: prompt }
      const initialUser = user

      let sources = ''
      // this allows to have image attachments
      if (imageAttatchment) {
        user = { images: [imageAttatchment], ...user }
      }

      // Truncate to the override first (Edit/Retry), then append the user turn onto it.
      if (baseChat) setChat(baseChat)
      setChat((preValue) => [...preValue, user])

      // Persist immediately so the chat shows up in "Your chats" the moment you hit send — waiting
      // for the assistant reply meant a still-thinking (or errored) turn never appeared in the list.
      // Records the chat's date so the abort-on-switch effect doesn't cancel this run when the new
      // chat becomes selected. The reply is saved into this same doc when it lands.
      try {
        activeRequestChatDateRef.current = await addChat([...base, initialUser])
      } catch (error) {
        console.error('Failed to persist chat on send', error)
      }

      // The Agent tab needs a working folder to operate in; warn and fall back to plain chat otherwise.
      if (activeTab === 'agent' && !workingFolder) {
        toast.warning(t('Choose a working folder to use the agent'))
      }

      // Coding-agent loop: on the Agent tab with a working folder set, run the tool loop instead of a
      // plain chat (bypasses web-search / RAG rewriting).
      if (activeTab === 'agent' && workingFolder) {
        try {
          // The agent needs a tool-capable model; check up front for a clear message instead of a raw
          // "does not support tools" error mid-request.
          const info = await getOllama().show({ model: modelName })
          const capabilities = (info as { capabilities?: string[] }).capabilities ?? []
          if (!capabilities.includes('tools')) {
            toast.error(
              t(
                'This model cannot use tools, which the agent needs. Pick a tool-capable model (e.g. qwen3-coder) in Settings.'
              )
            )
            return
          }
          // Push current notification prefs so main-side triggers (sensitive-file
          // access during tool calls) respect the user's settings.
          window.api?.notifySetPrefs?.(notificationPrefs)
          const { tools, mutating } = await window.api.getAgentTools()
          // Merge in tools from enabled MCP servers. They're treated as mutating so every MCP call
          // goes through the AgentApproval gate, just like write_file / run_command.
          const mcpServers = getMcpServers()
          const mutatingSet = new Set(mutating)
          let mergedTools = tools
          if (mcpServers.some((s) => s.enabled)) {
            try {
              const mcpTools = (await window.api.mcpListTools(mcpServers)) as {
                function?: { name?: string }
              }[]
              mergedTools = [...tools, ...mcpTools]
              for (const tool of mcpTools) {
                if (tool.function?.name) mutatingSet.add(tool.function.name)
              }
            } catch (error) {
              toast.error(`${t('MCP: failed to load tools')}: ${error}`)
            }
          }
          const transcript = await runAgentLoop({
            model: modelName,
            root: workingFolder,
            mode: agentMode,
            messages: [...base, { role: 'user', content: prompt }],
            tools: mergedTools,
            mutating: mutatingSet,
            mcpServers,
            requestApproval: makeApprovalRequester(setApproval, notificationPrefs),
            onProgress: (t) => setStream(t),
            shouldStop: () => stopGeneratingRef.current,
            onToolCall: ({ tool, durationMs }) =>
              setSessionMetrics((pre) => [
                ...pre,
                {
                  role: 'tool',
                  promptTokens: 0,
                  responseTokens: 0,
                  evalDurationNs: 0,
                  timestamp: Date.now(),
                  tool,
                  durationMs
                }
              ]),
            notificationPrefs,
            effort
          })
          if (transcript.trim().length > 0) {
            const ai = { role: 'assistant', content: transcript }
            addChat([...base, initialUser, ai])
            setChat((preValue) => [...preValue, ai])
          }
        } catch (error) {
          // ignore user-initiated aborts (Stop); surface real errors
          if (!(error instanceof Error && error.name === 'AbortError')) toast.error(`${error}`)
        } finally {
          setStream('')
          setApproval(null)
          setStopGenerating(false)
          setLoading(false)
          setGenerating(false)
        }
        return
      }

      // Auto-routed agents (Chat tab only): the model decides whether a message needs plain chat,
      // careful reasoning, or web research — there is no manual mode toggle. Skipped when an image or a
      // RAG file is attached (those have their own dedicated flows below). The existing web-search toggle,
      // when on, forces research.
      if (activeTab === 'chat' && !imageAttatchment && file.length === 0) {
        const intent = experimentalSearch ? 'research' : await routeIntent(modelName, prompt)
        if (intent === 'reason') {
          try {
            const composed = await runReasoning({
              model: modelName,
              messages: [...base, docPrefix ? { ...initialUser, content: withDoc(initialUser.content) } : initialUser],
              instructions: systemInstructions,
              onProgress: (t) => setStream(t),
              shouldStop: () => stopGeneratingRef.current,
              onPhase: setMascotPhase
            })
            const ai = { role: 'assistant', content: composed }
            addChat([...base, initialUser, ai])
            setChat((preValue) => [...preValue, ai])
          } catch (error) {
            toast(`${error}`)
          } finally {
            setStream('')
            setStopGenerating(false)
            setLoading(false)
            setGenerating(false)
            setImageAttachment('')
          }
          return
        }
        if (intent === 'research') {
          try {
            const { content, sources: researchSources } = await runDeepResearch({
              model: modelName,
              prompt: withDoc(prompt),
              effort,
              instructions: systemInstructions,
              onProgress: (t) => setStream(t),
              shouldStop: () => stopGeneratingRef.current,
              onPhase: setMascotPhase
            })
            const ai = {
              role: 'assistant',
              content: researchSources ? content + '\n' + researchSources : content
            }
            addChat([...base, initialUser, ai])
            setChat((preValue) => [...preValue, ai])
          } catch (error) {
            toast(`${error}`)
          } finally {
            setStream('')
            setExperimentalSearch(false)
            setStopGenerating(false)
            setLoading(false)
            setGenerating(false)
            setImageAttachment('')
          }
          return
        }
        // intent === 'chat' → fall through to the normal streaming chat below.
      }

      // if the experimental search exists it will perform IPC invoke to the main functino and return the new prompt based on the search
      if (experimentalSearch) {
        // checking if the prompt contains urls
        const urls = findUrls(prompt);
        if (urls.length > 1) toast.warning(t('Multiple links detected, only the first one is scraped')) // edge case where in there are multiple links, we only select the first one
        try {
          const searchResponse = await window.api.experimentalSearch(prompt, urls)
          user = { ...user, content: searchResponse.prompt }
          sources = searchResponse.sources
        } catch (error) {
          toast(`${error}`)
          setExperimentalSearch(false)
          setLoading(false)
          setGenerating(false)
          return
        }
      }

      if (file.length > 0) {
        try {
          const searchResponse = await window.api.similaritySearch(file, prompt);
          user = { ...user, content: searchResponse.prompt }
          sources = searchResponse.sources
        } catch (error) {
          toast(`${error}`)
          setFile([])
          setLoading(false)
          setGenerating(false)
          return
        }
      }

      // Other way is to use axios, but could not figure out native streaming handling.
      // From what I could gather, axios does not use fetch in the background to make calls

      // const req = { model: modelName, messages: [...base, user], stream: true }
      // const response = await axios.post('http://localhost:11434/api/chat', JSON.stringify(req), {
      //   responseType: 'stream'
      // })

      // Reasoning models (gpt-oss / harmony format) can route their reasoning into Ollama's separate
      // `message.thinking` field via the `think` option, instead of leaking raw <|channel|> tokens into
      // the content. Not every model accepts the option, so we fall back to a plain request if it's rejected.
      // Prepend the custom-instructions/style system prompt for this turn (if any),
      // and fold any attached document into the (sent-only) user message.
      const sentUser = docPrefix ? { ...user, content: withDoc(user.content) } : user
      const chatMessages = systemInstructions
        ? [{ role: 'system', content: systemInstructions }, ...base, sentUser]
        : [...base, sentUser]
      let response
      try {
        response = await ollama.chat({
          model: modelName,
          messages: chatMessages,
          stream: true,
          think: true
        })
      } catch {
        response = await ollama.chat({
          model: modelName,
          messages: chatMessages,
          stream: true
        })
      }

      let chunk = ''
      let thinking = ''

      try {
        for await (const part of response) {
          chunk += part.message.content ?? ''
          // native reasoning, when the model provides it separately from the answer
          if (part.message.thinking) thinking += part.message.thinking

          // mascot: reading while only reasoning has streamed, responding once the answer starts
          setMascotPhase(streamPhase(chunk, thinking.length))

          // surface how full the context window is (prompt tokens + generated tokens)
          if (part.done == true && (part.prompt_eval_count || part.eval_count)) {
            setContextUsage((pre) => ({
              ...pre,
              used: (part.prompt_eval_count ?? 0) + (part.eval_count ?? 0)
            }))
            // record this turn's metrics for the analytics panel (tokens + throughput)
            setSessionMetrics((pre) => [
              ...pre,
              {
                role: 'assistant',
                promptTokens: part.prompt_eval_count ?? 0,
                responseTokens: part.eval_count ?? 0,
                evalDurationNs: part.eval_duration ?? 0,
                timestamp: Date.now()
              }
            ])
          }

          // stop when the model is done, or the user pressed Stop
          if (part.done == true || stopGeneratingRef.current) break

          // live preview: reasoning shows in the thinking accordion, answer text streams below it
          const parsed = parseHarmony(chunk)
          setStream(composeAssistantMessage(thinking || parsed.thinking, parsed.content))
        }
      } catch (streamError) {
        // Pressing Stop aborts the request, which throws here — swallow it and keep whatever was
        // generated so far. Genuine errors are re-thrown to the outer handler.
        const aborted =
          stopGeneratingRef.current ||
          (streamError instanceof Error && streamError.name === 'AbortError')
        if (!aborted) throw streamError
      }

      // Persist the reply only if it actually produced content (avoids empty bubbles on an early stop).
      const parsed = parseHarmony(chunk)
      const display = composeAssistantMessage(thinking || parsed.thinking, parsed.content)
      if (display.trim().length > 0) {
        const content = sources ? display + '\n' + sources : display
        addChat([...base, initialUser, { role: 'assistant', content }])
        setChat((preValue) => [...preValue, { role: 'assistant', content }])
      }
      setStream('')
      setStopGenerating(false)
      ollama.abort()
      // TODO: use Structured outputs here aswell
      // incase suggestions are toggled on
      if (suggestions.show) {
        // the JSON mode prompt
        const suggestionsPrompt = `You are a helpful AI agent, you need to output suggested follow up questions
based on the following context:\n ${chunk}
The follow up questions, must be on how you as an AI can help but from the perspective of a user asking you the question
The suggestions you generate must be prompts suitable for querying a Large Language Model (LLM).
and you **NEED** to strictly follow the following output schema:
{suggestions: string[]}`
        // making the api call
        const suggestionsResponse = await ollama.generate({ prompt: suggestionsPrompt, stream: false, model: modelName, format: "json" })
        const prompts = JSON.parse(suggestionsResponse.response).suggestions
        // this check is actually not perfect since it only checks for an array and not explicity an array of strings
        if (Array.isArray(prompts)) setSuggestions((pre) => ({ ...pre, prompts: prompts }))
        else setSuggestions((pre) => ({ ...pre, prompts: [] })) // incase it's not an array we enforce a defualt value
      }
      // clearing states as required
      setExperimentalSearch(false)
      setLoading(false)
      setGenerating(false)
      setImageAttachment('')
    } catch (error) {
      console.error(error)
      setLoading(false)
      setGenerating(false)
      setImageAttachment('')
      // Clear the streaming buffer + stop flag on failure too. Otherwise a mid-generation error
      // leaves a ghost streaming bubble and — because "Start a chat" is gated on an empty buffer —
      // permanently disables starting a new chat.
      setStream('')
      setStopGenerating(false)
      getOllama().abort()
      // handling the error with toasts
      toast(`${error}`)
    }
  }
  return [isLoading, promptReq]
}
