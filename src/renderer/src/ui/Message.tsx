import { ComponentProps, useRef } from "react";
import { useAtomValue } from "jotai";
import { verbosityAtom } from "@renderer/store/mocks";
import { Card } from "./Card";
import Markdown from 'react-markdown'
import rehypeRaw from 'rehype-raw'
import remarkGfm from 'remark-gfm'
import SyntaxHighlighter from 'react-syntax-highlighter'
import { Code } from "./Code";
import { Accordion } from "./Accordion";
import { customTagValidator, formatCustomBlock } from "@renderer/utils/utils";
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
    <div className="mx-5 group-hover:animate-fadeIn opacity-0 group-hover:opacity-100 flex gap-2">
      <CopyButton className="opacity-75" text={message} />
      <TextToSpeech text={message} />
      <ExportDocument text={message} />
      <Branch index={index} />
    </div>
  </div>
}

export const UserMessage = ({ message, ...props }: Message): React.ReactElement => {
  return <div className="group flex flex-col self-end space-y-2 transition-all">
    <Card className="w-fit bg-opacity-10 whitespace-pre-line dark:bg-opacity-10 " {...props}>
      <p className="break-words">{message}</p>
    </Card>
    <div className="mx-5 group-hover:animate-fadeIn opacity-0 group-hover:opacity-100 flex gap-2 self-end">
      <CopyButton className="opacity-75" text={message} />
    </div>
  </div>

}
