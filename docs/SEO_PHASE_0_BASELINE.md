# SEO: fase 0 — línea base y matriz de regresión

Fecha del relevamiento técnico: 2026-09-01. Este documento no contiene credenciales ni datos personales. Registra el estado antes de modificar infraestructura SEO.

## Cómo repetir el relevamiento público

```powershell
npm run seo:baseline
```

Para un entorno de preview, se puede reemplazar temporalmente el dominio sin cambiar el código:

```powershell
$env:SEO_BASELINE_FV_URL = "https://preview-fv.example.com"
$env:SEO_BASELINE_ELITE_URL = "https://preview-tpe.example.com"
npm run seo:baseline
```

El comando releva el HTML de inicio, listado y dos torneos públicos por tenant, además de `sitemap.xml` y `robots.txt`. Es un registro, no un criterio de éxito: un fallo ya presente debe anotarse como previo.

## Línea base técnica

| Tenant | URL | HTTP | title | description | canonical | robots |
| --- | --- | --- | --- | --- | --- | --- |
| FV | `/` | 200 | `Padel FV` | Descripción global de Padel FV | Ausente | Ausente |
| FV | `/torneos` | 200 | `Padel FV` | Descripción global de Padel FV | Ausente | Ausente |
| FV | `/torneos/lasaigues-caballito-almagro-agosto-c4` | 200 | `Padel FV` | Descripción global de Padel FV | Relativa: misma URL pública | Ausente |
| FV | `/torneos/lasaigues-canning-c5` | 200 | `Padel FV` | Descripción global de Padel FV | Relativa: misma URL pública | Ausente |
| TPE | `/` | 200 | `PadelElite` | Descripción global de TPE | Ausente | Ausente |
| TPE | `/torneos` | 200 | `PadelElite` | Descripción global de TPE | Ausente | Ausente |
| TPE | `/torneos/americano-c6-nova-padel-center-02-septiembre` | 200 | `PadelElite` | Descripción global de TPE | Relativa: misma URL pública | Ausente |
| TPE | `/torneos/americano-c8-punto-de-oro-club-27-agosto` | 200 | `PadelElite` | Descripción global de TPE | Relativa: misma URL pública | Ausente |

Los dominios relevados fueron `https://www.padelfv.com` y `https://www.tpepadel.com`.

| Tenant | Recurso | Estado inicial | Observación |
| --- | --- | --- | --- |
| FV | `/sitemap.xml` | 200, 0 URLs | Sitemap XML válido pero vacío. |
| FV | `/robots.txt` | 404 | Recurso ausente. |
| TPE | `/sitemap.xml` | 200, 0 URLs | Sitemap XML válido pero vacío. |
| TPE | `/robots.txt` | 404 | Recurso ausente. |

| Tenant | Redirección comprobada | Estado inicial | Observación |
| --- | --- | --- | --- |
| FV | `https://padelfv.com/torneos` → `https://www.padelfv.com/torneos` | 307 | Conserva la ruta, pero es temporal; migrar a redirección permanente en la fase 1. |
| TPE | `https://tpepadel.com/torneos` → `https://www.tpepadel.com/torneos` | 307 | Conserva la ruta, pero es temporal; migrar a redirección permanente en la fase 1. |

## Rutas inglesas detectadas

No se afirma que estén indexadas: son rutas que la navegación o el código actual aún exponen y que deben preservarse hasta migrarlas en la fase 2.

| Tenant | Rutas detectadas |
| --- | --- |
| FV | `/tournaments/past`; `/tournaments/[id]` y sus subrutas operativas |
| TPE | `/tournaments/in-progress`; `/tournaments/past`; `/tournaments/[id]` y sus subrutas operativas |

## Casos reales para la matriz funcional

Los estados se verificaron en la respuesta pública al momento del relevamiento. La disponibilidad cambia con la operación; si un torneo deja de ser representativo, reemplazar únicamente el slug y registrar la fecha del cambio.

| Tenant | Caso | URL/slug | Estado observado |
| --- | --- | --- | --- |
| FV | En curso + inscripción pública | `lasaigues-caballito-almagro-agosto-c4` | `ZONE_PHASE`; inscripción pública visible y habilitada |
| FV | Inscripción no pública | `lasaigues-caballito-almagro-agosto-c7` | `ZONE_PHASE`; inscripción pública no visible ni habilitada |
| FV | Finalizado | `lasaigues-canning-c5` | `FINISHED_POINTS_PENDING` |
| FV | Próximo | Pendiente | No había un candidato inequívoco entre los torneos activos relevados; elegir uno antes de la validación con login. |
| TPE | Próximo | `americano-c6-nova-padel-center-02-septiembre` | `NOT_STARTED` |
| TPE | En curso | `americano-c6-7-nova-padel-center-19-junio` | `ZONE_PHASE` |
| TPE | Finalizado | `americano-c8-punto-de-oro-club-27-agosto` | `FINISHED_POINTS_PENDING` |
| TPE | Inscripción no pública | `americano-c6-nova-padel-center-02-septiembre` | Inscripción pública no visible ni habilitada |
| TPE | Inscripción pública | Pendiente | Los casos relevados no exponen simultáneamente inscripción pública visible y habilitada. |

No se registran cuentas de prueba en el repositorio. Se requiere un jugador y un organizador por tenant, provistos por un canal seguro, para completar los pasos autenticados.

## Matriz de smoke tests

Ejecutar antes y después de cada fase, en FV y TPE. Marcar `Previo` si falla antes de cambiar código y adjuntar URL, hora y resultado observado.

| Área | Rol | Comprobación | FV | TPE |
| --- | --- | --- | --- | --- |
| Público | Invitado | Abre `/`, `/torneos` y los dos detalles elegidos; responde 200 y no mezcla marca ni datos del otro tenant. | Pendiente manual | Pendiente manual |
| Público | Invitado | Las tarjetas públicas con slug navegan a `/torneos/[slug]`. | Pendiente manual | Pendiente manual |
| Inscripción | Jugador de prueba | Inicia sesión, abre el caso con inscripción pública y completa el acceso al flujo sin confirmar una inscripción nueva. | Requiere cuenta/caso próximo | Requiere cuenta/caso público |
| Organizador | Organizador de prueba | Inicia sesión, abre el panel y navega datos, inscripciones, zonas, partidos, bracket y resultados del torneo elegido. | Requiere cuenta | Requiere cuenta |
| Torneo | Invitado o jugador | En un torneo en curso y uno finalizado, consulta resultados, partidos y bracket sin errores de navegación. | Pendiente manual | Pendiente manual |
| Aislamiento | Invitado | Repite el comando de línea base; cada dominio conserva solamente su marca, sus URLs y sus datos. | Pendiente | Pendiente |

## Search Console

Pendiente de acceso externo para ambos dominios. Registrar por tenant, en los últimos 28 días: páginas indexadas/excluidas, sitemap enviado, impresiones, clics y consultas. Esta métrica no se puede obtener desde el repositorio ni debe suplirse con estimaciones.
