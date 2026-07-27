import { clsx, ClassValue } from "clsx"
import { createPortal } from "react-dom"
import { twMerge } from "tailwind-merge"
import { ReactNode, ReactPortal } from "react"

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Adds a new line before the ending </customtag>
 * */
export function formatCustomBlock(message: string, tagName: string): string {
  const tag = `</${tagName}>`
  let response = ""
  if (!message.includes(tag)) response = message
  else {
    const position = message.indexOf(tag)
    response = message.slice(0, position) + "\n" + message.slice(position)
  }
  return response
}

/**
 * Checks whether or not both opening and closing tags exist.
 * Inherently the above two checks result in understanding whether the tag exists/is complete.
 * */
export function customTagValidator(message: string, tagName: string): boolean {
  let validator = false // validating flag initialized as false
  const tag = [`<${tagName}>`, `</${tagName}>`] // defining the opening and closing tag
  for (const type of tag) {
    validator = message.includes(type)
  }
  return validator
}

/**
 * A wrapper function over window.api.translate(key:string, options) => string;
 * just to reduce the overhead
 * */
export function t(key: string, options = {}): string {
  return window.api.translate(key, options)
}

/**
 * Extracts URLs from a string. Used to detect links in a prompt so web search can scrape them.
 * (Shared by the plain-chat web-search path and the DeepResearch agent.)
 * */
export function findUrls(text: string): string[] {
  const urlPattern = new RegExp(
    // eslint-disable-next-line no-useless-escape
    /(?:https?:\/\/|www\d{0,3}[.]|[a-z0-9.\-]+[.][a-z]{2,4}\/)(?:[^\s()<>]+|\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))\))+(?:\((?:[^\s()<>]+|(?:\([^\s()<>]+\)))\)|[^\s`!()\[\]{};:'".,<>?«»“”‘’])?/gi
  )
  return text.match(urlPattern) ?? []
}

/**
 * Removes any leftover "harmony" special tokens and should-never-be-shown markers.
 * Handles both the standard form (<|channel|>, <|message|>, <|end|>, <|start|>, <|return|>) and the
 * one-sided-pipe variants some GGUF fine-tunes emit in practice (observed: <|channel> and <channel|>).
 * */
export function stripHarmonyTokens(text: string): string {
  return text.replace(/<\|[^<>]*>|<[^<>]*\|>/g, '')
}

/**
 * Normalizes a raw assistant message into separate reasoning ("thinking") and answer ("content") parts.
 *
 * Some models (gpt-oss / harmony format) leak channel markers into the content stream instead of using
 * Ollama's native `thinking` field, e.g:
 *   <|channel|>analysis<|message|>...reasoning...<|end|><|start|>assistant<|channel|>final<|message|>...answer...
 * or a looser variant seen in the wild:
 *   <|channel|>thought <|channel|>...answer...
 *
 * This parser recovers the reasoning and the answer so raw tokens never render, and the reasoning can be
 * shown in the collapsible "Thinking" accordion. If the string contains no harmony markers it is returned
 * unchanged (cheap fast-path for well-behaved models).
 * */
export function parseHarmony(raw: string): { thinking: string; content: string } {
  if (!raw || (!raw.includes('<|') && !raw.includes('|>'))) return { thinking: '', content: raw }

  // Structured form: <|channel|>NAME<|message|>TEXT (until the next channel/start/end/return marker or EOF)
  const segmentRegex =
    /<\|channel\|>\s*([^<|]*?)\s*<\|message\|>([\s\S]*?)(?=<\|(?:channel|start|end|return)\|>|$)/g
  const finals: string[] = []
  const thoughts: string[] = []
  let matched = false
  let match: RegExpExecArray | null
  while ((match = segmentRegex.exec(raw)) !== null) {
    matched = true
    const name = match[1].toLowerCase()
    const text = stripHarmonyTokens(match[2])
    if (name.includes('final')) finals.push(text)
    else thoughts.push(text)
  }

  if (matched) {
    const thinking = thoughts.join('\n').trim()
    const content = finals.join('\n').trim()
    // Some models put everything in the analysis channel and never emit a final channel; fall back to it.
    return { thinking, content: content || thinking }
  }

  // Loose fallback: markers present but no <|message|> wrappers. Observed in the gemma "agentic" GGUF
  // fine-tune as "<|channel>thought\n<channel|>...answer". Strip the tokens, then drop any leading
  // channel-label words that leaked through so only the answer remains.
  const cleaned = stripHarmonyTokens(raw)
    .replace(/^\s*(?:(?:analysis|thought|thinking|final|commentary|assistant)\b[:\s]*)+/i, '')
    .trim()
  return { thinking: '', content: cleaned }
}

/**
 * Composes reasoning + answer back into a single markdown string using the app's existing <think> convention,
 * so the rendering pipeline in Message.tsx shows reasoning in the collapsible accordion.
 * */
export function composeAssistantMessage(thinking: string, content: string): string {
  if (thinking && content) return `<think>${thinking}</think>\n${content}`
  if (thinking) return `<think>${thinking}</think>`
  return content
}


type Portal = (children: ReactNode, container?: Element | DocumentFragment, key?: string | null | undefined) => ReactPortal

/**
 * Helper with default values for container i.e the first <main> or fallsback to <body>
 * This is so fucking interesting, and just a basic helper, to smooth things out.
 * */
export const Portal: Portal = (children, container = document.getElementsByTagName("main")[0] ?? document.body, key = null) => {
  return createPortal(children, container, key)
}


