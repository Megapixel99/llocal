// Ambient declaration so the server typechecks even on machines where the heavy
// optional `kokoro-js` dependency isn't installed. At runtime the real package
// (a root dependency) provides these.
declare module 'kokoro-js' {
  export const env: { cacheDir: string; [key: string]: unknown }
  export class KokoroTTS {
    static from_pretrained(
      model: string,
      options: { dtype: string; device: string }
    ): Promise<KokoroTTS>
    generate(text: string, options: { voice: string }): Promise<{ toWav(): ArrayBuffer }>
  }
}
