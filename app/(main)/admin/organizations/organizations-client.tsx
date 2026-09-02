"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Shield, ChevronDown, ChevronRight, Edit, Power } from "lucide-react"
import { AdminEditModal } from "@/components/admin/AdminEditModal"
import { ConfirmDialog } from "@/components/admin/ConfirmDialog"
import { EditOrganizationForm } from "@/components/admin/EditOrganizationForm"
import { OrganizationMembersTable } from "@/components/admin/OrganizationMembersTable"
import { OrganizationClubsTable } from "@/components/admin/OrganizationClubsTable"
import { useToast } from "@/components/ui/use-toast"
import {
  updateOrganization,
  toggleOrganizationActive,
  getOrganizationMembers,
  getOrganizationClubs
} from "@/app/api/admin/organizations/actions"

interface Organization {
  id: string
  name: string
  email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
  responsible_first_name: string | null
  responsible_last_name: string | null
  responsible_dni: string | null
  description: string | null
}

interface Member {
  id: string
  user_id: string
  member_role: string
  is_active: boolean
  users: {
    id: string
    email: string
    role: string
  }
}

interface Club {
  id: string
  created_at: string
  club_id: string
  clubes: {
    id: string
    name: string
    email: string | null
    is_active: boolean
  } | null
}

export const OrganizationsClient = ({
  organizations: initialOrganizations
}: {
  organizations: Organization[]
}) => {
  const { toast } = useToast()
  const [organizations] = useState(initialOrganizations)
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Record<string, "members" | "clubs">>({})
  const [members, setMembers] = useState<Record<string, Member[]>>({})
  const [clubs, setClubs] = useState<Record<string, Club[]>>({})
  const [loadingMembers, setLoadingMembers] = useState<string | null>(null)
  const [loadingClubs, setLoadingClubs] = useState<string | null>(null)
  const [editingOrg, setEditingOrg] = useState<Organization | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<Organization>>({})
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    orgId: string
    orgName: string
  }>({ isOpen: false, orgId: "", orgName: "" })
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const handleExpandOrg = async (orgId: string) => {
    if (expandedOrg === orgId) {
      setExpandedOrg(null)
      return
    }

    setExpandedOrg(orgId)

    // Set default tab to members if not set
    if (!activeTab[orgId]) {
      setActiveTab((prev) => ({ ...prev, [orgId]: "members" }))
    }

    // Cargar miembros si no están cargados
    if (!members[orgId]) {
      setLoadingMembers(orgId)
      try {
        const result = await getOrganizationMembers(orgId)
        if (result.data) {
          setMembers((prev) => ({ ...prev, [orgId]: result.data }))
        } else {
          toast({
            title: "Error",
            description: result.error || "Error al cargar miembros",
            variant: "destructive"
          })
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Error al cargar miembros",
          variant: "destructive"
        })
      } finally {
        setLoadingMembers(null)
      }
    }
  }

  const handleTabChange = async (orgId: string, tab: "members" | "clubs") => {
    setActiveTab((prev) => ({ ...prev, [orgId]: tab }))

    // Cargar clubes si se selecciona esa tab y no están cargados
    if (tab === "clubs" && !clubs[orgId]) {
      setLoadingClubs(orgId)
      try {
        const result = await getOrganizationClubs(orgId)
        if (result.data) {
          setClubs((prev) => ({ ...prev, [orgId]: result.data }))
        } else {
          toast({
            title: "Error",
            description: result.error || "Error al cargar clubes",
            variant: "destructive"
          })
        }
      } catch (error) {
        toast({
          title: "Error",
          description: "Error al cargar clubes",
          variant: "destructive"
        })
      } finally {
        setLoadingClubs(null)
      }
    }
  }

  const handleEditOrg = (org: Organization) => {
    setEditingOrg(org)
    setEditFormData({})
  }

  const handleSaveOrg = async () => {
    if (!editingOrg) return

    try {
      const result = await updateOrganization(editingOrg.id, editFormData)
      if (result.success) {
        toast({
          title: "Éxito",
          description: "Organización actualizada correctamente"
        })
        setEditingOrg(null)
        // Recargar página
        window.location.reload()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al guardar cambios",
        variant: "destructive"
      })
    }
  }

  const handleToggleActive = async (orgId: string) => {
    setLoadingAction(orgId)
    try {
      const result = await toggleOrganizationActive(orgId)
      if (result.success) {
        toast({
          title: "Éxito",
          description: `Organización ${result.newState ? "activada" : "desactivada"} correctamente`
        })
        // Recargar página
        window.location.reload()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Error al cambiar estado",
        variant: "destructive"
      })
    } finally {
      setLoadingAction(null)
      setConfirmDialog({ isOpen: false, orgId: "", orgName: "" })
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
            <Shield className="h-8 w-8" />
            Organizadores
          </h1>
          <p className="text-slate-600 mt-2">
            Gestión de organizaciones y sus miembros
          </p>
        </div>
        <Badge variant="outline" className="text-lg px-4 py-2">
          {organizations.length} organizaciones
        </Badge>
      </div>

      {/* Desktop Table View */}
      <Card className="hidden md:block">
        <CardHeader>
          <CardTitle>Listado de Organizaciones</CardTitle>
          <CardDescription>
            Click en una organización para ver sus usuarios y clubes asociados
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {organizations.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                No hay organizaciones registradas
              </div>
            ) : (
              organizations.map((org) => (
                <div
                  key={org.id}
                  className="border rounded-surface overflow-hidden"
                >
                  {/* Organization Row */}
                  <div className="flex items-center gap-3 p-4 bg-white hover:bg-slate-50">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleExpandOrg(org.id)}
                      className="p-1"
                    >
                      {expandedOrg === org.id ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </Button>

                    <div className="flex-1 grid grid-cols-5 gap-4 items-center">
                      <div className="font-medium">{org.name}</div>
                      <div className="text-sm">
                        {org.responsible_first_name && org.responsible_last_name
                          ? `${org.responsible_first_name} ${org.responsible_last_name}`
                          : "-"}
                      </div>
                      <div className="text-sm">{org.email || "-"}</div>
                      <div className="text-sm">{org.phone || "-"}</div>
                      <div>
                        {org.is_active ? (
                          <Badge className="bg-green-100 text-green-800">Activo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-slate-500">
                            Inactivo
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditOrg(org)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirmDialog({
                            isOpen: true,
                            orgId: org.id,
                            orgName: org.name
                          })
                        }
                        disabled={loadingAction === org.id}
                      >
                        <Power className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {/* Expanded Section with Tabs */}
                  {expandedOrg === org.id && (
                    <div className="border-t bg-slate-50 p-4">
                      {/* Tabs */}
                      <div className="flex gap-2 mb-4 border-b">
                        <button
                          onClick={() => handleTabChange(org.id, "members")}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            (activeTab[org.id] || "members") === "members"
                              ? "border-red-500 text-red-600"
                              : "border-transparent text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Usuarios ({members[org.id]?.length || 0})
                        </button>
                        <button
                          onClick={() => handleTabChange(org.id, "clubs")}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                            activeTab[org.id] === "clubs"
                              ? "border-red-500 text-red-600"
                              : "border-transparent text-slate-600 hover:text-slate-900"
                          }`}
                        >
                          Clubes ({clubs[org.id]?.length || 0})
                        </button>
                      </div>

                      {/* Tab Content */}
                      {(activeTab[org.id] || "members") === "members" ? (
                        <>
                          {loadingMembers === org.id ? (
                            <div className="text-center py-4 text-slate-500">
                              Cargando miembros...
                            </div>
                          ) : members[org.id] ? (
                            <OrganizationMembersTable
                              members={members[org.id]}
                              organizacionId={org.id}
                            />
                          ) : (
                            <div className="text-center py-4 text-slate-500">
                              No se pudieron cargar los miembros
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {loadingClubs === org.id ? (
                            <div className="text-center py-4 text-slate-500">
                              Cargando clubes...
                            </div>
                          ) : clubs[org.id] ? (
                            <OrganizationClubsTable clubs={clubs[org.id]} />
                          ) : (
                            <div className="text-center py-4 text-slate-500">
                              No se pudieron cargar los clubes
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Mobile Cards View */}
      <div className="md:hidden space-y-4">
        {organizations.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-slate-500">
              No hay organizaciones registradas
            </CardContent>
          </Card>
        ) : (
          organizations.map((org) => (
            <Card key={org.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <CardTitle className="text-base">{org.name}</CardTitle>
                    <CardDescription className="mt-1">
                      {org.responsible_first_name && org.responsible_last_name
                        ? `${org.responsible_first_name} ${org.responsible_last_name}`
                        : "Sin responsable"}
                    </CardDescription>
                  </div>
                  {org.is_active ? (
                    <Badge className="bg-green-100 text-green-800">Activo</Badge>
                  ) : (
                    <Badge variant="outline" className="text-slate-500">Inactivo</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">Email:</span>
                  <span className="text-right break-all">{org.email || "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Teléfono:</span>
                  <span>{org.phone || "-"}</span>
                </div>
                {org.responsible_dni && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">DNI Responsable:</span>
                    <span className="font-mono text-xs">{org.responsible_dni}</span>
                  </div>
                )}
                <div className="flex gap-2 pt-2 border-t">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() => handleEditOrg(org)}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1"
                    onClick={() =>
                      setConfirmDialog({
                        isOpen: true,
                        orgId: org.id,
                        orgName: org.name
                      })
                    }
                  >
                    <Power className="h-4 w-4 mr-2" />
                    Estado
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full"
                  onClick={() => handleExpandOrg(org.id)}
                >
                  {expandedOrg === org.id ? (
                    <>
                      <ChevronDown className="h-4 w-4 mr-2" />
                      Ocultar detalles
                    </>
                  ) : (
                    <>
                      <ChevronRight className="h-4 w-4 mr-2" />
                      Ver miembros y clubes
                    </>
                  )}
                </Button>
                {/* Expanded Section */}
                {expandedOrg === org.id && (
                  <div className="mt-3 border-t pt-3 space-y-3">
                    {/* Tabs */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTabChange(org.id, "members")}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-surface transition-colors ${
                          (activeTab[org.id] || "members") === "members"
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        Usuarios ({members[org.id]?.length || 0})
                      </button>
                      <button
                        onClick={() => handleTabChange(org.id, "clubs")}
                        className={`flex-1 px-3 py-2 text-xs font-medium rounded-surface transition-colors ${
                          activeTab[org.id] === "clubs"
                            ? "bg-red-100 text-red-700"
                            : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        Clubes ({clubs[org.id]?.length || 0})
                      </button>
                    </div>
                    {/* Tab Content */}
                    <div className="bg-slate-50 rounded-surface p-3">
                      {(activeTab[org.id] || "members") === "members" ? (
                        <>
                          {loadingMembers === org.id ? (
                            <div className="text-center py-4 text-slate-500 text-xs">
                              Cargando miembros...
                            </div>
                          ) : members[org.id] && members[org.id].length > 0 ? (
                            <div className="space-y-2">
                              {members[org.id].map((member) => (
                                <div key={member.id} className="bg-white p-2 rounded text-xs">
                                  <div className="font-medium">{member.users.email}</div>
                                  <div className="text-slate-500">{member.member_role}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-slate-500 text-xs">
                              No hay miembros
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          {loadingClubs === org.id ? (
                            <div className="text-center py-4 text-slate-500 text-xs">
                              Cargando clubes...
                            </div>
                          ) : clubs[org.id] && clubs[org.id].length > 0 ? (
                            <div className="space-y-2">
                              {clubs[org.id].map((club) => (
                                <div key={club.id} className="bg-white p-2 rounded text-xs">
                                  <div className="font-medium">{club.clubes?.name || "Sin nombre"}</div>
                                  <div className="text-slate-500">{club.clubes?.email || "-"}</div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-slate-500 text-xs">
                              No hay clubes
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Edit Modal */}
      {editingOrg && (
        <AdminEditModal
          isOpen={!!editingOrg}
          onClose={() => setEditingOrg(null)}
          title={`Editar ${editingOrg.name}`}
          onSave={handleSaveOrg}
        >
          <EditOrganizationForm
            organization={editingOrg}
            onDataChange={setEditFormData}
          />
        </AdminEditModal>
      )}

      {/* Confirm Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ isOpen: false, orgId: "", orgName: "" })}
        onConfirm={() => handleToggleActive(confirmDialog.orgId)}
        title="Confirmar cambio de estado"
        description={`¿Estás seguro de cambiar el estado de "${confirmDialog.orgName}"?`}
      />
    </div>
  )
}
