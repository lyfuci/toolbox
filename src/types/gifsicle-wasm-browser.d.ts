declare module 'gifsicle-wasm-browser' {
  export interface GifsicleInput {
    file: string | Blob | File | ArrayBuffer
    name: string
  }

  export interface GifsicleRunOptions {
    input: GifsicleInput[]
    command: string[]
    folder?: string[]
    isStrict?: boolean
    start?: (files: GifsicleInput[]) => void
  }

  export interface GifsicleModule {
    run(options: GifsicleRunOptions): Promise<File[] | null>
  }

  const gifsicle: GifsicleModule
  export default gifsicle
}
