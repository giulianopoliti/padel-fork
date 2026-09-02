# Plan SEO para Padel FV y TPE Padel

## Objetivo

Mejorar descubrimiento, indexacion y posicionamiento organico de ambos tenants sin modificar la logica de inscripciones, autenticacion, gestion de torneos, partidos, brackets ni resultados.

Dominios canonicos:

- `https://www.padelfv.com`
- `https://www.tpepadel.com`

La implementacion se divide en entregas pequeñas y reversibles. Primero se corrige la infraestructura SEO; despues se mejoran rutas, metadata y contenido.

## Principios de seguridad

- Mantener `/tournaments/[id]` y sus subrutas para la operacion interna.
- Usar `/torneos` y `/torneos/[slug]` como superficie publica.
- No realizar migraciones ni mutaciones remotas de Supabase para las primeras fases.
- Resolver cada tenant mediante su configuracion actual, sin mezclar datos, dominios ni sitemaps.
- Desplegar y verificar FV y TPE por separado.
- Conservar redirects desde URLs antiguas y aliases de slugs.

## Fase 0: linea base y red de seguridad

La Fase 0 significa sacar una foto comprobable del estado actual y definir que funciones no pueden romperse. No mejora el ranking ni cambia produccion.

### 0.1 Registrar el estado SEO actual

Para cada tenant guardar:

- Estado HTTP, title, description, canonical y robots de `/`, `/torneos` y dos torneos publicos.
- Contenido actual de `/sitemap.xml` y `/robots.txt`.
- URLs inglesas que Google o la navegacion todavia pueden encontrar.
- En Search Console: paginas indexadas, paginas excluidas, sitemap enviado, impresiones, clics y consultas de los ultimos 28 dias.

El resultado puede quedar documentado como una tabla dentro del PR de implementacion. Si no hay acceso a Search Console, se completa la parte tecnica y se deja esa medicion como pendiente externa.

### 0.2 Elegir casos reales de prueba

Seleccionar por tenant:

- Un torneo proximo.
- Un torneo en curso.
- Un torneo finalizado.
- Un torneo con inscripcion publica.
- Un torneo con inscripcion cerrada.
- Un usuario jugador y un usuario organizador de prueba.

No se deben copiar datos sensibles al documento; solo IDs o slugs aptos para testing.

### 0.3 Ejecutar smoke tests funcionales

Comprobar antes y despues de cada fase:

- Invitado abre home, listado y detalle publico.
- Jugador inicia sesion, ve un torneo y llega al flujo de inscripcion.
- Organizador entra a su panel, abre un torneo y navega sus secciones.
- Siguen funcionando resultados, partidos y bracket.
- Los links de las tarjetas publicas usan el slug cuando existe.
- FV nunca muestra datos o marca de TPE, y viceversa.

### Criterio de salida

La Fase 0 termina cuando existe una linea base guardada y la misma matriz se puede repetir despues de cada cambio. Si un paso falla antes de comenzar, se registra como problema previo y no se atribuye al trabajo SEO.

## Fase 1: descubrimiento tecnico

1. Reparar `app/sitemap.ts` para que nunca quede vacio por consultar campos inexistentes.
2. Incluir home, `/torneos`, paginas publicas por estado y torneos publicos con slug.
3. Emitir solo URLs absolutas del tenant correcto; excluir borradores y rutas operativas.
4. Crear `robots.ts` con referencia al sitemap y reglas para areas privadas.
5. Configurar `metadataBase` y canonicales absolutas con `www`.
6. Evitar fallos silenciosos del sitemap y cubrir su generacion con tests.

Aceptacion: ambos sitemaps responden `200`, contienen URLs, no mezclan tenants y todas las URLs incluidas responden `200` o un redirect permanente valido.

## Fase 2: rutas publicas consistentes

Rutas objetivo:

