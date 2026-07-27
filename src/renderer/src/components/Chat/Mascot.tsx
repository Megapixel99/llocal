import React, { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { generatingAtom, mascotEnabledAtom } from '@renderer/store/mocks'
import {
  computeMascotState,
  pickIdleActivity,
  CELEBRATE_MS,
  type IdleActivity,
  type MascotState
} from '../../../../shared/mascot'
import './Mascot.css'

/**
 * "Lo" — a tiny composer mascot that sits above the input box. It types on a
 * little laptop while a prompt is being answered, cheers when a run finishes,
 * and idles the rest of the time (occasionally peeking around or batting a
 * ball). All motion is CSS; this component only decides the state (via the pure
 * src/shared/mascot core) and paints the SVG. Opt-out via Preferences.
 */
export const Mascot = ({ className }: { className?: string }): React.ReactElement | null => {
  const busy = useAtomValue(generatingAtom)
  const enabled = useAtomValue(mascotEnabledAtom)

  const [now, setNow] = useState(() => Date.now())
  const celebrateUntilRef = useRef(0)
  const idleStartRef = useRef(Date.now())
  const prevBusyRef = useRef(busy)

  // Transition bookkeeping: celebrate on finish, and restart the idle clock so
  // the idle activity loop begins from 'rest' each time we go quiet.
  useEffect(() => {
    if (prevBusyRef.current && !busy) celebrateUntilRef.current = Date.now() + CELEBRATE_MS
    if (busy !== prevBusyRef.current) idleStartRef.current = Date.now()
    prevBusyRef.current = busy
    setNow(Date.now())
  }, [busy])

  // Slow tick (1s) so idle activities rotate and the celebration expires.
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [enabled])

  if (!enabled) return null

  const state: MascotState = computeMascotState({
    busy,
    celebrateUntil: celebrateUntilRef.current,
    now
  })
  const activity: IdleActivity =
    state === 'idle' ? pickIdleActivity(now - idleStartRef.current) : 'rest'

  return (
    <div
      className={`llocal-mascot ${className ?? ''}`}
      data-state={state}
      data-activity={activity}
      aria-hidden="true"
    >
      <svg viewBox="0 0 72 60" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* thinking: thought dots above the head */}
        <g className="m-only-think">
          <circle className="m-dot" cx="30" cy="8" r="1.6" fill="#8aa0ff" />
          <circle className="m-dot m-dot-2" cx="36" cy="6" r="2" fill="#8aa0ff" />
          <circle className="m-dot m-dot-3" cx="43" cy="8" r="2.4" fill="#8aa0ff" />
        </g>

        {/* celebrate: sparkles */}
        <g className="m-only-celebrate" fill="#ffce4d">
          <path className="m-spark" d="M14 16l1.2 3 3 1.2-3 1.2L14 24l-1.2-2.6-3-1.2 3-1.2z" />
          <path className="m-spark m-spark-2" d="M58 12l1 2.4 2.4 1-2.4 1L58 20l-1-2.6-2.4-1 2.4-1z" />
        </g>

        {/* shadow */}
        <ellipse cx="36" cy="55" rx="17" ry="3" fill="#000" opacity="0.10" />

        <g className="m-body">
          {/* little antenna */}
          <line x1="36" y1="17" x2="36" y2="10" stroke="#5570e6" strokeWidth="2" strokeLinecap="round" />
          <circle cx="36" cy="8.5" r="2.4" fill="#8aa0ff" />

          {/* body */}
          <rect x="19" y="17" width="34" height="35" rx="16" fill="#6c8cff" />
          {/* belly */}
          <ellipse cx="36" cy="37" rx="11" ry="12" fill="#eef2ff" />
          {/* feet */}
          <ellipse cx="29" cy="51" rx="4.5" ry="3" fill="#5570e6" />
          <ellipse cx="43" cy="51" rx="4.5" ry="3" fill="#5570e6" />

          {/* face (peeks left/right while idle) */}
          <g className="m-face">
            <circle cx="27.5" cy="34.5" r="2.6" fill="#ff9db1" opacity="0.75" />
            <circle cx="44.5" cy="34.5" r="2.6" fill="#ff9db1" opacity="0.75" />
            <ellipse className="m-eye" cx="31" cy="31" rx="2.4" ry="3.2" fill="#26304d" />
            <ellipse className="m-eye m-eye-2" cx="41" cy="31" rx="2.4" ry="3.2" fill="#26304d" />
            <path d="M33 37c1.4 1.4 4.6 1.4 6 0" stroke="#26304d" strokeWidth="1.6" strokeLinecap="round" fill="none" />
          </g>

          {/* thinking: a tiny laptop the mascot types on */}
          <g className="m-only-think">
            <rect x="25" y="40" width="22" height="12" rx="1.5" fill="#334155" />
            <rect x="26.5" y="41.5" width="19" height="9" rx="1" fill="#7f9bff" />
            <path d="M23 52h26l1.5 3H21.5z" fill="#cbd5e1" />
            <rect className="m-hand m-hand-l" x="29" y="49.5" width="4" height="3" rx="1.5" fill="#5570e6" />
            <rect className="m-hand m-hand-r" x="39" y="49.5" width="4" height="3" rx="1.5" fill="#5570e6" />
          </g>
        </g>

        {/* idle play: a little ball it bats around */}
        <g className="m-only-play">
          <circle className="m-ball" cx="60" cy="50" r="4.2" fill="#ffb020" />
        </g>
      </svg>
    </div>
  )
}
