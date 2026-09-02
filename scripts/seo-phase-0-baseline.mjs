const tenantDefinitions = {
  "padel-fv": {
    domain: process.env.SEO_BASELINE_FV_URL || "https://www.padelfv.com",
    publicTournamentSlugs: [
      "lasaigues-caballito-almagro-agosto-c4",
      "lasaigues-canning-c5",
    ],
  },
  "padel-elite": {
    domain: process.env.SEO_BASELINE_ELITE_URL || "https://www.tpepadel.com",
    publicTournamentSlugs: [
      "americano-c6-nova-padel-center-02-septiembre",
      "americano-c8-punto-de-oro-club-27-agosto",
    ],
  },
}

const selectedTenant = process.argv[2] || "all"

if (selectedTenant !== "all" && !(selectedTenant in tenantDefinitions)) {
  console.error("Uso: npm run seo:baseline -- [padel-fv|padel-elite|all]")
  process.exit(1)
}

const getAttribute = (tag, attribute) => {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']*)["']`, "i"))
  return match?.[1] || "—"
}

const getTag = (html, tagName, attribute, value) => {
  const tags = html.match(new RegExp(`<${tagName}\\b[^>]*>`, "gi")) || []
  return tags.find((tag) => getAttribute(tag, attribute).toLowerCase() === value.toLowerCase()) || ""
}

const inspectPage = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "PadelSEOPhase0Baseline/1.0" },
    redirect: "follow",
  })
  const html = await response.text()
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1].replace(/\s+/g, " ").trim() || "—"
  const description = getAttribute(getTag(html, "meta", "name", "description"), "content")
  const canonical = getAttribute(getTag(html, "link", "rel", "canonical"), "href")
  const robots = getAttribute(getTag(html, "meta", "name", "robots"), "content")

  return {
    url,
    status: response.status,
    title,
    description,
    canonical,
    robots,
  }
}

const inspectTextResource = async (url) => {
  const response = await fetch(url, {
    headers: { "user-agent": "PadelSEOPhase0Baseline/1.0" },
    redirect: "follow",
  })
  const body = await response.text()
  const urlCount = (body.match(/<url(?:\s|>)/gi) || []).length

  return { url, status: response.status, urlCount, body }
}

const printPageTable = (pages) => {
  console.log("| URL | HTTP | title | description | canonical | robots |")
  console.log("| --- | --- | --- | --- | --- | --- |")

  for (const page of pages) {
    console.log(
      `| ${page.url} | ${page.status} | ${page.title} | ${page.description} | ${page.canonical} | ${page.robots} |`,
    )
  }
}

const run = async () => {
  const tenantKeys = selectedTenant === "all" ? Object.keys(tenantDefinitions) : [selectedTenant]
  let hasRequestError = false

  for (const tenantKey of tenantKeys) {
    const tenant = tenantDefinitions[tenantKey]
    const domain = tenant.domain.replace(/\/$/, "")
    const pagePaths = ["/", "/torneos", ...tenant.publicTournamentSlugs.map((slug) => `/torneos/${slug}`)]

    console.log(`\n## ${tenantKey} (${domain})`)

    try {
      const pages = await Promise.all(pagePaths.map((path) => inspectPage(`${domain}${path}`)))
      printPageTable(pages)

      const [sitemap, robots] = await Promise.all([
        inspectTextResource(`${domain}/sitemap.xml`),
        inspectTextResource(`${domain}/robots.txt`),
      ])

      console.log(`sitemap.xml: HTTP ${sitemap.status}; URLs declaradas: ${sitemap.urlCount}`)
      console.log(`robots.txt: HTTP ${robots.status}`)
    } catch (error) {
      hasRequestError = true
      console.error(`No se pudo relevar ${tenantKey}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (hasRequestError) process.exitCode = 1
}

run()
