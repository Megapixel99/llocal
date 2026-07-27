import { contextUsageAtom, sessionMetricsAtom } from '@renderer/store/mocks'
import { cn, t } from '@renderer/utils/utils'
import { useAtomValue } from 'jotai'
import React, { ComponentProps } from 'react'
import {
  averageTokensPerSecond,
  contextGrowthSeries,
  sessionTotals,
  toolTimeline
} from '../../../../../shared/analytics'

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
}

/** A labelled headline number. */
function Stat({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs opacity-60">{label}</span>
    </div>
  )
}

/**
 * Per-session token & context analytics: totals, throughput, context-window
 * growth and a tool-call timeline. All aggregation is done by the pure core in
 * src/shared/analytics.ts; here we only draw it with plain CSS/SVG bars (no
 * chart libraries).
 */
export const AnalyticsPanel = ({
  className,
  ...props
}: ComponentProps<'div'>): React.ReactElement => {
  const metrics = useAtomValue(sessionMetricsAtom)
  const { total: contextWindow } = useAtomValue(contextUsageAtom)

  const totals = sessionTotals(metrics)
  const avgTps = averageTokensPerSecond(metrics)
  const growth = contextGrowthSeries(metrics, contextWindow)
  const tools = toolTimeline(metrics)

  const peakContext = growth.length ? growth[growth.length - 1].cumulativeTokens : 0
  const maxTokens = growth.reduce((m, p) => Math.max(m, p.cumulativeTokens), 0)
  const maxToolDuration = tools.reduce((m, e) => Math.max(m, e.totalDurationMs), 0)

  return (
    <div className={cn('flex w-[26rem] max-w-full flex-col gap-5', className)} {...props}>
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold">{t('Session analytics')}</h2>
        <p className="text-xs opacity-60">{t('Token usage, throughput and tools for this chat')}</p>
      </div>

      {totals.messages === 0 ? (
        <p className="py-6 text-center text-sm opacity-60">
          {t('No metrics yet — send a message to start tracking.')}
        </p>
      ) : (
        <>
          {/* Headline numbers */}
          <div className="grid grid-cols-3 gap-3">
            <Stat label={t('Total tokens')} value={formatTokens(totals.totalTokens)} />
            <Stat label={t('Avg tokens/sec')} value={avgTps > 0 ? avgTps.toFixed(1) : '—'} />
            <Stat label={t('Messages')} value={String(totals.messages)} />
          </div>

          {/* Prompt vs response split */}
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-between text-xs opacity-70">
              <span>
                {t('Prompt')} {formatTokens(totals.promptTokens)}
              </span>
              <span>
                {t('Response')} {formatTokens(totals.responseTokens)}
              </span>
            </div>
            <div className="flex h-2 w-full overflow-hidden rounded-full bg-foreground/10">
              <span
                className="h-full bg-current opacity-40"
                style={{
                  width: `${totals.totalTokens > 0 ? (totals.promptTokens / totals.totalTokens) * 100 : 0}%`
                }}
              />
              <span
                className="h-full bg-current"
                style={{
                  width: `${totals.totalTokens > 0 ? (totals.responseTokens / totals.totalTokens) * 100 : 0}%`
                }}
              />
            </div>
          </div>

          {/* Context-window growth */}
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-medium">{t('Context growth')}</h3>
              <span className="text-xs opacity-60">
                {formatTokens(peakContext)}
                {contextWindow > 0 && ` / ${formatTokens(contextWindow)}`}
              </span>
            </div>
            <div className="flex h-24 items-end gap-1">
              {growth.map((p) => {
                // Bar height tracks cumulative tokens; colour intensity tracks
                // window utilization (redder as it fills up).
                const heightPct = maxTokens > 0 ? (p.cumulativeTokens / maxTokens) * 100 : 0
                const hue = 210 - Math.round(p.utilization * 210) // 210 (blue) -> 0 (red)
                return (
                  <div
                    key={p.index}
                    className="group relative flex-1 rounded-t"
                    style={{
                      height: `${Math.max(4, heightPct)}%`,
                      backgroundColor: contextWindow > 0 ? `hsl(${hue} 70% 55%)` : 'currentColor',
                      opacity: contextWindow > 0 ? 1 : 0.4
                    }}
                    title={`${t('Message')} ${p.index + 1}: ${formatTokens(p.cumulativeTokens)} ${t('tokens')}${
                      contextWindow > 0 ? ` (${Math.round(p.utilization * 100)}%)` : ''
                    }`}
                  />
                )
              })}
            </div>
          </div>

          {/* Tool-call timeline */}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t('Tool calls')}</h3>
            {tools.length === 0 ? (
              <p className="text-xs opacity-60">{t('No tools used in this session.')}</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {tools.map((tool) => (
                  <li key={tool.tool} className="flex flex-col gap-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-mono">{tool.tool}</span>
                      <span className="opacity-60">
                        {tool.count}×
                        {tool.totalDurationMs > 0 && ` · ${(tool.totalDurationMs / 1000).toFixed(1)}s`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
                      <span
                        className="block h-full rounded-full bg-current"
                        style={{
                          width: `${maxToolDuration > 0 ? (tool.totalDurationMs / maxToolDuration) * 100 : 100 / tools.length}%`
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  )
}
