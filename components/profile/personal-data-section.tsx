"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { User, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import PlayerDniDisplay from "@/components/players/player-dni-display"

interface PersonalDataSectionProps {
  defaultValues: any
}

export function PersonalDataSection({ defaultValues }: PersonalDataSectionProps) {
  const [avatarPreview, setAvatarPreview] = useState<string | null>(defaultValues.profile_image_url || null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)

  useEffect(() => {
    if (!avatarFile && defaultValues.profile_image_url !== avatarPreview) {
      setAvatarPreview(defaultValues.profile_image_url || null)
    }
  }, [defaultValues.profile_image_url, avatarFile, avatarPreview])

  const handleAvatarChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      setAvatarFile(file)
      const reader = new FileReader()
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    } else {
      setAvatarFile(null)
      setAvatarPreview(defaultValues.profile_image_url || null)
    }
  }

  const handleRemoveAvatar = () => {
    setAvatarFile(null)
    setAvatarPreview(null)
  }

  return (
    <Card className="bg-white border border-gray-200 shadow-sm">
      <CardHeader className="border-b border-gray-100 p-4 md:p-6">
        <div className="flex items-center space-x-3">
          <div className="bg-blue-100 p-2 rounded-lg">
            <User className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <CardTitle className="text-base md:text-lg font-semibold text-gray-900">Datos Personales</CardTitle>
            <p className="text-xs md:text-sm text-gray-600">Información básica de tu perfil</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 md:p-6 space-y-6">
        {/* Avatar Upload Section */}
        <div className="space-y-3">
          <Label htmlFor="avatar_file" className="text-sm font-medium text-gray-700">
            Foto de Perfil
          </Label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
            {avatarPreview ? (
              <div className="relative flex-shrink-0 mx-auto sm:mx-0">
                <img
                  src={avatarPreview || "/placeholder.svg"}
                  alt="Avatar Preview"
                  className="w-20 h-20 rounded-full object-cover border-2 border-gray-200"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleRemoveAvatar}
                  className="absolute -top-2 -right-2 h-6 w-6 p-0 rounded-full border-gray-300 bg-white hover:bg-gray-50"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="w-20 h-20 flex-shrink-0 rounded-full bg-gray-100 flex items-center justify-center border-2 border-dashed border-gray-300 mx-auto sm:mx-0">
                <User className="w-8 h-8 text-gray-400" />
              </div>
            )}
            <div className="flex flex-col space-y-2 w-full">
              <Input
                id="avatar_file"
                name="avatar_file"
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                onChange={handleAvatarChange}
                className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 file:mr-2 md:file:mr-4 file:py-2 file:px-3 md:file:px-4 file:rounded-lg file:border-0 file:text-xs md:file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
              <p className="text-xs text-gray-500">JPEG, JPG, PNG, WEBP (sin límite de tamaño)</p>
            </div>
          </div>
          <input
            type="hidden"
            name="avatar_url_existing"
            value={avatarPreview === null ? "" : avatarFile ? defaultValues.profile_image_url || "" : avatarPreview || ""}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="first_name" className="text-sm font-medium text-gray-700">
              Nombre
            </Label>
            <Input
              id="first_name"
              name="first_name"
              defaultValue={defaultValues.first_name}
              required
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="last_name" className="text-sm font-medium text-gray-700">
              Apellido
            </Label>
            <Input
              id="last_name"
              name="last_name"
              defaultValue={defaultValues.last_name}
              required
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dni" className="text-sm font-medium text-gray-700">
              DNI
            </Label>
            <Input
              id="dni"
              name="dni"
              defaultValue={defaultValues.dni}
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
            <div className="text-xs text-gray-500">
              <PlayerDniDisplay dni={defaultValues.dni} dniIsTemporary={defaultValues.dni_is_temporary} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-sm font-medium text-gray-700">
              Teléfono
            </Label>
            <Input
              id="phone"
              name="phone"
              type="tel"
              defaultValue={defaultValues.phone}
              className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="date_of_birth" className="text-sm font-medium text-gray-700">
            Fecha de Nacimiento
          </Label>
          <Input
            id="date_of_birth"
            name="date_of_birth"
            type="date"
            defaultValue={defaultValues.date_of_birth}
            className="border-gray-300 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-3">
          <Label className="text-sm font-medium text-gray-700">Género (No se puede cambiar)</Label>
          <RadioGroup name="gender" value={defaultValues.gender} className="flex flex-col space-y-2" disabled>
            <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <RadioGroupItem value="MALE" id="gender-male" className="text-blue-600 border-gray-300" disabled />
              <Label htmlFor="gender-male" className="text-gray-600">
                Caballeros
              </Label>
            </div>
            <div className="flex items-center space-x-3 bg-gray-50 p-3 rounded-lg border border-gray-200">
              <RadioGroupItem value="FEMALE" id="gender-female" className="text-blue-600 border-gray-300" disabled />
              <Label htmlFor="gender-female" className="text-gray-600">
                Damas
              </Label>
            </div>
          </RadioGroup>
        </div>
      </CardContent>
    </Card>
  )
}
