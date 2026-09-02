"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Camera, Upload, X, Trophy, CheckCircle, ArrowLeft } from "lucide-react"
import { uploadTournamentWinnerImage } from "@/app/api/tournaments/actions"

interface UploadWinnerImageProps {
  tournamentId: string
  tournamentName: string
  existingImageUrl?: string | null
  onImageUploaded?: (url: string) => void
  showCancelButton?: boolean
  onCancel?: () => void
}

export default function UploadWinnerImage({
  tournamentId,
  tournamentName,
  existingImageUrl,
  onImageUploaded,
  showCancelButton = false,
  onCancel,
}: UploadWinnerImageProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(existingImageUrl || null)
  const [uploadSuccess, setUploadSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleButtonClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
    if (!allowedTypes.includes(file.type)) {
      setError('Tipo de archivo no permitido. Solo se permiten imágenes (JPG, PNG, WEBP).')
      return
    }

    // Validate file size (5MB max)
    if (file.size > 5 * 1024 * 1024) {
      setError('El archivo es demasiado grande. Máximo 5MB.')
      return
    }

    setError(null)
    setIsUploading(true)

    try {
      // Create preview
      const reader = new FileReader()
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string)
      }
      reader.readAsDataURL(file)

      // Upload file
      const result = await uploadTournamentWinnerImage(tournamentId, file)

      if (result.success && result.url) {
        setUploadSuccess(true)
        onImageUploaded?.(result.url)
        setTimeout(() => setUploadSuccess(false), 3000) // Reset success state after 3s
      } else {
        setError(result.error || 'Error al subir la imagen')
        setPreviewUrl(existingImageUrl || null) // Reset preview on error
      }
    } catch (err) {
      console.error('Error uploading image:', err)
      setError('Error inesperado al subir la imagen')
      setPreviewUrl(existingImageUrl || null) // Reset preview on error
    } finally {
      setIsUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const clearPreview = () => {
    setPreviewUrl(null)
    setError(null)
    setUploadSuccess(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-amber-50 to-yellow-50">
        <CardTitle className="text-xl font-semibold text-slate-900 flex items-center gap-3">
          <div className="bg-amber-100 p-2 rounded-surface">
            <Trophy className="h-5 w-5 text-amber-600" />
          </div>
          {existingImageUrl ? 'Cambiar Foto de los Ganadores' : 'Foto de los Ganadores'}
          {uploadSuccess && (
            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 ml-auto">
              <CheckCircle className="h-3 w-3 mr-1" />
              ¡Subida exitosa!
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-6">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-slate-600">
              {existingImageUrl ? 'Selecciona una nueva' : 'Sube una'} foto especial de los ganadores del torneo <strong>{tournamentName}</strong>. 
              Esta imagen aparecerá destacada en los detalles del torneo.
            </p>
            {showCancelButton && (
              <Button
                variant="outline"
                onClick={onCancel}
                className="border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
            )}
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />

          {/* Upload Area */}
          <div className="border-2 border-dashed border-gray-300 rounded-surface p-8 text-center hover:border-blue-400 transition-colors">
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview de imagen de ganadores"
                  className="max-w-full h-64 mx-auto rounded-surface object-cover shadow-md"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearPreview}
                  className="absolute top-2 right-2 bg-white/90 hover:bg-white"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-blue-50 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                  <Camera className="h-8 w-8 text-blue-500" />
                </div>
                <div>
                  <p className="text-lg font-medium text-slate-700 mb-2">
                    Selecciona una imagen
                  </p>
                  <p className="text-sm text-slate-500">
                    JPG, PNG o WEBP hasta 5MB
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Upload Button */}
          <div className="flex justify-center">
            <Button
              onClick={handleButtonClick}
              variant={previewUrl ? "outline" : "default"}
              className={`px-6 py-3 ${
                previewUrl 
                  ? "border-blue-200 text-blue-600 hover:bg-blue-50" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
              disabled={isUploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading 
                ? "Subiendo..." 
                : previewUrl 
                  ? "Cambiar imagen" 
                  : "Seleccionar imagen"
              }
            </Button>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-surface p-4">
              <p className="text-red-700 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Success Message */}
          {uploadSuccess && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-surface p-4">
              <p className="text-emerald-700 text-sm font-medium">
                ¡Imagen subida exitosamente! La foto de los ganadores ahora está disponible en el torneo.
              </p>
            </div>
          )}

          {/* Guidelines */}
          <div className="bg-slate-50 rounded-surface p-4 border border-slate-200">
            <h4 className="font-medium text-slate-900 mb-2">💡 Consejos para una mejor foto:</h4>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Asegúrate de que se vean claramente las caras de los ganadores</li>
              <li>• Incluye el trofeo o premio si es posible</li>
              <li>• Una buena iluminación hace la diferencia</li>
              <li>• Puedes tomar la foto horizontalmente para mejor composición</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 