"use client"

import { useState, useEffect, useActionState, useCallback, startTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Toaster } from "@/components/ui/toaster"
import { useToast } from "@/components/ui/use-toast"
import { OrganizadorProfileSidebar } from "@/components/profile/organizador/organizador-profile-sidebar"
import { OrganizationDataSection } from "@/components/profile/organizador/organization-data-section"
import { OrganizationClubsSection } from "@/components/profile/organizador/organization-clubs-section"
import { OrganizationMembersSection } from "@/components/profile/organizador/organization-members-section"
import { OrganizationGallerySection } from "@/components/profile/organizador/organization-gallery-section"
import { getOrganizadorProfile, completeOrganizadorProfile, setFeaturedClub, type OrganizadorFormState } from "@/app/(main)/edit-profile/organizador-actions"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Building2, Users, ImageIcon } from "lucide-react"

interface OrganizadorProfileData {
  id?: string
  user_id?: string
  email?: string
  role?: string
  avatar_url?: string | null
  name?: string | null
  description?: string | null
  phone?: string | null
  responsible_first_name?: string | null
  responsible_last_name?: string | null
  responsible_dni?: string | null
  responsible_position?: string | null
  logo_url?: string | null
  cover_image_url?: string | null
  gallery_images?: string[]
  featured_club_id?: string | null
}

const initialOrganizadorFormState: OrganizadorFormState = {
  message: "",
  errors: null,
  success: false,
  organizadorProfile: {},
  organizationClubs: [],
  allClubs: [],
}

