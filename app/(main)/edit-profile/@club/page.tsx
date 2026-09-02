"use client"

import { useState, useEffect, useActionState, useCallback, startTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"
import { ClubProfileSidebar } from "@/components/profile/club/club-profile-sidebar"
import { ClubLegalDataSection } from "@/components/profile/club/club-legal-data-section"
import { ClubServicesSection, type Service } from "@/components/profile/club/club-services-section"
import { ClubGallerySection } from "@/components/profile/club/club-gallery-section"
import { ClubSecuritySection } from "@/components/profile/club/club-security-section"
import { getClubProfile, completeClubProfile, type ClubFormState } from "@/app/(main)/edit-profile/actions"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building, ListChecks, ImageIcon, Shield } from "lucide-react"

// Define a type for the club profile data we expect
interface ClubProfileData {
  id?: string // club's own id from 'clubes' table
  user_id?: string // user id from auth
  email?: string // from 'users' table
  role?: string // from 'users' table
  avatar_url?: string | null // from 'users' table
  name?: string | null // from 'clubes' table
  address?: string | null // from 'clubes' table
  instagram?: string | null // from 'clubes' table
  cover_image_url?: string | null // from 'clubes' table
  gallery_images?: string[] // from 'clubes' table
}

const initialClubFormState: ClubFormState = {
  message: "",
  errors: null,
  success: false,
  clubProfile: {},
  allServices: [],
  clubServices: [],
}

