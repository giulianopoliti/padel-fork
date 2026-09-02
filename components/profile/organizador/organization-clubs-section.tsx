"use client"
import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetClose } from "@/components/ui/sheet"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Building2, Plus, MapPin, Phone, Mail, Clock, Users, ExternalLink, Trash2, Loader2, ImageIcon, Camera, Upload, Star, MoreVertical, Edit } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"
import { getStorageUrl } from "@/utils/storage-url"
import {
  createClubForOrganization,
  associateExistingClub,
  uploadClubCoverActionForOrganizer,
  uploadClubGalleryActionForOrganizer,
  removeClubGalleryActionForOrganizer,
  updateClubForOrganizer
} from "@/app/(main)/edit-profile/organizador-actions"

interface OrganizationClubsSectionProps {
  organizationClubs: any[]
  allClubs: any[]
  featuredClubId?: string | null
  onClubsChange: (clubs: any[]) => void
  onRefresh: () => void
  onSetFeaturedClub?: (clubId: string | null) => void
}

export function OrganizationClubsSection({
  organizationClubs,
  allClubs,
  featuredClubId,
  onClubsChange,
  onRefresh,
  onSetFeaturedClub
}: OrganizationClubsSectionProps) {
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [isAssociatingExisting, setIsAssociatingExisting] = useState(false)
  const [isCreatingClub, setIsCreatingClub] = useState(false)
  const [isAssociatingClub, setIsAssociatingClub] = useState(false)
  const [isManagingGallery, setIsManagingGallery] = useState(false)
  const [selectedClub, setSelectedClub] = useState<any>(null)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [uploadType, setUploadType] = useState<"cover" | "gallery" | null>(null)
  const [isEditingClub, setIsEditingClub] = useState(false)
  const [clubToEdit, setClubToEdit] = useState<any>(null)
  const [isUpdatingClub, setIsUpdatingClub] = useState(false)
  const coverInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const { toast} = useToast()

  const handleAddNewClub = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isCreatingClub) return

    const formData = new FormData(event.currentTarget)
    
    try {
      setIsCreatingClub(true)
      const result = await createClubForOrganization(formData)
      
      if (result.success) {
        toast({
          title: "Club creado exitosamente",
          description: result.message,
          variant: "default",
        })
        setIsAddingNew(false)
        onRefresh() // Refresh the data
      } else {
        toast({
          title: "Error al crear el club",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating club:", error)
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado al crear el club.",
        variant: "destructive",
      })
    } finally {
      setIsCreatingClub(false)
    }
  }

  const handleAssociateExistingClub = async (clubId: string) => {
    if (isAssociatingClub) return

    try {
      setIsAssociatingClub(true)
      const result = await associateExistingClub(clubId)
      
      if (result.success) {
        toast({
          title: "Club asociado exitosamente",
          description: result.message,
          variant: "default",
        })
        setIsAssociatingExisting(false)
        onRefresh() // Refresh the data
      } else {
        toast({
          title: "Error al asociar el club",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error associating club:", error)
      toast({
        title: "Error",
        description: "Ocurrió un error inesperado al asociar el club.",
        variant: "destructive",
      })
    } finally {
      setIsAssociatingClub(false)
    }
  }

  const handleRemoveClub = async (clubId: string) => {
    try {
      toast({
        title: "Funcionalidad en desarrollo",
        description: "La desasociación de clubes estará disponible próximamente.",
        variant: "default",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Ocurrió un error al desasociar el club.",
        variant: "destructive",
      })
    }
  }

  const availableClubs = allClubs.filter(club => 
    !organizationClubs.some(orgClub => orgClub.id === club.id)
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-base md:text-lg font-medium text-gray-900">Clubes Asociados</h3>
          <p className="text-xs md:text-sm text-gray-600 mt-1">
            Gestiona los clubes que forman parte de tu organización
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <Sheet open={isAssociatingExisting} onOpenChange={setIsAssociatingExisting}>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" disabled={isCreatingClub || isAssociatingClub} className="w-full sm:w-auto text-xs md:text-sm">
                <Building2 className="h-4 w-4 mr-2" />
                Asociar Club Existente
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:w-[500px]">
              <SheetHeader>
                <SheetTitle>Asociar Club Existente</SheetTitle>
                <SheetDescription>
                  Selecciona un club existente para asociarlo a tu organización
                </SheetDescription>
              </SheetHeader>
              
              <div className="space-y-4 mt-6">
                {availableClubs.length > 0 ? (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      Seleccionar Club
                      {isAssociatingClub && <Loader2 className="h-4 w-4 animate-spin" />}
                    </Label>
                    <Select onValueChange={handleAssociateExistingClub} disabled={isAssociatingClub}>
                      <SelectTrigger className="disabled:opacity-50">
                        <SelectValue placeholder={isAssociatingClub ? "Asociando..." : "Selecciona un club..."} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableClubs.map((club) => (
                          <SelectItem key={club.id} value={club.id}>
                            <div className="flex items-center gap-2">
                              <Building2 className="h-4 w-4" />
                              <span>{club.name}</span>
                              {club.address && (
                                <span className="text-xs text-gray-500">- {club.address}</span>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No hay clubes disponibles para asociar</p>
                  </div>
                )}
              </div>
            </SheetContent>
          </Sheet>

          <Sheet open={isAddingNew} onOpenChange={setIsAddingNew}>
            <SheetTrigger asChild>
              <Button size="sm" disabled={isCreatingClub || isAssociatingClub} className="w-full sm:w-auto text-xs md:text-sm">
                <Plus className="h-4 w-4 mr-2" />
                Crear Nuevo Club
              </Button>
            </SheetTrigger>
            <SheetContent className="w-full sm:w-[540px] sm:max-w-[90vw] overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Crear Nuevo Club</SheetTitle>
                <SheetDescription>
                  Completa la información para crear un nuevo club asociado a tu organización
                </SheetDescription>
              </SheetHeader>

              <form onSubmit={handleAddNewClub} className="space-y-4 md:space-y-6 mt-4 md:mt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="new_club_name" className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4" />
                      Nombre del Club *
                    </Label>
                    <Input
                      id="new_club_name"
                      name="name"
                      required
                      disabled={isCreatingClub}
                      placeholder="Nombre del club"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="new_club_address" className="flex items-center gap-2 text-sm">
                      <MapPin className="h-4 w-4" />
                      Dirección *
                    </Label>
                    <Input
                      id="new_club_address"
                      name="address"
                      required
                      disabled={isCreatingClub}
                      placeholder="Dirección completa"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_phone" className="flex items-center gap-2 text-sm">
                      <Phone className="h-4 w-4" />
                      Teléfono
                    </Label>
                    <Input
                      id="new_club_phone"
                      name="phone"
                      disabled={isCreatingClub}
                      placeholder="+54 9 11 1234-5678"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_email" className="flex items-center gap-2 text-sm">
                      <Mail className="h-4 w-4" />
                      Email
                    </Label>
                    <Input
                      id="new_club_email"
                      name="email"
                      type="email"
                      disabled={isCreatingClub}
                      placeholder="contacto@club.com"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_courts" className="flex items-center gap-2 text-sm">
                      <Users className="h-4 w-4" />
                      Cantidad de Canchas
                    </Label>
                    <Input
                      id="new_club_courts"
                      name="courts"
                      type="number"
                      min="1"
                      disabled={isCreatingClub}
                      placeholder="4"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_instagram" className="flex items-center gap-2 text-sm">
                      <ExternalLink className="h-4 w-4" />
                      Instagram
                    </Label>
                    <Input
                      id="new_club_instagram"
                      name="instagram"
                      disabled={isCreatingClub}
                      placeholder="@club_padel"
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_opens_at" className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      Horario de Apertura
                    </Label>
                    <Input
                      id="new_club_opens_at"
                      name="opens_at"
                      type="time"
                      disabled={isCreatingClub}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="new_club_closes_at" className="flex items-center gap-2 text-sm">
                      <Clock className="h-4 w-4" />
                      Horario de Cierre
                    </Label>
                    <Input
                      id="new_club_closes_at"
                      name="closes_at"
                      type="time"
                      disabled={isCreatingClub}
                      className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 text-sm"
                    />
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
                  <SheetClose asChild>
                    <Button type="button" variant="outline" disabled={isCreatingClub} className="w-full sm:w-auto">
                      Cancelar
                    </Button>
                  </SheetClose>
                  <Button type="submit" disabled={isCreatingClub} className="w-full sm:w-auto">
                    {isCreatingClub ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Creando...
                      </>
                    ) : (
                      "Crear Club"
                    )}
                  </Button>
                </div>
              </form>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {organizationClubs.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {organizationClubs.map((club) => (
            <Card key={club.id} className={`p-4 md:p-6 hover:shadow-md transition-shadow relative ${featuredClubId === club.id ? 'ring-2 ring-amber-400 bg-amber-50/30' : ''}`}>
              {/* Featured Badge */}
              {featuredClubId === club.id && (
                <div className="absolute -top-2 -right-2">
                  <Badge className="bg-gradient-to-r from-amber-400 to-amber-600 text-white border-0 shadow-lg">
                    <Star className="h-3 w-3 mr-1 fill-white" />
                    Destacado
                  </Badge>
                </div>
              )}

              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-blue-600" />
                  <h4 className="font-semibold text-gray-900">{club.name}</h4>
                </div>
                <div className="flex gap-1">
                  {/* Feature/Unfeature Toggle */}
                  {onSetFeaturedClub && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onSetFeaturedClub(featuredClubId === club.id ? null : club.id)}
                      className={featuredClubId === club.id ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-gray-500 hover:text-amber-600 hover:bg-amber-50"}
                      title={featuredClubId === club.id ? "Quitar destacado" : "Marcar como destacado"}
                    >
                      <Star className={`h-4 w-4 ${featuredClubId === club.id ? 'fill-amber-500' : ''}`} />
                    </Button>
                  )}
                  {/* Dropdown Menu for Actions */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => {
                          setClubToEdit(club)
                          setIsEditingClub(true)
                        }}
                      >
                        <Edit className="h-4 w-4 mr-2" />
                        Editar Datos
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => {
                          setSelectedClub(club)
                          setIsManagingGallery(true)
                        }}
                      >
                        <ImageIcon className="h-4 w-4 mr-2" />
                        Gestionar Fotos
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => handleRemoveClub(club.id)}
                        className="text-red-600 focus:text-red-600"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Eliminar Club
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="space-y-2 text-sm text-gray-600">
                {club.address && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    <span>{club.address}</span>
                  </div>
                )}
                {club.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span>{club.phone}</span>
                  </div>
                )}
                {club.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span>{club.email}</span>
                  </div>
                )}
                {club.courts && (
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    <span>{club.courts} canchas</span>
                  </div>
                )}
              </div>

              {club.opens_at && club.closes_at && (
                <div className="mt-3 pt-3 border-t">
                  <Badge variant="outline" className="text-xs">
                    <Clock className="h-3 w-3 mr-1" />
                    {club.opens_at} - {club.closes_at}
                  </Badge>
                </div>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <div className="text-center py-12">
          <Building2 className="h-16 w-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No hay clubes asociados</h3>
          <p className="text-gray-600 mb-6">
            Comienza creando un nuevo club o asociando uno existente a tu organización
          </p>
        </div>
      )}

      {/* Edit Club Sheet */}
      <Sheet open={isEditingClub} onOpenChange={setIsEditingClub}>
        <SheetContent className="w-full sm:w-[540px] sm:max-w-[90vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Editar Club</SheetTitle>
            <SheetDescription>
              Modifica la información del club
            </SheetDescription>
          </SheetHeader>

          {clubToEdit && (
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (isUpdatingClub) return

              const formData = new FormData(e.currentTarget)
              formData.append('clubId', clubToEdit.id)

              try {
                setIsUpdatingClub(true)
                const result = await updateClubForOrganizer(formData)

                if (result.success) {
                  toast({
                    title: "Club actualizado",
                    description: result.message,
                    variant: "default",
                  })
                  setIsEditingClub(false)
                  onRefresh()
                } else {
                  toast({
                    title: "Error",
                    description: result.message,
                    variant: "destructive",
                  })
                }
              } catch (error) {
                toast({
                  title: "Error",
                  description: "Ocurrió un error inesperado al actualizar el club.",
                  variant: "destructive",
                })
              } finally {
                setIsUpdatingClub(false)
              }
            }} className="space-y-4 md:space-y-6 mt-4 md:mt-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="edit_club_name" className="flex items-center gap-2">
                    <Building2 className="h-4 w-4" />
                    Nombre del Club *
                  </Label>
                  <Input
                    id="edit_club_name"
                    name="name"
                    required
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.name}
                    placeholder="Nombre del club"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor="edit_club_address" className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Dirección *
                  </Label>
                  <Input
                    id="edit_club_address"
                    name="address"
                    required
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.address}
                    placeholder="Dirección completa"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    Teléfono
                  </Label>
                  <Input
                    id="edit_club_phone"
                    name="phone"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.phone || ""}
                    placeholder="+54 9 11 1234-5678"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_email" className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email
                  </Label>
                  <Input
                    id="edit_club_email"
                    name="email"
                    type="email"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.email || ""}
                    placeholder="contacto@club.com"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_courts" className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Cantidad de Canchas
                  </Label>
                  <Input
                    id="edit_club_courts"
                    name="courts"
                    type="number"
                    min="1"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.courts || ""}
                    placeholder="4"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_instagram" className="flex items-center gap-2">
                    <ExternalLink className="h-4 w-4" />
                    Instagram
                  </Label>
                  <Input
                    id="edit_club_instagram"
                    name="instagram"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.instagram || ""}
                    placeholder="@club_padel"
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_opens_at" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horario de Apertura
                  </Label>
                  <Input
                    id="edit_club_opens_at"
                    name="opens_at"
                    type="time"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.opens_at || ""}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit_club_closes_at" className="flex items-center gap-2">
                    <Clock className="h-4 w-4" />
                    Horario de Cierre
                  </Label>
                  <Input
                    id="edit_club_closes_at"
                    name="closes_at"
                    type="time"
                    disabled={isUpdatingClub}
                    defaultValue={clubToEdit.closes_at || ""}
                    className="border-gray-300 focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 pt-4 border-t">
                <SheetClose asChild>
                  <Button type="button" variant="outline" disabled={isUpdatingClub} className="w-full sm:w-auto">
                    Cancelar
                  </Button>
                </SheetClose>
                <Button type="submit" disabled={isUpdatingClub} className="w-full sm:w-auto">
                  {isUpdatingClub ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Actualizando...
                    </>
                  ) : (
                    "Actualizar Club"
                  )}
                </Button>
              </div>
            </form>
          )}
        </SheetContent>
      </Sheet>

      {/* Image Management Sheet */}
      <Sheet open={isManagingGallery} onOpenChange={setIsManagingGallery}>
        <SheetContent className="w-full sm:w-[540px] sm:max-w-[90vw] overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Gestionar Imágenes del Club</SheetTitle>
            <SheetDescription>
              {selectedClub?.name}
            </SheetDescription>
          </SheetHeader>

          {selectedClub && (
            <div className="space-y-6 mt-6">
              {/* Cover Image Section */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <Camera className="h-5 w-5" />
                  Imagen de Portada
                </Label>
                <div className="border-2 border-dashed border-gray-300 rounded-surface p-4 hover:border-blue-400 transition-colors">
                  {selectedClub.cover_image_url ? (
                    <div className="relative aspect-video rounded-surface overflow-hidden bg-gray-100">
                      <img
                        src={getStorageUrl(selectedClub.cover_image_url) || selectedClub.cover_image_url}
                        alt="Cover"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setUploadType("cover")
                            coverInputRef.current?.click()
                          }}
                          disabled={isUploadingImage}
                        >
                          <Upload className="h-4 w-4 mr-2" />
                          Cambiar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setUploadType("cover")
                        coverInputRef.current?.click()
                      }}
                      disabled={isUploadingImage}
                      className="w-full aspect-video flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-blue-600 transition-colors disabled:opacity-50"
                    >
                      <Upload className="h-8 w-8" />
                      <span className="text-sm font-medium">Subir Imagen de Portada</span>
                      <span className="text-xs text-gray-400">Recomendado: 1200x400px</span>
                    </button>
                  )}
                  <input
                    ref={coverInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !selectedClub) return

                      try {
                        setIsUploadingImage(true)
                        const formData = new FormData()
                        formData.append('file', file)
                        const result = await uploadClubCoverActionForOrganizer(selectedClub.id, formData)

                        if (result.success) {
                          toast({
                            title: "Imagen de portada subida",
                            description: result.message,
                            variant: "default",
                          })
                          onRefresh()
                          setIsManagingGallery(false)
                        } else {
                          toast({
                            title: "Error",
                            description: result.message,
                            variant: "destructive",
                          })
                        }
                      } catch (error) {
                        toast({
                          title: "Error",
                          description: "Error al subir la imagen",
                          variant: "destructive",
                        })
                      } finally {
                        setIsUploadingImage(false)
                        if (coverInputRef.current) coverInputRef.current.value = ""
                      }
                    }}
                  />
                </div>
              </div>

              {/* Gallery Images Section */}
              <div className="space-y-3">
                <Label className="text-base font-semibold flex items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  Galería de Imágenes
                </Label>

                {/* Gallery Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 md:gap-3">
                  {(selectedClub.gallery_images || []).map((imageUrl: string, index: number) => (
                    <div key={index} className="relative aspect-square rounded-surface overflow-hidden bg-gray-100 group">
                      <img
                        src={getStorageUrl(imageUrl) || imageUrl}
                        alt={`Gallery ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={async () => {
                            try {
                              setIsUploadingImage(true)
                              const result = await removeClubGalleryActionForOrganizer(selectedClub.id, imageUrl)

                              if (result.success) {
                                toast({
                                  title: "Imagen eliminada",
                                  description: result.message,
                                  variant: "default",
                                })
                                onRefresh()
                                setIsManagingGallery(false)
                              } else {
                                toast({
                                  title: "Error",
                                  description: result.message,
                                  variant: "destructive",
                                })
                              }
                            } catch (error) {
                              toast({
                                title: "Error",
                                description: "Error al eliminar la imagen",
                                variant: "destructive",
                              })
                            } finally {
                              setIsUploadingImage(false)
                            }
                          }}
                          disabled={isUploadingImage}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}

                  {/* Add Gallery Image Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setUploadType("gallery")
                      galleryInputRef.current?.click()
                    }}
                    disabled={isUploadingImage}
                    className="aspect-square border-2 border-dashed border-gray-300 rounded-surface flex flex-col items-center justify-center gap-2 text-gray-500 hover:text-blue-600 hover:border-blue-400 transition-colors disabled:opacity-50"
                  >
                    <Plus className="h-6 w-6" />
                    <span className="text-xs font-medium">Agregar Imagen</span>
                  </button>
                </div>

                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !selectedClub) return

                    try {
                      setIsUploadingImage(true)
                      const formData = new FormData()
                      formData.append('file', file)
                      const result = await uploadClubGalleryActionForOrganizer(selectedClub.id, formData)

                      if (result.success) {
                        toast({
                          title: "Imagen agregada a la galería",
                          description: result.message,
                          variant: "default",
                        })
                        onRefresh()
                        setIsManagingGallery(false)
                      } else {
                        toast({
                          title: "Error",
                          description: result.message,
                          variant: "destructive",
                        })
                      }
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Error al subir la imagen",
                        variant: "destructive",
                      })
                    } finally {
                      setIsUploadingImage(false)
                      if (galleryInputRef.current) galleryInputRef.current.value = ""
                    }
                  }}
                />
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}