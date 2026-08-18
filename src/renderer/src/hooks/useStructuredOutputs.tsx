import { prefModelAtom } from "@renderer/store/mocks"
import { getOllama } from "@renderer/utils/ollama"
import { useAtom } from "jotai"
import { zodToJsonSchema } from 'zod-to-json-schema';
import { modelOptions } from '../../../shared/model-options'

export function useStructureOutputs() {
  const [modelName] = useAtom(prefModelAtom)

  async function getStructuredResponse(prompt, schema, systemPrompt = "") {
    // Structured output is parsed, never read by a human: pin sampling so the same input gives
    // the same object back.
    const generation = await getOllama().generate({
      model: modelName,
      system: systemPrompt,
      prompt,
      stream: false,
      format: zodToJsonSchema(schema),
      options: modelOptions({ deterministic: true })
    })
    let result = null
    try {
      result = schema.parse(JSON.parse(generation.response))
    } catch (e) {
    }
    return result
  }
  return { getStructuredResponse }
}
