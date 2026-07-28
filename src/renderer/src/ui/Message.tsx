import { ComponentProps, useRef, useState } from "react";
import { useAtomValue } from "jotai";
import { LuRotateCcw, LuPencil, LuCheck, LuX } from "react-icons/lu";
import { verbosityAtom } from "@renderer/store/mocks";
import { useMessageActions } from "@renderer/hooks/useMessageActions";
import { Card } from "./Card";
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { Code } from "./Code";
import { Accordion } from "./Accordion";
import { customTagValidator, formatCustomBlock, t } from "@renderer/utils/utils";
import { BreadCrumb } from "./BreadCrumb";
import { BsGlobeCentralSouthAsia } from "react-icons/bs";
import { Table } from "./Table";
import { CopyButton } from "./CopyButton";
import { TextToSpeech } from "@renderer/components/Chat/Messages/TextToSpeech";
import { Branch } from "@renderer/components/Chat/Messages/Branch";
import { ExportDocument } from "@renderer/components/Chat/Messages/ExportDocument";

interface Message extends ComponentProps<'div'> {
  message: string,
  stream?: boolean,
  index?: number
}

export const AiMessage = ({ message, stream, index = 0, ...props }: Message): React.ReactElement => {
  // TODO: Expand this to support multiple custom tags, at the moment it only supports <think></think>

  // Reasoning-display preference (display only; the model still generates the same text).
  const verbosity = useAtomValue(verbosityAtom)
  const { retry } = useMessageActions()

  // this is crucial, since during streaming we need to see the custom tag irrespective.
  // the validation, invalidate's it which is technically correct, but UX wise incorrect.
  let validation = true // optimistic validation
  if (!stream) {
    validation = customTagValidator(message, 'think')
    if (validation) message = formatCustomBlock(message, 'think')
  }

  return <div className="group space-y-2 transition-all">
    <Card className="w-fit" {...props}>
      <Markdown
        className="markdown"
        rehypePlugins={validation ? [rehypeRaw] : []}
        remarkPlugins={[remarkGfm]}
        components={{
          // @ts-ignore because
          think: (data) => {
            if (data.children?.constructor != Array) return <></>
            // Summary: hide the reasoning entirely (answer only).
            if (verbosity === 'summary') return <></>
            // Verbose: show the reasoning inline alongside the answer — nothing collapsed.
            if (verbosity === 'verbose')
              return (
                <div className="markdown my-2 border-l-2 border-foreground/20 pl-3 text-sm opacity-70">
                  {data.children}
                </div>
              )
            // Normal: collapse once finished (open only while streaming). Thinking: keep it expanded.
            const open = verbosity === 'thinking' ? true : stream
            return (
              <Accordion
                title={stream ? "Thinking" : "Chain of thought"}
                content={data.children}
                loading={stream}
                initialOpen={open}
              />
            )
          },
          a: (props) => {
            return (
              <a
                href={props.href}
                className=""
                target="_blank"
                rel="noreferrer"
              >
                <BreadCrumb className=" w-1/6 max-w-fit truncate inline-block">
                  <BsGlobeCentralSouthAsia className="inline-flex mr-1" />
                  {props.children}
                </BreadCrumb>
              </a>
            )
          },
          table: (props) => {
            return <Table {...props} />
          },
          code(props) {
            const myRef = useRef<SyntaxHighlighter>(null)
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { children, className, node, ...rest } = props

            const match = /language-(\w+)/.exec(className || '')
            return match ? (
              <Code language={match[1]} ref={myRef}>
                {String(children).replace(/\n$/, '')}
              </Code>
            ) : (
              <code {...rest} className={className + " text-wrap"}>
                {children}
              </code>
            )
          },
        }}
      >
        {message}
      </Markdown>
    </Card >
    <div className="mx-5 group-hover:animate-fadeIn opacity-0 group-hover:opacity-100 flex gap-2 items-center">
      <CopyButton className="opacity-75" text={message} />
      <TextToSpeech text={message} />
      <ExportDocument text={message} />
      <Branch index={index} />
      {/* Regenerate this reply from the preceding prompt. */}
      <button
        type="button"
        onClick={() => retry(index)}
        title={t('Retry')}
        className="opacity-60 hover:opacity-100 transition-opacity"
      >
        <LuRotateCcw />
      </button>
    </div>
  </div>
}

export const UserMessage = ({ message, index = 0, ...props }: Message): React.ReactElement => {
  const { editAndRun } = useMessageActions()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message)

  if (editing) {
    return (
      <div className="group flex w-full max-w-full flex-col gap-2 self-end lg:max-w-[75%]">
        <Card className="w-full bg-opacity-10 dark:bg-opacity-10">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={Math.min(8, draft.split('\n').length + 1)}
            className="w-full resize-y bg-transparent outline-none"
          />
        </Card>
        <div className="flex gap-2 self-end">
          <button
            type="button"
            onClick={() => {
              setEditing(false)
              editAndRun(index, draft)
            }}
            title={t('Save & submit')}
            className="flex items-center gap-1 rounded-lg bg-foreground/10 px-2 py-1 text-xs hover:bg-foreground/20 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <LuCheck /> {t('Save & submit')}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(message)
              setEditing(false)
            }}
            title={t('Cancel')}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs opacity-70 hover:opacity-100"
          >
            <LuX /> {t('Cancel')}
          </button>
        </div>
      </div>
    )
  }

  return <div className="group flex flex-col self-end space-y-2 transition-all">
    <Card className="w-fit bg-opacity-10 whitespace-pre-line dark:bg-opacity-10 " {...props}>
      <p className="break-words">{message}</p>
    </Card>
    <div className="mx-5 group-hover:animate-fadeIn opacity-0 group-hover:opacity-100 flex gap-2 self-end items-center">
      <CopyButton className="opacity-75" text={message} />
      {/* Edit this prompt and re-run from here. */}
      <button
        type="button"
        onClick={() => {
          setDraft(message)
          setEditing(true)
        }}
        title={t('Edit')}
        className="opacity-60 hover:opacity-100 transition-opacity"
      >
        <LuPencil />
      </button>
    </div>
  </div>

}
