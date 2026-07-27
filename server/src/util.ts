import { execFile } from 'child_process'

export interface RunResult {
  stdout: string
  stderr: string
  code: number
}

/** Promisified execFile that never rejects on a non-zero exit (returns the code). */
export function run(
  file: string,
  args: string[],
  cwd?: string,
  timeoutMs = 120_000
): Promise<RunResult> {
  return new Promise((resolve) => {
    execFile(
      file,
      args,
      { cwd, timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? '',
          stderr: stderr?.toString() ?? '',
          code: error && typeof (error as { code?: number }).code === 'number'
            ? ((error as { code?: number }).code as number)
            : error
              ? 1
              : 0
        })
      }
    )
  })
}