| Contenido | Ruta canonica |
| --- | --- |
| Listado | `/torneos` |
| Proximos | `/torneos/proximos` |
| En curso | `/torneos/en-curso` |
| Finalizados | `/torneos/finalizados` |
| Detalle | `/torneos/[slug]` |

Aplicar redirects permanentes:

- `/tournaments` -> `/torneos`
- `/tournaments/upcoming` -> `/torneos/proximos`
- `/tournaments/in-progress` -> `/torneos/en-curso`
- `/tournaments/past` -> `/torneos/finalizados`

Actualizar los links internos y conservar filtros relevantes. No redirigir globalmente `/tournaments/[id]`, porque sostiene navegacion y funciones internas; debe permanecer disponible y declarar como canonical la URL publica con slug cuando corresponda.

## Fase 3: metadata y datos estructurados

- Dar a cada home, listado y estado un title y description propios.
- En cada torneo generar title, description, canonical, Open Graph e imagen desde sus datos reales.
- Agregar JSON-LD `Event` o `SportsEvent` en el detalle: nombre, fechas, organizador, sede, direccion, estado, imagen, precio y disponibilidad cuando existan.
- Validar que los datos estructurados coincidan con el contenido visible.
- Tratar filtros de busqueda como variantes no canonicas salvo que se conviertan en landing pages curadas.

## Fase 4: mejorar las landings

Si, conviene mejorar ambas. Es necesario para competir por consultas genericas; la metadata sola no reemplaza contenido util.

La mejora debe conservar el listado y los CTA actuales, agregando contenido breve y especifico por tenant:

- H1 que incluya torneos de padel y el area real de cobertura.
- Propuesta diferencial de FV y de TPE, sin duplicar textos entre dominios.
- Modalidades y categorias disponibles.
- Sedes o zonas principales con links internos.
- Explicacion corta de como inscribirse y que recibe el jugador.
- Proximos torneos renderizados en servidor.
- Preguntas frecuentes reales y contacto del organizador.
- Links a resultados y torneos finalizados para mostrar actividad historica.

Evitar bloques escritos solo para repetir keywords. La landing debe ayudar a elegir un torneo y demostrar experiencia, ubicacion y actividad real.

## Fase 5: Circuito Padel Amateur

Mantener CPA como canal de publicidad y derivacion:

- Pagina de organizacion FV -> home o listado de Padel FV.
- Pagina de organizacion TPE -> home o listado de TPE Padel.
- Torneo de FV/TPE en CPA -> detalle equivalente `/torneos/[slug]` cuando exista.
- Usar redirect permanente si CPA deja de servir definitivamente esa pagina.
- Usar enlaces visibles con UTM si CPA conserva una landing propia con contenido diferente.
- No redirigir contenido de otros organizadores.

El destino con UTM debe declarar como canonical la URL limpia. Esto permite medir referidos sin crear duplicados indexables.

## Fase 6: despliegue y medicion

1. Ejecutar tests, build y la matriz de Fase 0.
2. Verificar previews separadas de FV y TPE.
3. Desplegar primero infraestructura SEO y rutas.
4. Repetir smoke tests en produccion.
5. Desplegar metadata, datos estructurados y landings en una entrega separada.
6. Enviar los sitemaps en Search Console y solicitar indexacion de las URLs principales.
7. Medir semanalmente durante 6 a 8 semanas: URLs indexadas, impresiones, consultas sin marca, clics, CTR, posicion y referidos desde CPA.

## Definicion de terminado

- Sitemaps validos y con URLs correctas en ambos tenants.
- `robots.txt`, canonicales y host preferido coherentes.
- Ningun link publico nuevo apunta a `/tournaments/in-progress` u otra ruta inglesa de listado.
- Metadata unica por home, listado y torneo.
- Landings diferenciadas y utiles para jugadores.
- Redirects de CPA mapeados al tenant y torneo correctos.
- Matriz funcional de Fase 0 aprobada antes y despues del despliegue.
- Sin regresiones en autenticacion, inscripciones, gestion, partidos, brackets o resultados.