export default function EditClubProfilePage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<string>("legal")
  const [clubProfileData, setClubProfileData] = useState<ClubProfileData | null>(null)
  const [allServices, setAllServices] = useState<Service[]>([])
  const [clubSelectedServices, setClubSelectedServices] = useState<string[]>([])
  const [isFetchingData, setIsFetchingData] = useState(true)
  const { toast } = useToast()

  const [formState, formAction, isPending] = useActionState<ClubFormState, FormData>(
    completeClubProfile,
    initialClubFormState,
  )

  // Memoize fetchData
  const fetchData = useCallback(async () => {
    setIsFetchingData(true)
    try {
      const result = await getClubProfile()
      if (result.success && result.clubProfile) {
        setClubProfileData(result.clubProfile as ClubProfileData)
        setAllServices(result.allServices || [])
        setClubSelectedServices(result.clubServices || [])
      } else {
        toast({
          title: "Error al cargar el perfil del Club",
          description: result.message || "No se pudieron obtener los datos del club.",
          variant: "destructive",
        })
        setClubProfileData({})
      }
    } catch (error) {
      console.error("Error fetching club profile data:", error)
      toast({
        title: "Error Crítico",
        description: "Ocurrió un error inesperado al cargar los datos del club.",
        variant: "destructive",
      })
      setClubProfileData({})
    } finally {
      setIsFetchingData(false)
    }
  }, [toast])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (formState?.message && formState.message !== "") {
      toast({
        title: formState.success ? "¡Éxito!" : "Error",
        description: formState.message,
        variant: formState.success ? "default" : "destructive",
      })
      if (formState.success) {
        router.push('/panel')
        fetchData()
      }
    }
  }, [formState, toast, router, fetchData])

  const renderActiveSection = () => {
    if (isFetchingData || !clubProfileData) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-200"></div>
            <div className="h-5 w-48 bg-blue-100 rounded"></div>
          </div>
        </div>
      )
    }

    const defaultsForLegalSection = {
      name: clubProfileData.name,
      address: clubProfileData.address,
      email: clubProfileData.email,
      instagram: clubProfileData.instagram,
      avatar_url: clubProfileData.avatar_url,
    }

    const defaultsForGallerySection = {
      coverImage: clubProfileData.cover_image_url,
      galleryImages: clubProfileData.gallery_images || [],
    }

    return (
      <>
        <div style={{ display: activeSection === "legal" ? "block" : "none" }}>
          <ClubLegalDataSection defaultValues={defaultsForLegalSection} />
        </div>
        <div style={{ display: activeSection === "services" ? "block" : "none" }}>
          <ClubServicesSection allServices={allServices} clubServices={clubSelectedServices} />
        </div>
        <div style={{ display: activeSection === "gallery" ? "block" : "none" }}>
          <ClubGallerySection defaultValues={defaultsForGallerySection} />
        </div>
        <div style={{ display: activeSection === "security" ? "block" : "none" }}>
          <ClubSecuritySection userEmail={clubProfileData.email} />
        </div>
      </>
    )
  }

  const getSectionInfo = () => {
    switch (activeSection) {
      case "legal":
        return {
          title: "Información del Club",
          description: "Actualiza la información legal, de contacto y general de tu club.",
          badge: "Datos Legales y Contacto",
        }
      case "services":
        return {
          title: "Gestión de Servicios",
          description: "Selecciona y gestiona los servicios que tu club ofrece a los usuarios.",
          badge: "Servicios Ofrecidos",
        }
      case "gallery":
        return {
          title: "Gestión de Imágenes",
          description: "Administra la imagen de portada y galería de fotos de tu club.",
          badge: "Galería de Imágenes",
        }
      case "security":
        return {
          title: "Configuración de Seguridad",
          description: "Administra la seguridad de la cuenta de tu club.",
          badge: "Seguridad de la Cuenta",
        }
      default:
        return {
          title: "Perfil del Club",
          description: "Gestiona el perfil de tu club",
          badge: "Perfil",
        }
    }
  }

  const sectionInfo = getSectionInfo()

  return (
    <div className="max-w-6xl mx-auto">
      <Card className="bg-white border border-gray-200 shadow-sm overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden p-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Building className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Perfil del Club</h1>
              <p className="text-xs text-gray-600">Configuración del club</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-8rem)]">
          {/* Desktop Sidebar - Hidden on mobile */}
          <div className="hidden lg:block lg:w-64 lg:border-r border-gray-200 bg-gray-50">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Perfil del Club</h1>
                  <p className="text-sm text-gray-600">Configuración del club</p>
                </div>
              </div>

              <ClubProfileSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            {/* Mobile Tabs */}
            <div className="lg:hidden">
              <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
                <TabsList className="w-full grid grid-cols-4 h-auto p-1 bg-gray-100 rounded-none border-b border-gray-200">
                  <TabsTrigger
                    value="legal"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <Building className="h-4 w-4" />
                    <span className="text-xs font-medium">Legal</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="services"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <ListChecks className="h-4 w-4" />
                    <span className="text-xs font-medium">Servicios</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="gallery"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <ImageIcon className="h-4 w-4" />
                    <span className="text-xs font-medium">Galería</span>
                  </TabsTrigger>
                  <TabsTrigger
                    value="security"
                    className="flex flex-col items-center gap-1 py-3 data-[state=active]:bg-white data-[state=active]:text-blue-600"
                  >
                    <Shield className="h-4 w-4" />
                    <span className="text-xs font-medium">Seguridad</span>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="legal" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Datos Legales y Contacto</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Información del Club</h2>
                    <p className="text-sm text-gray-600">Actualiza la información legal, de contacto y general de tu club</p>
                  </div>
                  {isFetchingData || !clubProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <form action={formAction} className="space-y-6">
                      {clubProfileData?.role && <input type="hidden" name="role" defaultValue={clubProfileData.role} />}
                      <ClubLegalDataSection defaultValues={{
                        name: clubProfileData.name,
                        address: clubProfileData.address,
                        email: clubProfileData.email,
                        instagram: clubProfileData.instagram,
                        avatar_url: clubProfileData.avatar_url,
                      }} />
                      <div className="sticky bottom-0 pt-4 pb-4 bg-gradient-to-t from-white via-white to-transparent">
                        <Button
                          type="submit"
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                          disabled={isPending || isFetchingData}
                        >
                          {isPending ? "Actualizando..." : "Guardar Cambios"}
                        </Button>
                      </div>
                    </form>
                  )}
                </TabsContent>

                <TabsContent value="services" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Servicios Ofrecidos</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Gestión de Servicios</h2>
                    <p className="text-sm text-gray-600">Selecciona y gestiona los servicios que tu club ofrece a los usuarios</p>
                  </div>
                  {isFetchingData || !clubProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <form action={formAction} className="space-y-6">
                      {clubProfileData?.role && <input type="hidden" name="role" defaultValue={clubProfileData.role} />}
                      <ClubServicesSection allServices={allServices} clubServices={clubSelectedServices} />
                      <div className="sticky bottom-0 pt-4 pb-4 bg-gradient-to-t from-white via-white to-transparent">
                        <Button
                          type="submit"
                          className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                          disabled={isPending || isFetchingData}
                        >
                          {isPending ? "Actualizando..." : "Guardar Cambios"}
                        </Button>
                      </div>
                    </form>
                  )}
                </TabsContent>

                <TabsContent value="gallery" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Galería de Imágenes</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Gestión de Imágenes</h2>
                    <p className="text-sm text-gray-600">Administra la imagen de portada y galería de fotos de tu club</p>
                  </div>
                  {isFetchingData || !clubProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <ClubGallerySection defaultValues={{
                      coverImage: clubProfileData.cover_image_url,
                      galleryImages: clubProfileData.gallery_images || [],
                    }} />
                  )}
                </TabsContent>

                <TabsContent value="security" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Seguridad de la Cuenta</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Configuración de Seguridad</h2>
                    <p className="text-sm text-gray-600">Administra la seguridad de la cuenta de tu club</p>
                  </div>
                  {isFetchingData || !clubProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <ClubSecuritySection userEmail={clubProfileData.email} />
                  )}
                </TabsContent>
              </Tabs>
            </div>

            {/* Desktop View */}
            <div className="hidden lg:block p-6 lg:p-8">
              <div className="mb-8">
                <Badge className="mb-3 px-3 py-1 bg-blue-100 text-blue-800 border-0">{sectionInfo.badge}</Badge>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{sectionInfo.title}</h2>
                <p className="text-gray-600 max-w-2xl">{sectionInfo.description}</p>
              </div>

              {activeSection !== "gallery" && activeSection !== "security" ? (
                <form action={formAction} className="max-w-3xl space-y-6">
                  {clubProfileData?.role && <input type="hidden" name="role" defaultValue={clubProfileData.role} />}
                  <div className="bg-white rounded-surface border border-gray-200 p-6">{renderActiveSection()}</div>

                  <div className="sticky bottom-0 pt-6 pb-4 -mx-4 px-4 bg-gradient-to-t from-white via-white to-transparent">
                    <Button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                      disabled={isPending || isFetchingData}
                    >
                      {isPending ? "Actualizando Club..." : "Guardar Cambios del Club"}
                    </Button>
                  </div>
                </form>
              ) : (
                <div className="max-w-3xl space-y-6">
                  <div className="bg-white rounded-surface border border-gray-200 p-6">{renderActiveSection()}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Toaster />
    </div>
  )
}
