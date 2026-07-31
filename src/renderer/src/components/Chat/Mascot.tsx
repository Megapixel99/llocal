import React, { useEffect, useRef, useState } from 'react'
import { useAtomValue } from 'jotai'
import { generatingAtom, mascotEnabledAtom, mascotPhaseAtom } from '@renderer/store/mocks'
import {
  computeMascotState,
  pickIdleActivity,
  CELEBRATE_MS,
  type IdleActivity,
  type MascotState
} from '../../../../shared/mascot'
import './Mascot.css'

/**
 * "Lo" — a tiny composer mascot that sits above the input box. While a prompt is
 * in flight it reads a little book when the model is thinking/researching and
 * types on a tiny laptop when it's writing the answer; it cheers when a run
 * finishes, and idles the rest of the time (peeking around, batting a ball,
 * stretching, waving hello, or dozing off).
 * All motion is CSS; this component only decides the state (via the pure
 * src/shared/mascot core) and paints the SVG. Opt-out via Preferences.
 */
export const Mascot = ({ className }: { className?: string }): React.ReactElement | null => {
  const busy = useAtomValue(generatingAtom)
  const phase = useAtomValue(mascotPhaseAtom)
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
    phase: phase ?? undefined,
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
        {/* reading (thinking/researching): thought dots above the head */}
        <g className="m-only-read">
          <circle className="m-dot" cx="30" cy="8" r="1.6" fill="#8aa0ff" />
          <circle className="m-dot m-dot-2" cx="36" cy="6" r="2" fill="#8aa0ff" />
          <circle className="m-dot m-dot-3" cx="43" cy="8" r="2.4" fill="#8aa0ff" />
        </g>

        {/* celebrate: sparkles */}
        <g className="m-only-celebrate" fill="#ffce4d">
          <path className="m-spark" d="M14 16l1.2 3 3 1.2-3 1.2L14 24l-1.2-2.6-3-1.2 3-1.2z" />
          <path className="m-spark m-spark-2" d="M58 12l1 2.4 2.4 1-2.4 1L58 20l-1-2.6-2.4-1 2.4-1z" />
        </g>

        {/* idle sleep: drifting Zzz */}
        <g className="m-only-sleep" fill="#8aa0ff" fontFamily="sans-serif" fontWeight="700">
          <text className="m-z m-z-1" x="45" y="19" fontSize="6">z</text>
          <text className="m-z m-z-2" x="49" y="13" fontSize="8">z</text>
          <text className="m-z m-z-3" x="54" y="7" fontSize="10">z</text>
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

          {/* idle stretch: both arms reach way up for a big stretch */}
          <g className="m-only-stretch">
            <rect className="m-arm m-arm-l" x="17.4" y="20" width="3.4" height="14" rx="1.7" fill="#5570e6" />
            <rect className="m-arm m-arm-r" x="51.2" y="20" width="3.4" height="14" rx="1.7" fill="#5570e6" />
          </g>

          {/* idle wave: a friendly waving hand held up on the right */}
          <g className="m-only-wave">
            <rect className="m-wave-arm" x="50.6" y="22" width="3.4" height="12" rx="1.7" fill="#5570e6" />
          </g>

          {/* responding: the laptop faces LO (away from us), so we see the back
              of the lid; the keyboard base sits behind it and Lo reaches over the
              top to type — hands peek over the lid's top edge and tap. */}
          <g className="m-only-respond">
            {/* keyboard base behind the lid — only its near front edge shows */}
            <path d="M25 47.5 H47 L49.5 51 H22.5 Z" fill="#c7cee0" />
            <rect x="24.5" y="46.6" width="23" height="1.6" rx="0.8" fill="#b0b8d0" />
            {/* screen lid, back panel facing the viewer */}
            <rect x="28.5" y="40" width="15" height="7.2" rx="1.6" fill="#8b95bb" />
            <circle cx="36" cy="43.6" r="1.5" fill="#aab2d4" />
            {/* Lo's hands reaching over the top edge onto the keyboard behind */}
            <rect className="m-hand m-hand-l" x="30" y="38.6" width="4.3" height="2.8" rx="1.4" fill="#5570e6" />
            <rect className="m-hand m-hand-r" x="37.7" y="38.6" width="4.3" height="2.8" rx="1.4" fill="#5570e6" />
          </g>

          {/* reading (thinking/researching): a little open book Lo scans */}
          <g className="m-only-read m-book">
            {/* pages */}
            <path d="M36 45 L23 46.6 L24.2 51.4 L36 50 Z" fill="#eef2ff" stroke="#b9c2e4" strokeWidth="0.5" />
            <path d="M36 45 L49 46.6 L47.8 51.4 L36 50 Z" fill="#f8faff" stroke="#b9c2e4" strokeWidth="0.5" />
            {/* spine */}
            <line x1="36" y1="45" x2="36" y2="50" stroke="#9aa6cf" strokeWidth="0.8" />
            {/* faint text lines */}
            <line x1="26.5" y1="47.4" x2="33.5" y2="46.9" stroke="#c2cbe6" strokeWidth="0.6" />
            <line x1="26.7" y1="48.7" x2="33.5" y2="48.2" stroke="#c2cbe6" strokeWidth="0.6" />
            <line x1="38.5" y1="46.9" x2="45.5" y2="47.4" stroke="#c2cbe6" strokeWidth="0.6" />
            <line x1="38.5" y1="48.2" x2="45.3" y2="48.7" stroke="#c2cbe6" strokeWidth="0.6" />
            {/* a page that turns now and then */}
            <path className="m-page" d="M36 45 L48 46.5 L47 51.2 L36 50 Z" fill="#ffffff" stroke="#b9c2e4" strokeWidth="0.4" />
            {/* little hands holding the book */}
            <rect x="21.5" y="49.5" width="4" height="3" rx="1.5" fill="#5570e6" />
            <rect x="46.5" y="49.5" width="4" height="3" rx="1.5" fill="#5570e6" />
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