export default function EditOrganizadorProfilePage() {
  const router = useRouter()
  const [activeSection, setActiveSection] = useState<string>("organization")
  const [organizadorProfileData, setOrganizadorProfileData] = useState<OrganizadorProfileData | null>(null)
  const [organizationClubs, setOrganizationClubs] = useState<any[]>([])
  const [allClubs, setAllClubs] = useState<any[]>([])
  const [isFetchingData, setIsFetchingData] = useState(true)
  const { toast } = useToast()

  const [formState, formAction, isPending] = useActionState<OrganizadorFormState, FormData>(
    completeOrganizadorProfile,
    initialOrganizadorFormState,
  )

  const fetchData = useCallback(async () => {
    setIsFetchingData(true)
    try {
      const result = await getOrganizadorProfile()
      if (result.success && result.organizadorProfile) {
        setOrganizadorProfileData(result.organizadorProfile as OrganizadorProfileData)
        setOrganizationClubs(result.organizationClubs || [])
        setAllClubs(result.allClubs || [])
      } else {
        toast({
          title: "Error al cargar el perfil de la Organización",
          description: result.message || "No se pudieron obtener los datos de la organización.",
          variant: "destructive",
        })
        setOrganizadorProfileData({})
      }
    } catch (error) {
      console.error("Error fetching organizador profile data:", error)
      toast({
        title: "Error Crítico",
        description: "Ocurrió un error inesperado al cargar los datos de la organización.",
        variant: "destructive",
      })
      setOrganizadorProfileData({})
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
    if (isFetchingData || !organizadorProfileData) {
      return (
        <div className="flex items-center justify-center h-64">
          <div className="animate-pulse flex flex-col items-center gap-4">
            <div className="h-12 w-12 rounded-full bg-blue-200"></div>
            <div className="h-5 w-48 bg-blue-100 rounded"></div>
          </div>
        </div>
      )
    }

    const defaultsForOrganizationSection = {
      name: organizadorProfileData.name,
      description: organizadorProfileData.description,
      phone: organizadorProfileData.phone,
      responsible_first_name: organizadorProfileData.responsible_first_name,
      responsible_last_name: organizadorProfileData.responsible_last_name,
      responsible_dni: organizadorProfileData.responsible_dni,
      responsible_position: organizadorProfileData.responsible_position,
      email: organizadorProfileData.email,
    }

    const defaultsForGallerySection = {
      logoImage: organizadorProfileData.logo_url,
      coverImage: organizadorProfileData.cover_image_url,
      galleryImages: organizadorProfileData.gallery_images || [],
    }

    return (
      <>
        <div style={{ display: activeSection === "organization" ? "block" : "none" }}>
          <OrganizationDataSection defaultValues={defaultsForOrganizationSection} />
        </div>
        <div style={{ display: activeSection === "clubs" ? "block" : "none" }}>
          <OrganizationClubsSection
            organizationClubs={organizationClubs}
            allClubs={allClubs}
            featuredClubId={organizadorProfileData.featured_club_id}
            onClubsChange={(clubs) => setOrganizationClubs(clubs)}
            onRefresh={fetchData}
            onSetFeaturedClub={async (clubId) => {
              const result = await setFeaturedClub(clubId)
              if (result.success) {
                toast({
                  title: "Club destacado actualizado",
                  description: result.message,
                  variant: "default",
                })
                // Update local state
                setOrganizadorProfileData(prev => prev ? { ...prev, featured_club_id: clubId } : null)
              } else {
                toast({
                  title: "Error",
                  description: result.message,
                  variant: "destructive",
                })
              }
            }}
          />
        </div>
        <div style={{ display: activeSection === "gallery" ? "block" : "none" }}>
          <OrganizationGallerySection defaultValues={defaultsForGallerySection} />
        </div>
        <div style={{ display: activeSection === "members" ? "block" : "none" }}>
          <OrganizationMembersSection />
        </div>
      </>
    )
  }

  const getSectionInfo = () => {
    switch (activeSection) {
      case "organization":
        return {
          title: "Información de la Organización",
          description: "Actualiza la información general y de contacto de tu organización.",
          badge: "Datos de la Organización",
        }
      case "clubs":
        return {
          title: "Gestión de Clubes",
          description: "Administra los clubes asociados a tu organización.",
          badge: "Clubes Asociados",
        }
      case "gallery":
        return {
          title: "Gestión de Imágenes",
          description: "Administra la imagen de portada y galería de fotos de tu organización.",
          badge: "Galería de Imágenes",
        }
      case "members":
        return {
          title: "Gestión de Miembros",
          description: "Administra los miembros de tu organización.",
          badge: "Miembros de la Organización",
        }
      default:
        return {
          title: "Perfil de la Organización",
          description: "Gestiona el perfil de tu organización",
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
              <Building2 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">Perfil de la Organización</h1>
              <p className="text-xs text-gray-600">Configuración organizacional</p>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row min-h-[calc(100vh-8rem)]">
          {/* Desktop Sidebar - Hidden on mobile */}
          <div className="hidden lg:block lg:w-64 lg:border-r border-gray-200 bg-gray-50">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-lg font-semibold text-gray-900">Perfil de la Organización</h1>
                  <p className="text-sm text-gray-600">Configuración organizacional</p>
                </div>
              </div>

              <OrganizadorProfileSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
            </div>
          </div>

          {/* Main content */}
          <div className="flex-1 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto">
            {/* Mobile Tabs */}
            <div className="lg:hidden">
              <Tabs value={activeSection} onValueChange={setActiveSection} className="w-full">
                <div className="overflow-x-auto">
                  <TabsList className="w-full inline-flex h-auto p-1 bg-gray-100 rounded-none border-b border-gray-200">
                    <TabsTrigger
                      value="organization"
                      className="flex flex-col items-center gap-1 py-3 px-4 data-[state=active]:bg-white data-[state=active]:text-blue-600 whitespace-nowrap"
                    >
                      <Building2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Organización</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="clubs"
                      className="flex flex-col items-center gap-1 py-3 px-4 data-[state=active]:bg-white data-[state=active]:text-blue-600 whitespace-nowrap"
                    >
                      <Building2 className="h-4 w-4" />
                      <span className="text-xs font-medium">Clubes</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="gallery"
                      className="flex flex-col items-center gap-1 py-3 px-4 data-[state=active]:bg-white data-[state=active]:text-blue-600 whitespace-nowrap"
                    >
                      <ImageIcon className="h-4 w-4" />
                      <span className="text-xs font-medium">Galería</span>
                    </TabsTrigger>
                    <TabsTrigger
                      value="members"
                      className="flex flex-col items-center gap-1 py-3 px-4 data-[state=active]:bg-white data-[state=active]:text-blue-600 whitespace-nowrap"
                    >
                      <Users className="h-4 w-4" />
                      <span className="text-xs font-medium">Miembros</span>
                    </TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="organization" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Datos de la Organización</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Información de la Organización</h2>
                    <p className="text-sm text-gray-600">Actualiza la información general y de contacto de tu organización</p>
                  </div>
                  {isFetchingData || !organizadorProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <form action={formAction} className="space-y-6">
                      {organizadorProfileData?.role && <input type="hidden" name="role" defaultValue={organizadorProfileData.role} />}
                      <OrganizationDataSection defaultValues={{
                        name: organizadorProfileData.name,
                        description: organizadorProfileData.description,
                        phone: organizadorProfileData.phone,
                        responsible_first_name: organizadorProfileData.responsible_first_name,
                        responsible_last_name: organizadorProfileData.responsible_last_name,
                        responsible_dni: organizadorProfileData.responsible_dni,
                        responsible_position: organizadorProfileData.responsible_position,
                        email: organizadorProfileData.email,
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

                <TabsContent value="clubs" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Clubes Asociados</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Gestión de Clubes</h2>
                    <p className="text-sm text-gray-600">Administra los clubes asociados a tu organización</p>
                  </div>
                  {isFetchingData || !organizadorProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <OrganizationClubsSection
                      organizationClubs={organizationClubs}
                      allClubs={allClubs}
                      featuredClubId={organizadorProfileData.featured_club_id}
                      onClubsChange={(clubs) => setOrganizationClubs(clubs)}
                      onRefresh={fetchData}
                      onSetFeaturedClub={async (clubId) => {
                        const result = await setFeaturedClub(clubId)
                        if (result.success) {
                          toast({
                            title: "Club destacado actualizado",
                            description: result.message,
                            variant: "default",
                          })
                          setOrganizadorProfileData(prev => prev ? { ...prev, featured_club_id: clubId } : null)
                        } else {
                          toast({
                            title: "Error",
                            description: result.message,
                            variant: "destructive",
                          })
                        }
                      }}
                    />
                  )}
                </TabsContent>

                <TabsContent value="gallery" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Galería de Imágenes</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Gestión de Imágenes</h2>
                    <p className="text-sm text-gray-600">Administra la imagen de portada y galería de fotos de tu organización</p>
                  </div>
                  {isFetchingData || !organizadorProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <OrganizationGallerySection defaultValues={{
                      logoImage: organizadorProfileData.logo_url,
                      coverImage: organizadorProfileData.cover_image_url,
                      galleryImages: organizadorProfileData.gallery_images || [],
                    }} />
                  )}
                </TabsContent>

                <TabsContent value="members" className="p-4 space-y-6 mt-0">
                  <div className="mb-4">
                    <Badge className="mb-2 px-3 py-1 bg-blue-100 text-blue-800 border-0 text-xs">Miembros de la Organización</Badge>
                    <h2 className="text-xl font-bold text-gray-900 mb-1">Gestión de Miembros</h2>
                    <p className="text-sm text-gray-600">Administra los miembros de tu organización</p>
                  </div>
                  {isFetchingData || !organizadorProfileData ? (
                    <div className="flex items-center justify-center h-64">
                      <div className="animate-pulse flex flex-col items-center gap-4">
                        <div className="h-12 w-12 rounded-full bg-blue-200"></div>
                        <div className="h-5 w-48 bg-blue-100 rounded"></div>
                      </div>
                    </div>
                  ) : (
                    <form action={formAction} className="space-y-6">
                      {organizadorProfileData?.role && <input type="hidden" name="role" defaultValue={organizadorProfileData.role} />}
                      <OrganizationMembersSection />
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
              </Tabs>
            </div>

            {/* Desktop View */}
            <div className="hidden lg:block p-6 lg:p-8">
              <div className="mb-8">
                <Badge className="mb-3 px-3 py-1 bg-blue-100 text-blue-800 border-0">{sectionInfo.badge}</Badge>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">{sectionInfo.title}</h2>
                <p className="text-gray-600 max-w-2xl">{sectionInfo.description}</p>
              </div>

              {activeSection !== "clubs" && activeSection !== "gallery" ? (
                <form action={formAction} className="max-w-3xl space-y-6">
                  {organizadorProfileData?.role && <input type="hidden" name="role" defaultValue={organizadorProfileData.role} />}
                  <div className="bg-white rounded-surface border border-gray-200 p-6">{renderActiveSection()}</div>

                  <div className="sticky bottom-0 pt-6 pb-4 -mx-4 px-4 bg-gradient-to-t from-white via-white to-transparent">
                    <Button
                      type="submit"
                      className="w-full bg-slate-900 hover:bg-slate-800 text-white shadow-sm"
                      disabled={isPending || isFetchingData}
                    >
                      {isPending ? "Actualizando Organización..." : "Guardar Cambios de la Organización"}
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
