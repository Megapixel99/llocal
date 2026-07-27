import { agentApprovalAtom } from '@renderer/store/mocks'
import { useAtom } from 'jotai'
import { Portal, t } from '@renderer/utils/utils'
import { Card } from '@renderer/ui/Card'
import { Button } from '@renderer/ui/Button'
import { resolveAgentApproval } from '@renderer/utils/agent'

const preClass =
  'text-xs bg-foreground bg-opacity-10 dark:bg-background dark:bg-opacity-20 rounded-lg p-3 overflow-auto max-h-60 whitespace-pre-wrap'

/**
 * Modal shown while the agent (in "ask" mode) waits for the user to approve a mutating action
 * (write_file / run_command). Approving/rejecting resolves the promise the loop is awaiting.
 * */
export const AgentApproval = (): React.ReactElement | null => {
  const [approval, setApproval] = useAtom(agentApprovalAtom)
  if (!approval) return null

  const isCommand = approval.tool === 'run_command'
  const isWrite = approval.tool === 'write_file'
  const isMcp = approval.tool.startsWith('mcp__')

  const heading = isCommand
    ? t('Run this command?')
    : isWrite
      ? t('Write this file?')
      : isMcp
        ? t('Run this MCP tool?')
        : t('Run this tool?')
  const detail = isCommand
    ? String(approval.args.command ?? '')
    : isWrite
      ? String(approval.args.path ?? '')
      : approval.tool

  return Portal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="flex w-[34rem] max-w-full flex-col gap-3 rounded-2xl border-2 border-foreground border-opacity-5 p-5 shadow-xl">
        <h2 className="text-base font-medium">{heading}</h2>
        <pre className={preClass}>{detail}</pre>
        {isWrite && <pre className={preClass}>{String(approval.args.content ?? '')}</pre>}
        {!isCommand && !isWrite && Object.keys(approval.args).length > 0 && (
          <pre className={preClass}>{JSON.stringify(approval.args, null, 2)}</pre>
        )}
        <div className="flex justify-end gap-2">
          <Button
            variant="secondary"
            className="text-xs"
            onClick={() => resolveAgentApproval(setApproval, false)}
          >
            {t('Reject')}
          </Button>
          <Button
            variant="primary"
            className="text-xs"
            onClick={() => resolveAgentApproval(setApproval, true)}
          >
            {t('Approve')}
          </Button>
        </div>
      </Card>
    </div>
  )
}
