import { useRef, useState } from 'react'
import { Button } from './Button'

interface FileUploadProps {
  onUpload: (file: File) => Promise<void>
  accept?: string
  maxSize?: number // in MB
  label?: string
  isLoading?: boolean
}

export const FileUpload = ({
  onUpload,
  accept = 'image/*,.pdf',
  maxSize = 10,
  label = 'Upload File',
  isLoading = false,
}: FileUploadProps) => {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)

    // Check file size
    if (file.size > maxSize * 1024 * 1024) {
      setError(`File size must be less than ${maxSize}MB`)
      return
    }

    try {
      await onUpload(file)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
  }

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileChange}
        className="hidden"
        disabled={isLoading}
      />
      <Button
        variant="outline"
        onClick={() => fileInputRef.current?.click()}
        isLoading={isLoading}
      >
        {label}
      </Button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}

