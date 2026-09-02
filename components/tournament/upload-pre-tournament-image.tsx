"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Camera, Upload, X, Image, CheckCircle, ArrowLeft, Building2 } from "lucide-react"
import { uploadTournamentPreImage, setClubCoverAsPreTournamentImage } from "@/app/api/tournaments/actions"

interface UploadPreTournamentImageProps {
  tournamentId: string
  tournamentName: string
  existingImageUrl?: string | null
  clubCoverImageUrl?: string | null
  onImageUploaded?: (url: string) => void
  showCancelButton?: boolean
  onCancel?: () => void
}

export default function UploadPreTournamentImage({
  tournamentId,
  tournamentName,
  existingImageUrl,
  clubCoverImageUrl,
  onImageUploaded,
  showCancelButton = false,
  onCancel,
}: UploadPreTournamentImageProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [isSettingClubCover, setIsSettingClubCover] = useState(false)
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
      const result = await uploadTournamentPreImage(tournamentId, file)

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

  const handleUseClubCover = async () => {
    if (!clubCoverImageUrl) {
      setError('El club no tiene imagen de portada configurada')
      return
    }

    setError(null)
    setIsSettingClubCover(true)

    try {
      const result = await setClubCoverAsPreTournamentImage(tournamentId)

      if (result.success && result.url) {
        setPreviewUrl(result.url)
        setUploadSuccess(true)
        onImageUploaded?.(result.url)
        setTimeout(() => setUploadSuccess(false), 3000)
      } else {
        setError(result.error || 'Error al configurar la imagen del club')
      }
    } catch (err) {
      console.error('Error setting club cover:', err)
      setError('Error inesperado al configurar la imagen')
    } finally {
      setIsSettingClubCover(false)
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
      <CardHeader className="border-b border-gray-200 bg-gradient-to-r from-blue-50 to-indigo-50">
        <CardTitle className="text-xl font-semibold text-slate-900 flex items-center gap-3">
          <div className="bg-blue-100 p-2 rounded-surface">
            <Image className="h-5 w-5 text-blue-600" />
          </div>
          {existingImageUrl ? 'Cambiar Imagen del Torneo' : 'Imagen del Torneo'}
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
              {existingImageUrl ? 'Selecciona una nueva' : 'Sube una'} imagen promocional para el torneo <strong>{tournamentName}</strong>. 
              Esta imagen aparecerá en la información del torneo antes de iniciarlo.
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
            disabled={isUploading || isSettingClubCover}
          />

          {/* Upload Area */}
          <div className="text-center">
            {previewUrl ? (
              <div className="relative">
                <img
                  src={previewUrl}
                  alt="Preview de imagen del torneo"
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

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Button
              onClick={handleButtonClick}
              variant={previewUrl ? "outline" : "default"}
              className={`flex-1 px-6 py-3 ${
                previewUrl 
                  ? "border-blue-200 text-blue-600 hover:bg-blue-50" 
                  : "bg-blue-600 hover:bg-blue-700 text-white"
              }`}
              disabled={isUploading || isSettingClubCover}
            >
              <Upload className="mr-2 h-4 w-4" />
              {isUploading 
                ? "Subiendo..." 
                : previewUrl 
                  ? "Cambiar imagen" 
                  : "Seleccionar imagen"
              }
            </Button>

            {clubCoverImageUrl && (
              <Button
                onClick={handleUseClubCover}
                variant="outline"
                className="flex-1 border-gray-300 text-gray-700 hover:bg-gray-50"
                disabled={isUploading || isSettingClubCover}
              >
                <Building2 className="mr-2 h-4 w-4" />
                {isSettingClubCover ? "Configurando..." : "Usar portada del club"}
              </Button>
            )}
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
                ¡Imagen configurada exitosamente! La imagen del torneo ahora está disponible.
              </p>
            </div>
          )}

          {/* Guidelines */}
          <div className="bg-slate-50 rounded-surface p-4 border border-slate-200">
            <h4 className="font-medium text-slate-900 mb-2">💡 Consejos para una mejor imagen:</h4>
            <ul className="text-sm text-slate-600 space-y-1">
              <li>• Usa una imagen que represente bien el torneo</li>
              <li>• Asegúrate de que se vea clara y profesional</li>
              <li>• Puedes incluir el nombre del torneo o fechas en la imagen</li>
              <li>• Si no tienes imagen específica, usa la portada del club como respaldo</li>
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  )
} 