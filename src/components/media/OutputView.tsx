import { Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export type OutputResult = {
  url: string
  filename: string
  mime: string
  size: number
}

export function OutputView({
  result,
  onClear,
}: {
  result: OutputResult
  onClear: () => void
}) {
  const isAudio = result.mime.startsWith('audio/')
  const isImage = result.mime.startsWith('image/')

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{result.filename}</p>
          <p className="text-xs text-muted-foreground">
            {(result.size / 1024 / 1024).toFixed(2)} MB · {result.mime}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" asChild>
            <a href={result.url} download={result.filename}>
              <Download className="h-4 w-4" />
              下载
            </a>
          </Button>
          <Button size="sm" variant="ghost" onClick={onClear}>
            清除
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-md bg-black">
        {isAudio ? (
          <audio src={result.url} controls className="w-full" />
        ) : isImage ? (
          <img src={result.url} alt="output" className="w-full" />
        ) : (
          <video src={result.url} controls className="aspect-video w-full" />
        )}
      </div>
    </Card>
  )
}
